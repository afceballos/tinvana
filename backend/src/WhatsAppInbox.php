<?php
declare(strict_types=1);
namespace App;

/**
 * WhatsApp inbox (stage 2): turns stored webhook events into contacts, conversations and messages, sends manual
 * replies through the Cloud API and lets an advisor take or return a chat.
 * - Processing is idempotent: one message per wamid, statuses only move forward, a repeated event changes nothing.
 * - One sender per conversation: an advisor writes only after taking the chat (owner_mode=human); nothing returns
 *   a chat to the AI except the explicit "return" action.
 * - The 24-hour customer service window is checked on the server right before each send.
 * - Every change to a conversation bumps updated_at, which the panel uses as a cheap change stamp for polling.
 */
final class WhatsAppInbox {
 public const WINDOW_SECONDS=86400;
 public const MAX_TEXT=4096; // Meta: text.body up to 4096 characters.
 private const STATUS_RANK=['queued'=>0,'sent'=>1,'delivered'=>2,'read'=>3,'played'=>4];
 private const RETRY_MINUTES=15; // a status may arrive before its outgoing message is stored

 /**
  * Processes due webhook events, then lets the AI agent answer the conversations that are waiting for it.
  * Safe to run from several processes at once (event claims and a per-conversation lock).
  */
 public static function work(int $limit=20,int $agentLimit=5): array {
  $out=['done'=>0,'ignored'=>0,'retry'=>0,'failed'=>0];
  for($i=0;$i<$limit;$i++){
   $db=Database::connection();$db->beginTransaction();
   try{
    // A pending event with locked_at is waiting to be retried: it is skipped for 30 seconds so it cannot block newer events.
    $e=Database::one("SELECT * FROM whatsapp_events e WHERE (e.status='pending' AND (e.locked_at IS NULL OR e.locked_at<now()-interval '30 seconds')) OR (e.status='processing' AND e.locked_at<now()-interval '3 minutes') ORDER BY e.received_at FOR UPDATE OF e SKIP LOCKED LIMIT 1");
    if(!$e){$db->commit();break;}
    Database::query("UPDATE whatsapp_events SET status='processing',locked_at=now(),attempts=attempts+1 WHERE id=?",[$e['id']]);$db->commit();
   }catch(\Throwable $t){if($db->inTransaction())$db->rollBack();throw $t;}
   try{
    $payload=json_decode((string)$e['payload'],true);$payload=is_array($payload)?$payload:[];
    $result=match(true){$e['user_id']===null=>'ignored',$e['kind']==='message'=>self::inbound((string)$e['user_id'],$payload),$e['kind']==='status'=>self::status((string)$e['user_id'],$payload),default=>'ignored'};
    if($result==='retry'&&strtotime((string)$e['received_at'])<time()-self::RETRY_MINUTES*60)$result='ignored';
    if($result==='retry')Database::query("UPDATE whatsapp_events SET status='pending',locked_at=now() WHERE id=?",[$e['id']]);
    else Database::query('UPDATE whatsapp_events SET status=?,locked_at=NULL,processed_at=now(),error=NULL WHERE id=?',[$result,$e['id']]);
    $out[$result]++;
   }catch(\Throwable $t){
    // The stored error never includes message contents or phone numbers.
    $final=(int)$e['attempts']+1>=5;error_log('WhatsApp event '.$e['id'].': '.get_class($t));
    Database::query('UPDATE whatsapp_events SET status=?,locked_at=now(),error=? WHERE id=?',[$final?'failed':'pending','Error al procesar ('.get_class($t).').',$e['id']]);
    $out[$final?'failed':'retry']++;
   }
  }
  return $out+['agent'=>WhatsAppAgent::runDue($agentLimit)];
 }

 /** @return array{0:string,1:string} type and visible text of an incoming message */
 private static function content(array $m): array {
  $type=is_string($m['type']??null)?mb_substr($m['type'],0,32):'unknown';
  $text=match($type){
   'text'=>$m['text']['body']??'',
   'button'=>$m['button']['text']??'',
   'interactive'=>$m['interactive']['button_reply']['title']??$m['interactive']['list_reply']['title']??'',
   'reaction'=>$m['reaction']['emoji']??'',
   'image','video','document'=>$m[$type]['caption']??'',
   default=>''
  };
  return [$type,mb_substr(is_string($text)?$text:'',0,self::MAX_TEXT)];
 }
 private static function instant(mixed $ts): string {
  $t=is_numeric($ts)?(int)$ts:0;if($t<=0||$t>time()+300)$t=time();
  return (string)Database::timestamp(gmdate('Y-m-d\TH:i:s\Z',$t));
 }
 private static function inbound(string $owner,array $p): string {
  $m=is_array($p['message']??null)?$p['message']:[];$from=is_string($m['from']??null)?$m['from']:'';$wamid=is_string($m['id']??null)?$m['id']:'';
  $phoneId=(string)($p['metadata']['phone_number_id']??'');$account=$phoneId!==''?WhatsAppAccount::byPhoneNumberId($phoneId):null;
  if(!$account||$account['user_id']!==$owner||!preg_match('/^[0-9]{6,20}$/D',$from)||$wamid==='')return 'ignored';
  $name=null;foreach(is_array($p['contacts']??null)?$p['contacts']:[] as $c)if(is_array($c)&&($c['wa_id']??null)===$from&&is_string($c['profile']['name']??null))$name=mb_substr(trim($c['profile']['name']),0,200)?:null;
  [$type,$body]=self::content($m);$at=self::instant($m['timestamp']??null);
  // Meta gives whole seconds: a message received right away is ordered by arrival (so it never shows before our reply
  // sent in the same second); a delayed redelivery keeps its original time. The 24-hour window always uses Meta's time.
  $shown=abs(time()-strtotime($at))<120?(string)Database::timestamp(gmdate('Y-m-d\TH:i:s').sprintf('.%06d',(int)(fmod(microtime(true),1)*1e6)).'Z'):$at;$referral=is_array($m['referral']??null)?$m['referral']:null;
  $db=Database::connection();$db->beginTransaction();
  try{
   if(Database::one('SELECT id FROM whatsapp_messages WHERE wamid=?',[$wamid])){$db->commit();return 'done';}
   $contact=self::contact($owner,$from,$name,$referral,$at);
   $conv=Database::one('SELECT * FROM whatsapp_conversations WHERE account_id=? AND contact_id=? FOR UPDATE',[$account['id'],$contact]);
   if(!$conv){
    $id=Support::uuid();
    // Without an active agent the chat starts with an advisor, so nobody waits for an AI that will not answer.
    [$mode,$reason]=WhatsAppAgent::initialMode($owner);
    Database::query("INSERT INTO whatsapp_conversations(id,user_id,account_id,contact_id,captured,owner_mode,handoff_reason) VALUES(?,?,?,?,?::jsonb,?,?)",[$id,$owner,$account['id'],$contact,'{}',$mode,$reason]);
    $conv=Database::one('SELECT * FROM whatsapp_conversations WHERE id=? FOR UPDATE',[$id]);
    if($mode==='human')Notifications::notify($owner,'new_chat',WhatsAppAgent::who(['profile_name'=>$name,'phone'=>$from]).' escribió por WhatsApp',(string)$reason,'/panel/whatsapp/'.$id,$id);
   }
   Database::query("INSERT INTO whatsapp_messages(id,user_id,conversation_id,direction,type,body,payload,wamid,status,sender,created_at) VALUES(?,?,?,'in',?,?,?::jsonb,?,'received','customer',?)",
    [Support::uuid(),$owner,$conv['id'],$type,$body,Support::json($m),$wamid,$shown]);
   // Ad or offer code of this entry (stage 4); every entry is recorded separately.
   WhatsAppOffers::resolveEntry($owner,$conv,$body,$referral,$at);
   $newer=fn(?string $current)=>$current===null||strtotime($current)<strtotime($at);
   Database::query('UPDATE whatsapp_conversations SET last_customer_at=?,last_message_at=?,unread=unread+1,customer_seq=customer_seq+1,updated_at=now() WHERE id=?',
    [$newer($conv['last_customer_at'])?$at:Database::timestamp((string)$conv['last_customer_at']),$newer($conv['last_message_at'])?$at:Database::timestamp((string)$conv['last_message_at']),$conv['id']]);
   $db->commit();
  }catch(\Throwable $t){if($db->inTransaction())$db->rollBack();throw $t;}
  return 'done';
 }
 private static function contact(string $owner,string $phone,?string $name,?array $referral,string $at): string {
  $row=Database::one('SELECT id,profile_name,first_origin FROM whatsapp_contacts WHERE user_id=? AND phone=? FOR UPDATE',[$owner,$phone]);
  if($row){
   if($name!==null&&$name!==$row['profile_name'])Database::query('UPDATE whatsapp_contacts SET profile_name=?,updated_at=now() WHERE id=?',[$name,$row['id']]);
   return (string)$row['id'];
  }
  $id=Support::uuid();
  // The first ad or post that brought the person is kept for the ads stage; later entries do not overwrite it.
  Database::query('INSERT INTO whatsapp_contacts(id,user_id,phone,profile_name,first_origin) VALUES(?,?,?,?,?::jsonb)',[$id,$owner,$phone,$name,$referral?Support::json(['referral'=>$referral,'at'=>$at]):null]);
  return $id;
 }
 private static function status(string $owner,array $p): string {
  $st=is_array($p['status']??null)?$p['status']:[];$wamid=is_string($st['id']??null)?$st['id']:'';$new=is_string($st['status']??null)?$st['status']:'';
  if($wamid===''||!in_array($new,['sent','delivered','read','played','failed'],true))return 'ignored';
  $msg=Database::one('SELECT id,status,conversation_id FROM whatsapp_messages WHERE wamid=? AND user_id=?',[$wamid,$owner]);
  if(!$msg)return 'retry';
  $current=(string)$msg['status'];$at=self::instant($st['timestamp']??null);
  if($new==='failed'){
   if(in_array($current,['delivered','read','played','failed'],true))return 'done';
   $err=is_array($st['errors'][0]??null)?$st['errors'][0]:[];
   Database::query("UPDATE whatsapp_messages SET status='failed',error=?,status_at=? WHERE id=?",[self::metaError($err),$at,$msg['id']]);
  }elseif(isset(self::STATUS_RANK[$current])&&self::STATUS_RANK[$new]>self::STATUS_RANK[$current]){
   Database::query('UPDATE whatsapp_messages SET status=?,status_at=? WHERE id=?',[$new,$at,$msg['id']]);
  }else return 'done';
  Database::query('UPDATE whatsapp_conversations SET updated_at=now() WHERE id=?',[$msg['conversation_id']]);
  return 'done';
 }
 /** Meta error to a short Spanish explanation; never includes the message text. */
 private static function metaError(array $e): string {
  $code=(int)($e['code']??0);
  $known=[131047=>'Pasaron más de 24 horas desde el último mensaje del cliente: solo se pueden enviar plantillas aprobadas.',131026=>'El destinatario no puede recibir el mensaje (número sin WhatsApp o versión no compatible).',131049=>'Meta no entregó el mensaje para cuidar la experiencia del usuario. Intenta más tarde.',131051=>'Tipo de mensaje no compatible.',130472=>'El número del cliente participa en un experimento de Meta y no recibió el mensaje.',131050=>'El cliente pidió dejar de recibir mensajes de marketing.'];
  $title=is_string($e['title']??null)?mb_substr($e['title'],0,160):'';
  return $known[$code]??('Meta no pudo entregar el mensaje'.($code?' (código '.$code.')':'').($title!==''?': '.$title:'').'.');
 }

 // ---- Panel ----

 private static function owned(string $owner,string $id,bool $lock=false): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Conversación no encontrada.');
  $c=Database::one('SELECT c.*,ct.phone,ct.profile_name,ct.first_origin,ct.created_at AS contact_since FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id AND ct.user_id=c.user_id WHERE c.id=? AND c.user_id=?'.($lock?' FOR UPDATE':''),[$id,$owner]);
  if(!$c)throw new HttpError(404,'Conversación no encontrada.');return $c;
 }
 public static function windowOpen(?string $lastCustomer): bool {return $lastCustomer!==null&&strtotime($lastCustomer)>time()-self::WINDOW_SECONDS;}
 private static function summary(array $c,?array $last): array {
  return ['id'=>$c['id'],'name'=>$c['profile_name'],'phone'=>$c['phone'],'owner_mode'=>$c['owner_mode'],'handoff_reason'=>$c['handoff_reason'],'unread'=>(int)$c['unread'],'stage'=>$c['stage'],
   'last_message_at'=>$c['last_message_at'],'last_customer_at'=>$c['last_customer_at'],'window_open'=>self::windowOpen($c['last_customer_at']),
   'window_closes_at'=>$c['last_customer_at']?gmdate('Y-m-d\TH:i:s\Z',strtotime((string)$c['last_customer_at'])+self::WINDOW_SECONDS):null,'version'=>(int)$c['version'],
   'last'=>$last?['body'=>mb_substr((string)$last['body'],0,140),'type'=>$last['type'],'sender'=>$last['sender'],'direction'=>$last['direction'],'status'=>$last['status']]:null];
 }
 /** Inbox list with filters and counters. Returns {unchanged:true} when the stamp did not change (polling). */
 public static function list(string $owner,array $q): array {
  $filter=in_array($q['filter']??'',['ai','human','unread'],true)?$q['filter']:'all';$search=trim(is_string($q['q']??null)?mb_substr($q['q'],0,60):'');
  $agg=Database::one('SELECT COUNT(*) AS n,MAX(updated_at) AS changed FROM whatsapp_conversations WHERE user_id=?',[$owner]);
  $stamp=hash('sha256',$filter.'|'.$search.'|'.$agg['n'].'|'.$agg['changed']);
  if(($q['stamp']??'')===$stamp)return ['unchanged'=>true,'stamp'=>$stamp];
  $where=['c.user_id=?'];$args=[$owner];
  if($filter==='ai')$where[]="c.owner_mode='ai'";elseif($filter==='human')$where[]="c.owner_mode='human'";elseif($filter==='unread')$where[]='c.unread>0';
  if($search!==''){$like='%'.strtr($search,['\\'=>'\\\\','%'=>'\%','_'=>'\_']).'%';$where[]='(ct.profile_name ILIKE ? OR ct.phone LIKE ?)';$args[]=$like;$args[]=$like;}
  $rows=Database::all('SELECT c.*,ct.phone,ct.profile_name FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id AND ct.user_id=c.user_id WHERE '.implode(' AND ',$where).' ORDER BY c.last_message_at DESC,c.updated_at DESC,c.id LIMIT 100',$args);
  $last=[];
  if($rows){
   $ids=array_column($rows,'id');
   foreach(Database::all('SELECT m.conversation_id,m.body,m.type,m.sender,m.direction,m.status,m.created_at,m.id FROM whatsapp_messages m WHERE m.user_id=? AND m.conversation_id IN ('.implode(',',array_fill(0,count($ids),'?')).') AND m.created_at=(SELECT MAX(x.created_at) FROM whatsapp_messages x WHERE x.conversation_id=m.conversation_id) ORDER BY m.id',array_merge([$owner],$ids)) as $m)$last[$m['conversation_id']]??=$m;
  }
  $since=(new \DateTimeImmutable('today',new \DateTimeZone('America/Bogota')))->format(\DateTimeInterface::ATOM);
  $s=Database::one("SELECT COUNT(*) AS total,SUM(CASE WHEN last_message_at>=? THEN 1 ELSE 0 END) AS today,SUM(CASE WHEN owner_mode='ai' THEN 1 ELSE 0 END) AS ai,SUM(CASE WHEN owner_mode='human' THEN 1 ELSE 0 END) AS human,SUM(CASE WHEN unread>0 THEN 1 ELSE 0 END) AS unread FROM whatsapp_conversations WHERE user_id=?",[Database::timestamp($since),$owner]);
  return ['stamp'=>$stamp,'conversations'=>array_map(fn($c)=>self::summary($c,$last[$c['id']]??null),$rows),'counts'=>array_map('intval',['total'=>$s['total']??0,'today'=>$s['today']??0,'ai'=>$s['ai']??0,'human'=>$s['human']??0,'unread'=>$s['unread']??0]),'connected'=>WhatsAppAccount::ofUser($owner)!==null];
 }
 private static function messageView(array $m): array {
  return ['id'=>$m['id'],'direction'=>$m['direction'],'type'=>$m['type'],'body'=>$m['body'],'status'=>$m['status'],'sender'=>$m['sender'],'error'=>$m['error'],'created_at'=>$m['created_at'],'status_at'=>$m['status_at'],
   'supported'=>in_array($m['type'],['text','button','interactive','reaction'],true)||$m['direction']==='out'];
 }
 /** One conversation with its latest messages. Returns {unchanged:true} when nothing changed since the stamp. */
 public static function detail(string $owner,string $id,array $q): array {
  $c=self::owned($owner,$id);$stamp=hash('sha256',(string)$c['updated_at'].'|'.$c['version']);
  if(($q['stamp']??'')===$stamp)return ['unchanged'=>true,'stamp'=>$stamp];
  $rows=array_reverse(Database::all('SELECT * FROM whatsapp_messages WHERE conversation_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 200',[$c['id'],$owner]));
  $origin=$c['first_origin']?json_decode((string)$c['first_origin'],true):null;
  $product=null;if($c['product_id']){$p=Database::one('SELECT mapped_data FROM selected_products WHERE id=? AND user_id=?',[$c['product_id'],$owner]);if($p){$m=json_decode((string)$p['mapped_data'],true);$product=['id'=>$c['product_id'],'name'=>is_string($m['name']??null)?$m['name']:'Producto','sheet_version'=>$c['sheet_version']!==null?(int)$c['sheet_version']:null];}}
  $captured=json_decode((string)$c['captured'],true);$fields=[];foreach(WhatsAppAgent::CAPTURE as $k=>$label)if(is_string($captured[$k]??null)&&$captured[$k]!=='')$fields[]=['key'=>$k,'label'=>$label,'value'=>$captured[$k]];
  // Origin of the current entry: ad (with its name and id), verified landing code or typed code, and its certainty.
  $entry=null;
  if($c['offer_method']){
   $ad=$c['ad_ref']?Database::one('SELECT name,ad_id FROM whatsapp_ads WHERE id=? AND user_id=?',[$c['ad_ref'],$owner]):null;$offer=WhatsAppOffers::forConversation($owner,$c);
   $entry=['method'=>$c['offer_method'],'method_label'=>WhatsAppOffers::METHODS[$c['offer_method']]??$c['offer_method'],'certainty'=>$c['offer_certainty'],'ad'=>$ad?['name'=>$ad['name'],'ad_id'=>$ad['ad_id']]:null,
    'offer'=>$offer?['name'=>$offer['name'],'code'=>$offer['code'],'label'=>$offer['label'],'version'=>$c['offer_version']!==null?(int)$c['offer_version']:null]:null];
  }
  return ['stamp'=>$stamp,'conversation'=>self::summary($c,null)+['contact_since'=>$c['contact_since'],'has_referral'=>is_array($origin)&&isset($origin['referral']),'product'=>$product,'captured'=>$fields,'ai_tokens'=>(int)$c['ai_tokens'],'entry'=>$entry],'messages'=>array_map(self::messageView(...),$rows)];
 }
 public static function markRead(string $owner,string $id): array {
  $c=self::owned($owner,$id);if((int)$c['unread']>0)Database::query('UPDATE whatsapp_conversations SET unread=0,updated_at=now() WHERE id=?',[$c['id']]);
  return ['ok'=>true];
 }
 /** Take (human) or return (ai) a chat. The version guards against acting on a stale screen. */
 public static function assign(string $owner,string $id,string $mode,mixed $version): array {
  if(!is_int($version))throw new HttpError(422,'Falta la versión de la conversación.');
  $c=self::owned($owner,$id);
  if($c['owner_mode']===$mode)throw new HttpError(409,$mode==='human'?'Ya tomaste esta conversación.':'La conversación ya está con la IA.');
  if($mode==='ai'&&($why=WhatsAppAgent::unavailable($owner)))throw new HttpError(409,'No se puede devolver a la IA: '.$why.'.');
  $done=Database::query('UPDATE whatsapp_conversations SET owner_mode=?,handoff_reason=?,version=version+1,updated_at=now() WHERE id=? AND user_id=? AND version=?',
   [$mode,$mode==='human'?'Tomada por un asesor':null,$c['id'],$owner,$version])->rowCount();
  if($done!==1)throw new HttpError(409,'La conversación cambió mientras la veías. Revisa los últimos mensajes y vuelve a intentarlo.');
  return self::detail($owner,$c['id'],[]);
 }
 /** Manual reply from the panel. Idempotent per client_id: repeating the request never sends twice. */
 public static function reply(string $owner,string $id,array $b): array {
  $clientId=$b['client_id']??null;if(!is_string($clientId)||!Support::isUuid($clientId))throw new HttpError(422,'Falta el identificador del mensaje.');
  $text=is_string($b['body']??null)?trim($b['body']):'';
  if($text==='')throw new HttpError(422,'Escribe un mensaje.');if(mb_strlen($text)>self::MAX_TEXT)throw new HttpError(422,'El mensaje supera los '.self::MAX_TEXT.' caracteres que permite WhatsApp.');
  $c=self::owned($owner,$id);
  $existing=Database::one('SELECT * FROM whatsapp_messages WHERE id=?',[$clientId]);
  if($existing){if($existing['user_id']!==$owner||$existing['conversation_id']!==$c['id'])throw new HttpError(409,'Identificador de mensaje repetido.');return ['message'=>self::messageView($existing)];}
  if($c['owner_mode']!=='human')throw new HttpError(409,'Toma la conversación para responder: así la IA y los mensajes automáticos no escriben al mismo tiempo.');
  if(!self::windowOpen($c['last_customer_at']))throw new HttpError(409,'La ventana de 24 horas está cerrada: WhatsApp solo permite enviar plantillas aprobadas hasta que el cliente vuelva a escribir.');
  $account=Database::one('SELECT * FROM whatsapp_accounts WHERE id=? AND user_id=?',[$c['account_id'],$owner]);
  if(!$account)throw new HttpError(409,'El número de WhatsApp ya no está conectado.');
  Auth::limit('whatsapp-send:'.$owner,120,600);
  try{$message=self::sendText($account,$c,$text,'agent',$owner,$clientId);}
  catch(\PDOException){$again=Database::one('SELECT * FROM whatsapp_messages WHERE id=? AND user_id=?',[$clientId,$owner]);if($again)return ['message'=>self::messageView($again)];throw new HttpError(409,'No se pudo registrar el mensaje.');}
  return ['message'=>self::messageView($message)];
 }
 /**
  * Stores and sends one text message (advisor or AI). The row exists before the call to Meta, so a repeated request
  * with the same id never sends twice. No automatic retry: with a timeout or a server error Meta may still have
  * delivered it. The caller checks the sender rule and the 24-hour window first.
  */
 public static function sendText(array $account,array $c,string $text,string $sender,?string $author,?string $id=null,int $tokens=0): array {
  return self::sendGraph($account,$c,['messaging_product'=>'whatsapp','recipient_type'=>'individual','to'=>$c['phone'],'type'=>'text','text'=>['preview_url'=>false,'body'=>$text]],'text',$text,$sender,$author,$id,$tokens);
 }
 /**
  * Writes first (new chat) or after the 24-hour window with an approved template. The store confirms that the customer
  * gave permission to be contacted by WhatsApp. A new chat starts with the advisor.
  */
 public static function sendTemplate(string $owner,array $b,?string $conversationId=null): array {
  if(($b['consent']??false)!==true)throw new HttpError(422,'Confirma que el cliente te dio permiso para escribirle por WhatsApp.');
  $t=WhatsAppTemplates::approved($owner,is_string($b['template_id']??null)?$b['template_id']:'');
  $account=WhatsAppAccount::ofUser($owner);if(!$account||$account['id']!==$t['account_id'])throw new HttpError(409,'La plantilla no pertenece al número conectado.');
  $values=is_array($b['values']??null)?$b['values']:[];
  if($conversationId)$c=self::owned($owner,$conversationId);
  else{
   $phone=preg_replace('/\D/','',is_string($b['phone']??null)?$b['phone']:'');if(strlen($phone)===10&&$phone[0]==='3')$phone='57'.$phone;
   if(!preg_match('/^[1-9][0-9]{7,14}$/D',$phone))throw new HttpError(422,'Escribe el número con indicativo, por ejemplo +57 300 123 4567.');
   $name=is_string($b['name']??null)&&trim($b['name'])!==''?mb_substr(trim($b['name']),0,200):null;
   WhatsAppTemplates::build($t,$values,$phone);
   $db=Database::connection();$db->beginTransaction();
   try{
    $contact=self::contact($owner,$phone,$name,null,(string)Database::timestamp(gmdate('Y-m-d\TH:i:s\Z')));
    $conv=Database::one('SELECT id FROM whatsapp_conversations WHERE account_id=? AND contact_id=?',[$account['id'],$contact]);
    if(!$conv){$id=Support::uuid();Database::query("INSERT INTO whatsapp_conversations(id,user_id,account_id,contact_id,captured,owner_mode,handoff_reason) VALUES(?,?,?,?,?::jsonb,'human','Chat iniciado por la tienda')",[$id,$owner,$account['id'],$contact,'{}']);$conv=['id'=>$id];}
    $db->commit();
   }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
   $c=self::owned($owner,(string)$conv['id']);
  }
  Auth::limit('whatsapp-template-send:'.$owner,60,3600);
  $msg=WhatsAppTemplates::build($t,$values,(string)$c['phone']);
  $sent=self::sendGraph($account,$c,$msg['graph'],'template',$msg['text'],'template',$owner,null,0,['template'=>$t['name'],'language'=>$t['language']]);
  return ['conversation_id'=>$c['id'],'message'=>self::messageView($sent)];
 }
 /** Same as sendText for any Graph message body (templates): stored first, sent once, never retried blindly. */
 public static function sendGraph(array $account,array $c,array $graph,string $type,string $text,string $sender,?string $author,?string $id=null,int $tokens=0,?array $payload=null): array {
  $id??=Support::uuid();$owner=(string)$account['user_id'];
  Database::query("INSERT INTO whatsapp_messages(id,user_id,conversation_id,direction,type,body,payload,status,sender,author_id,tokens) VALUES(?,?,?,'out',?,?,?::jsonb,'queued',?,?,?)",[$id,$owner,$c['id'],$type,$text,$payload?Support::json($payload):null,$sender,$author,$tokens]);
  Database::query('UPDATE whatsapp_conversations SET last_message_at=now(),unread=0,updated_at=now() WHERE id=?',[$c['id']]);
  $r=WhatsAppGraph::request('POST',rawurlencode((string)$account['phone_number_id']).'/messages',WhatsAppAccount::token($account),$graph,20);
  $wamid=$r['json']['messages'][0]['id']??null;
  if($r['status']===200&&is_string($wamid)&&$wamid!==''){
   Database::query('UPDATE whatsapp_messages SET wamid=?,status_at=now() WHERE id=?',[mb_substr($wamid,0,255),$id]);
  }else{
   $unknown=$r['errno']!==0||$r['status']>=500||$r['status']===0;
   $error=$unknown?'No se confirmó el envío. Revisa en WhatsApp si llegó antes de escribirlo de nuevo.':(is_array($r['json']['error']??null)?self::metaError($r['json']['error']):WhatsAppGraph::error($r));
   Database::query("UPDATE whatsapp_messages SET status='failed',error=?,status_at=now() WHERE id=?",[$error,$id]);
  }
  Database::query('UPDATE whatsapp_conversations SET updated_at=now() WHERE id=?',[$c['id']]);
  return (array)Database::one('SELECT * FROM whatsapp_messages WHERE id=?',[$id]);
 }
}
