<?php
declare(strict_types=1);
namespace App;

/**
 * Order confirmation by WhatsApp for landing orders.
 * - A new landing order is queued when the store turned it on. The worker quotes it with the landing price and the
 *   freight Dropi quoted at submission (never invented: without freight or with variants to choose it is skipped, and
 *   the store sends it from the order after quoting by hand).
 * - Customer first (default): the success popup opens WhatsApp with a short code (TV-XXXXXX). When the customer sends
 *   it, the 24-hour window is open and the summary goes out as an interactive reply buttons message, no template.
 *   If the customer does not write within the store's wait, the approved template is the fallback (when there is one).
 * - Both carry one id per button: "Confirmar pedido" and "Cambiar algo". A tap comes back as a "button" (template) or
 *   "interactive" button_reply message whose context.id must be the wamid of that message; that tap is the evidence.
 * - Confirming checks that the order still has the same quote and version; anything else hands the chat to an advisor.
 * - By default the confirmed order waits for manual review; the store can send it to Dropi automatically (pending
 *   confirmation in Dropi, the same as the manual button). The template is never resent automatically.
 */
final class WhatsAppOrderConfirm {
 /** Template variables Tinvana knows how to fill from an order. */
 public const VALUES=['nombre'=>'Nombre del cliente','apellido'=>'Apellido','producto'=>'Producto','variante'=>'Variante','cantidad'=>'Cantidad','precio'=>'Precio por unidad','envio'=>'Envío','total'=>'Total con envío','direccion'=>'Dirección','ciudad'=>'Ciudad','departamento'=>'Departamento','pedido'=>'Número de pedido','tienda'=>'Nombre de la tienda'];
 public const WAITS=[5,10,15,30,60,120];
 public const BUILT_IN=['enabled'=>false,'customer_first'=>true,'wait_minutes'=>15,'template_id'=>null,'auto_dropi'=>false,'messages'=>[
  'confirmed'=>'¡Gracias! Tu pedido quedó confirmado ✅. Ya lo estamos preparando para enviarlo.',
  'change'=>'Claro, cuéntanos qué quieres cambiar y un asesor te ayuda enseguida.',
 ]];
 private const STALE='Tu pedido cambió después de enviarte el resumen. Un asesor te escribe en un momento para confirmarlo.';
 private const PAYLOAD_RE='/^tvc:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(ok|change)$/D';
 private const SENDING_MINUTES=5;
 // Code the customer sends from the popup; no 0/O/1/I/L so it can be read and typed without mistakes.
 private const CODE_CHARS='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
 private const CODE_RE='/\bTV-([ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6})\b/i';
 private const BUTTONS=['Confirmar pedido','Cambiar algo'];
 private const SUMMARY="Hola {{nombre}}, este es el resumen de tu pedido:\n{{producto}} ({{cantidad}} und.)\nTotal con envío: {{total}}\nEntrega en {{direccion}}, {{ciudad}}.\n¿Lo confirmamos?";

 // ---- Settings ----

 public static function settings(string $owner): array {
  $row=Database::one('SELECT settings FROM whatsapp_confirm_settings WHERE user_id=?',[$owner]);$s=self::BUILT_IN;
  $saved=$row?json_decode((string)$row['settings'],true):null;
  if(is_array($saved)){
   foreach(['enabled','customer_first','auto_dropi'] as $k)if(is_bool($saved[$k]??null))$s[$k]=$saved[$k];
   if(in_array($saved['wait_minutes']??null,self::WAITS,true))$s['wait_minutes']=$saved['wait_minutes'];
   if(is_string($saved['template_id']??null)&&Support::isUuid($saved['template_id']))$s['template_id']=$saved['template_id'];
   foreach($s['messages'] as $k=>$_)if(is_string($saved['messages'][$k]??null)&&trim($saved['messages'][$k])!=='')$s['messages'][$k]=$saved['messages'][$k];
  }
  return $s;
 }
 /** Why a template cannot confirm orders, or null when it can. */
 public static function ineligible(array $t): ?string {
  if($t['status']!=='APPROVED')return 'Meta todavía no la aprueba';
  if(count(json_decode((string)$t['buttons'],true)?:[])!==2)return 'Necesita exactamente dos botones: el primero confirma y el segundo pide cambios';
  foreach(json_decode((string)$t['variables'],true)?:[] as $v)if(!isset(self::VALUES[$v['key']]))return 'Usa la variable {{'.$v['key'].'}}, que Tinvana no sabe llenar con los datos del pedido';
  return null;
 }
 /** Digits of the connected number for a wa.me link, or null until «Probar conexión» stored it. */
 private static function businessPhone(array $a): ?string {$d=preg_replace('/\D/','',(string)($a['display_phone']??''));return preg_match('/^[1-9][0-9]{7,14}$/D',$d)?$d:null;}
 /**
  * How this store confirms orders, or null when the feature is off or cannot work: settings, account, the usable
  * template (or null) and the business phone for the customer-first link (or null).
  */
 public static function active(string $owner): ?array {
  $s=self::settings($owner);if(!$s['enabled']||!Entitlements::allows($owner,'whatsapp'))return null;
  $a=WhatsAppAccount::ofUser($owner);if(!$a)return null;
  $t=$s['template_id']?Database::one('SELECT * FROM whatsapp_templates WHERE id=? AND user_id=? AND account_id=?',[$s['template_id'],$owner,$a['id']]):null;
  if($t&&self::ineligible($t)!==null)$t=null;
  $phone=$s['customer_first']?self::businessPhone($a):null;
  return $t||$phone?['settings'=>$s,'account'=>$a,'template'=>$t,'phone'=>$phone]:null;
 }
 public static function view(string $owner): array {
  $s=self::settings($owner);$a=WhatsAppAccount::ofUser($owner);
  $templates=$a?Database::all("SELECT * FROM whatsapp_templates WHERE user_id=? AND account_id=? AND status<>'DELETED' ORDER BY created_at DESC",[$owner,$a['id']]):[];
  $recent=Database::all('SELECT c.id,c.order_id,c.status,c.origin,c.error,c.reply,c.conversation_id,c.sent_at,c.replied_at,c.created_at,o.customer,o.product_data,o.quantity FROM whatsapp_order_confirmations c JOIN orders o ON o.id=c.order_id AND o.user_id=c.user_id WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT 20',[$owner]);
  return ['settings'=>$s,'built_in'=>self::BUILT_IN,'connected'=>$a!==null,'active'=>self::active($owner)!==null,'values'=>self::VALUES,'waits'=>self::WAITS,
   'business_phone'=>$a?self::businessPhone($a):null,'summary'=>self::SUMMARY,'buttons'=>self::BUTTONS,
   'templates'=>array_map(fn($t)=>['id'=>$t['id'],'name'=>$t['name'],'status'=>$t['status'],'body'=>$t['body'],'footer'=>$t['footer'],'buttons'=>json_decode((string)$t['buttons'],true)?:[],'purpose'=>$t['purpose'],'problem'=>self::ineligible($t)],$templates),
   'recent'=>array_map(function($r){$c=json_decode((string)$r['customer'],true);$p=json_decode((string)$r['product_data'],true);
    return ['id'=>$r['id'],'order_id'=>$r['order_id'],'status'=>$r['status'],'origin'=>$r['origin'],'error'=>$r['error'],'reply'=>$r['reply'],'conversation_id'=>$r['conversation_id'],'sent_at'=>$r['sent_at'],'replied_at'=>$r['replied_at'],'created_at'=>$r['created_at'],
     'customer'=>trim(($c['first_name']??'').' '.($c['last_name']??'')),'product'=>$p['product_name']??'','quantity'=>(int)$r['quantity']];},$recent)];
 }
 public static function save(string $owner,array $b): array {
  $enabled=$b['enabled']??null;$auto=$b['auto_dropi']??null;$first=$b['customer_first']??null;if(!is_bool($enabled)||!is_bool($auto)||!is_bool($first))throw new HttpError(422,'Ajustes inválidos.');
  $wait=$b['wait_minutes']??null;if(!in_array($wait,self::WAITS,true))throw new HttpError(422,'Elige cuánto esperar a que el cliente escriba.');
  $tid=$b['template_id']??null;if($tid!==null&&(!is_string($tid)||!Support::isUuid($tid)))throw new HttpError(422,'Plantilla inválida.');
  $messages=[];foreach(self::BUILT_IN['messages'] as $k=>$_){$v=is_string($b['messages'][$k]??null)?trim($b['messages'][$k]):'';if($v===''||mb_strlen($v)>500)throw new HttpError(422,'Escribe los mensajes de respuesta (hasta 500 caracteres).');$messages[$k]=$v;}
  if($tid!==null){
   $a=WhatsAppAccount::ofUser($owner);$t=$a?Database::one('SELECT * FROM whatsapp_templates WHERE id=? AND user_id=? AND account_id=?',[$tid,$owner,$a['id']]):null;
   if(!$t)throw new HttpError(422,'Plantilla no encontrada.');
   if($enabled&&($why=self::ineligible($t)))throw new HttpError(422,'Esa plantilla no sirve para confirmar pedidos: '.$why.'.');
  }elseif($enabled&&!$first)throw new HttpError(422,'Sin el botón para que el cliente escriba primero necesitas una plantilla aprobada: elígela antes de activarla.');
  if($enabled&&$first&&!$tid){$a=WhatsAppAccount::ofUser($owner);if(!$a||!self::businessPhone($a))throw new HttpError(422,'Pulsa «Probar conexión» en Conexión para que Tinvana conozca tu número de WhatsApp, o elige una plantilla.');}
  $value=Support::json(['enabled'=>$enabled,'customer_first'=>$first,'wait_minutes'=>$wait,'template_id'=>$tid,'auto_dropi'=>$auto,'messages'=>$messages]);
  if(Database::one('SELECT user_id FROM whatsapp_confirm_settings WHERE user_id=?',[$owner]))Database::query('UPDATE whatsapp_confirm_settings SET settings=?::jsonb,updated_at=now() WHERE user_id=?',[$value,$owner]);
  else Database::query('INSERT INTO whatsapp_confirm_settings(user_id,settings) VALUES(?,?::jsonb)',[$owner,$value]);
  return self::view($owner)+['message'=>'Ajustes guardados.'];
 }

 // ---- Sending ----

 private static function code(string $owner): string {
  for($i=0;$i<10;$i++){$c='';for($j=0;$j<6;$j++)$c.=self::CODE_CHARS[random_int(0,strlen(self::CODE_CHARS)-1)];
   if(!Database::one('SELECT id FROM whatsapp_order_confirmations WHERE user_id=? AND code=?',[$owner,$c]))return $c;}
  throw new \RuntimeException('No se pudo generar el código de confirmación.');
 }
 /**
  * Queues the confirmation of a new landing order (inside the lead transaction). Cheap: the worker sends it.
  * Returns null when off, or the wa.me link for the success popup (null link when the customer-first step is off).
  * @return array{link:?string,code:?string}|null
  */
 public static function queue(array $order): ?array {
  $owner=(string)$order['user_id'];$act=self::active($owner);if(!$act)return null;
  $code=null;$link=null;$wait=0;
  if($act['phone']){
   $code=self::code($owner);$link='https://wa.me/'.$act['phone'].'?text='.rawurlencode('Hola, quiero confirmar mi pedido TV-'.$code);
   // Without a template there is no fallback: the row waits for the customer until the summary would expire.
   $wait=$act['template']?(int)$act['settings']['wait_minutes']:1440;
  }
  Database::query("INSERT INTO whatsapp_order_confirmations(id,user_id,order_id,status,origin,code,send_after) VALUES(?,?,?,'queued','landing',?,now()+(? * interval '1 minute'))",[Support::uuid(),$owner,$order['id'],$code,$wait]);
  return ['link'=>$link,'code'=>$code?'TV-'.$code:null];
 }
 /** Sends queued confirmations and handles the customers' replies. */
 public static function runDue(int $limit=10): array {
  $out=['sent'=>0,'replies'=>0];
  // A send that never finished may have reached Meta: it is not repeated, the store resends it from the order if needed.
  Database::query("UPDATE whatsapp_order_confirmations SET status='failed',error='No se confirmó el envío de la confirmación. Revisa el chat antes de enviarla de nuevo.',locked_at=NULL,updated_at=now() WHERE status='sending' AND locked_at<now()-interval '".self::SENDING_MINUTES." minutes'");
  foreach(Database::all("SELECT id FROM whatsapp_order_confirmations WHERE status='queued' AND (send_after IS NULL OR send_after<=now()) ORDER BY created_at LIMIT ".max(1,min(50,$limit))) as $r){
   try{if(self::send((string)$r['id']))$out['sent']++;}catch(\Throwable $t){error_log('WhatsApp order confirmation '.$r['id'].': '.get_class($t));}
  }
  foreach(Database::all('SELECT id FROM whatsapp_order_confirmations WHERE reply_pending=true ORDER BY replied_at LIMIT '.max(1,min(50,$limit))) as $r){
   try{if(self::reply((string)$r['id']))$out['replies']++;}catch(\Throwable $t){error_log('WhatsApp order confirmation reply '.$r['id'].': '.get_class($t));}
  }
  return $out;
 }
 private static function finish(array $row,string $status,?string $error,array $extra=[]): void {
  $set=['status=?','error=?','locked_at=NULL','updated_at=now()'];$args=[$status,$error===null?null:mb_substr($error,0,500)];
  foreach($extra as $k=>$v){$set[]=$k.'=?';$args[]=$v;}
  $args[]=$row['id'];Database::query('UPDATE whatsapp_order_confirmations SET '.implode(',',$set).' WHERE id=?',$args);
 }
 private static function money(string $v): string {
  [$a,$b]=explode('.',$v);return '$'.number_format((int)$a,0,',','.').((int)$b>0?','.str_pad($b,2,'0'):'');
 }
 private static function add(string $a,string $b,int $times=1): string {
  $c=fn(string $v)=>(int)explode('.',$v)[0]*100+(int)explode('.',$v)[1];$t=$c($a)*$times+$c($b);
  return intdiv($t,100).'.'.str_pad((string)($t%100),2,'0',STR_PAD_LEFT);
 }
 /** Template values of an order; every value comes from the stored quote, never from the browser. */
 public static function values(array $r,array $account): array {
  $c=json_decode((string)$r['customer'],true);$a=json_decode((string)$r['delivery_address'],true);$p=json_decode((string)$r['product_data'],true);$v=json_decode((string)($r['variant_data']??'null'),true);
  return ['nombre'=>trim((string)($c['first_name']??'')),'apellido'=>trim((string)($c['last_name']??'')),'producto'=>(string)($p['product_name']??''),'variante'=>is_array($v)?(string)$v['label']:'Única',
   'cantidad'=>(string)(int)$r['quantity'],'precio'=>self::money((string)$r['unit_price']),'envio'=>(float)$r['shipping_price']==0.0?'Gratis':self::money((string)$r['shipping_price']),
   'total'=>self::money(self::add((string)$r['unit_price'],(string)$r['shipping_price'],(int)$r['quantity'])),
   'direccion'=>trim(($a['address']??'').' '.($a['address_details']??'')),'ciudad'=>(string)($a['city']??''),'departamento'=>(string)($a['state']??''),
   'pedido'=>strtoupper(substr((string)$r['id'],0,8)),'tienda'=>(string)($account['verified_name']?:'nuestra tienda')];
 }
 private static function quoteValid(array $r): bool {return $r['quote_id']!==null&&$r['quote_expires_at']!==null&&strtotime((string)$r['quote_expires_at'])>time()&&$r['shipping_price']!==null&&$r['unit_price']!==null;}
 /** Fills {{key}} variables of a text with the order values. */
 private static function fill(string $text,array $values): string {return (string)preg_replace_callback('/\{\{\s*([a-z][a-z0-9_]{0,29})\s*\}\}/',fn($m)=>$values[$m[1]]??$m[0],$text);}
 /**
  * Sends one queued confirmation. With the 24-hour window open (the customer wrote) it is an interactive reply
  * buttons message; otherwise the approved template. Returns true when Meta accepted it.
  */
 public static function send(string $id): bool {
  if(Database::query("UPDATE whatsapp_order_confirmations SET status='sending',locked_at=now(),updated_at=now() WHERE id=? AND status='queued'",[$id])->rowCount()!==1)return false;
  $row=Database::one('SELECT * FROM whatsapp_order_confirmations WHERE id=?',[$id]);$owner=(string)$row['user_id'];
  $db=Database::connection();
  try{
   $act=self::active($owner);if(!$act)throw new HttpError(409,'La confirmación por WhatsApp está desactivada.');
   $account=$act['account'];$t=$act['template'];
   $db->beginTransaction();
   $r=Orders::owned($owner,(string)$row['order_id'],true);
   if($r['sale_status']!=='draft'||!in_array($r['integration_status'],['not_sent','failed'],true))throw new HttpError(409,'El pedido ya no está en borrador.');
   if(!self::quoteValid($r)){
    if($row['origin']==='manual')throw new HttpError(409,'Guarda una cotización vigente antes de enviar la confirmación.');
    $r=Orders::autoQuote($r);
   }
   $db->commit();
   $values=self::values($r,$account);
   // The chat where the customer sent the code (maybe from another number than the form), else the order's phone.
   $c=$row['conversation_id']?WhatsAppInbox::conversation($owner,(string)$row['conversation_id']):null;
   if(!$c){
    $phone=preg_replace('/\D/','',(string)(json_decode((string)$r['customer'],true)['phone']??''));
    if(!preg_match('/^[1-9][0-9]{7,14}$/D',$phone))throw new HttpError(422,'El teléfono del comprador no sirve para WhatsApp.');
    $existing=Database::one('SELECT c.id FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id WHERE c.user_id=? AND c.account_id=? AND ct.phone=?',[$owner,$account['id'],$phone]);
    $c=$existing?WhatsAppInbox::conversation($owner,(string)$existing['id']):null;
   }
   $open=$c&&WhatsAppInbox::windowOpen($c['last_customer_at']);
   if(!$open&&!$t)throw new HttpError(409,'El cliente no escribió por WhatsApp y no hay una plantilla aprobada para enviarle el resumen.');
   $payloads=['tvc:'.$id.':ok','tvc:'.$id.':change'];
   if($open){
    $text=mb_substr($t?WhatsAppTemplates::build($t,$values,(string)$c['phone'])['text']:self::fill(self::SUMMARY,$values),0,1024);
    $titles=$t?array_map(fn($b)=>mb_substr((string)$b,0,20),json_decode((string)$t['buttons'],true)):self::BUTTONS;
    $footer=$t?(string)$t['footer']:'Pago contra entrega';
    $graph=['messaging_product'=>'whatsapp','recipient_type'=>'individual','to'=>$c['phone'],'type'=>'interactive','interactive'=>['type'=>'button','body'=>['text'=>$text]]
     +($footer!==''?['footer'=>['text'=>mb_substr($footer,0,60)]]:[])+['action'=>['buttons'=>[['type'=>'reply','reply'=>['id'=>$payloads[0],'title'=>$titles[0]]],['type'=>'reply','reply'=>['id'=>$payloads[1],'title'=>$titles[1]]]]]]];
    $msg=['graph'=>$graph,'text'=>$text."\n\n[".$titles[0].'] ['.$titles[1].']'];
   }else $msg=WhatsAppTemplates::build($t,$values,$c?(string)$c['phone']:$phone,$payloads);
  }catch(HttpError $e){
   if($db->inTransaction())$db->rollBack();
   self::finish($row,'skipped',$e->getMessage());
   if($o=Database::one('SELECT * FROM orders WHERE id=?',[$row['order_id']]))Orders::event($o,'whatsapp_confirmation_skipped',['reason'=>$e->getMessage()],null);
   return false;
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();self::finish($row,'failed','No se pudo preparar la confirmación.');throw $e;}
  if(!$c){$name=trim($values['nombre'].' '.$values['apellido']);$c=WhatsAppInbox::conversationFor($owner,$account,$phone,$name!==''?$name:null,'Confirmación del pedido #'.$values['pedido']);}
  $channel=$open?'interactive':'template';
  $sent=WhatsAppInbox::sendGraph($account,$c,$msg['graph'],$channel,$msg['text'],$open?'system':'template',null,null,0,['template'=>$open?null:$t['name'],'order_id'=>$r['id'],'confirmation_id'=>$id]);
  $ok=$sent['status']!=='failed'&&$sent['wamid']!==null;
  self::finish($row,$ok?'sent':'failed',$ok?null:(string)$sent['error'],['conversation_id'=>$c['id'],'message_id'=>$sent['id'],'channel'=>$channel,'quote_id'=>$r['quote_id'],'order_version'=>(int)$r['version'],'sent_at'=>$ok?Database::timestamp(gmdate('c')):null]);
  Orders::event($r,$ok?'whatsapp_confirmation_sent':'whatsapp_confirmation_failed',['conversation_id'=>$c['id'],'quote_id'=>$r['quote_id'],'channel'=>$channel,'template'=>$open?null:$t['name'],'error'=>$ok?null:$sent['error']],null);
  return $ok;
 }

 // ---- Replies ----

 /**
  * Called inside the inbound transaction. Returns true when the message is the customer's tap on a confirmation
  * button (the AI must not answer it). Free text while a confirmation waits in an AI chat goes to an advisor.
  */
 public static function inbound(string $owner,array $conv,array $m,string $type,string $messageId,string $wamid): bool {
  // Template quick reply (button.payload) or interactive reply button (interactive.button_reply.id).
  $id=$type==='button'?($m['button']['payload']??null):($type==='interactive'?($m['interactive']['button_reply']['id']??null):null);
  if(preg_match(self::PAYLOAD_RE,is_string($id)?$id:'',$p)){
   $ctx=is_string($m['context']['id']??null)?$m['context']['id']:'';
   $row=Database::one('SELECT c.id,m.wamid AS sent_wamid FROM whatsapp_order_confirmations c JOIN whatsapp_messages m ON m.id=c.message_id WHERE c.id=? AND c.user_id=? AND c.conversation_id=? FOR UPDATE',[$p[1],$owner,$conv['id']]);
   if($row&&$ctx!==''&&is_string($row['sent_wamid'])&&hash_equals($row['sent_wamid'],$ctx)){
    Database::query('UPDATE whatsapp_order_confirmations SET reply=?,reply_message_id=?,reply_wamid=?,reply_pending=true,replied_at=now(),updated_at=now() WHERE id=?',[$p[2]==='ok'?'confirm':'change',$messageId,mb_substr($wamid,0,255),$row['id']]);
    return true;
   }
  }
  // The code from the success popup: the customer wrote first, so the summary goes out now without a template.
  if($type==='text'&&preg_match(self::CODE_RE,is_string($m['text']['body']??null)?$m['text']['body']:'',$p)){
   $row=Database::one("SELECT id FROM whatsapp_order_confirmations WHERE user_id=? AND code=? AND status='queued' FOR UPDATE",[$owner,strtoupper($p[1])]);
   if($row){
    Database::query("UPDATE whatsapp_order_confirmations SET conversation_id=?,send_after=now(),updated_at=now() WHERE id=?",[$conv['id'],$row['id']]);
    return true;
   }
  }
  if($conv['owner_mode']==='ai'&&($w=Database::one("SELECT order_id FROM whatsapp_order_confirmations WHERE conversation_id=? AND user_id=? AND status='sent' LIMIT 1",[$conv['id'],$owner]))){
   $reason='Respondió con un mensaje a la confirmación del pedido #'.strtoupper(substr((string)$w['order_id'],0,8));
   Database::query("UPDATE whatsapp_conversations SET owner_mode='human',handoff_reason=?,version=version+1,updated_at=now() WHERE id=?",[$reason,$conv['id']]);
   Notifications::notify($owner,'order_change','Un cliente respondió a la confirmación de su pedido',$reason,'/panel/whatsapp/'.$conv['id'],(string)$conv['id']);
  }
  return false;
 }
 private static function handoff(array $c,string $reason): void {
  Database::query("UPDATE whatsapp_conversations SET owner_mode='human',handoff_reason=?,version=version+1,updated_at=now() WHERE id=?",[mb_substr($reason,0,200),$c['id']]);
 }
 private static function say(array $account,array $c,string $text): void {
  // The tap just opened the 24-hour window; the text is automatic, like the handoff notice.
  if(WhatsAppInbox::windowOpen($c['last_customer_at']))WhatsAppInbox::sendText($account,$c,$text,'system',null);
 }
 /** Handles the latest button tap of one confirmation, exactly once. */
 public static function reply(string $id): bool {
  if(Database::query('UPDATE whatsapp_order_confirmations SET reply_pending=false,updated_at=now() WHERE id=? AND reply_pending=true',[$id])->rowCount()!==1)return false;
  $row=Database::one('SELECT * FROM whatsapp_order_confirmations WHERE id=?',[$id]);$owner=(string)$row['user_id'];
  $c=WhatsAppInbox::conversation($owner,(string)$row['conversation_id']);
  $account=Database::one('SELECT * FROM whatsapp_accounts WHERE id=? AND user_id=?',[$c['account_id'],$owner]);
  $s=self::settings($owner);$ref='#'.strtoupper(substr((string)$row['order_id'],0,8));$who=WhatsAppAgent::who($c);$link='/panel/pedidos/'.$row['order_id'];
  if($row['reply']==='change'){
   $o=Database::one('SELECT * FROM orders WHERE id=? AND user_id=?',[$row['order_id'],$owner]);
   if($row['status']!=='confirmed')self::finish($row,'change',null);
   if($o)Orders::event($o,'whatsapp_change_requested',['conversation_id'=>$c['id'],'reply_wamid'=>$row['reply_wamid'],'after_confirmation'=>$row['status']==='confirmed'],null);
   self::handoff($c,'Quiere cambiar algo del pedido '.$ref.($row['status']==='confirmed'?' (ya lo había confirmado)':''));
   Notifications::notify($owner,'order_change',$who.' quiere cambiar algo de su pedido','Pedido '.$ref.'. Revisa el chat y corrige el pedido antes de confirmarlo.','/panel/whatsapp/'.$c['id'],(string)$c['id']);
   if($account)self::say($account,$c,$s['messages']['change']);
   return true;
  }
  if($row['status']==='confirmed')return true; // repeated tap
  $db=Database::connection();$db->beginTransaction();
  try{
   $r=Orders::owned($owner,(string)$row['order_id'],true);
   $same=$r['quote_id']!==null&&$r['quote_id']===$row['quote_id'];
   if($r['sale_status']==='confirmed'&&$same){$outcome='already';}
   elseif($r['sale_status']==='draft'&&$same&&(int)$r['version']===(int)$row['order_version']&&self::quoteValid($r)&&in_array($r['integration_status'],['not_sent','failed'],true)){
    $at=Database::one('SELECT created_at FROM whatsapp_messages WHERE id=?',[$row['reply_message_id']])['created_at']??gmdate('c');
    $when=(new \DateTimeImmutable((string)$at))->setTimezone(new \DateTimeZone('America/Bogota'))->format('Y-m-d H:i');
    $r=Orders::confirmByCustomer($r,['quote_id'=>$r['quote_id'],'quoted_version'=>(int)$r['version'],'evidence'=>'El cliente tocó «Confirmar pedido» en WhatsApp ('.$when.', hora de Colombia) sobre el resumen enviado con la plantilla.',
     'recorded_by'=>null,'recorded_at'=>gmdate('c'),'method'=>'whatsapp_button','confirmation_id'=>$id,'conversation_id'=>$c['id'],'reply_wamid'=>$row['reply_wamid'],
     'template_wamid'=>Database::one('SELECT wamid FROM whatsapp_messages WHERE id=?',[$row['message_id']])['wamid']??null]);
    $outcome='confirmed';
   }else $outcome='stale';
   self::finish($row,$outcome==='stale'?'stale':'confirmed',$outcome==='stale'?'El pedido cambió o la cotización venció antes de que el cliente confirmara.':null);
   if($outcome==='stale')Orders::event($r,'whatsapp_confirmation_stale',['conversation_id'=>$c['id'],'reply_wamid'=>$row['reply_wamid']],null);
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  if($outcome==='stale'){
   self::handoff($c,'Confirmó un resumen del pedido '.$ref.' que ya cambió o venció');
   Notifications::notify($owner,'order_change',$who.' confirmó un resumen que ya no está vigente','Pedido '.$ref.'. Cotízalo de nuevo y envía otra confirmación.',$link,(string)$c['id']);
   if($account)self::say($account,$c,self::STALE);
   return true;
  }
  if($account)self::say($account,$c,$s['messages']['confirmed']);
  if($outcome==='already')return true;
  Notifications::notify($owner,'order_confirmed',$who.' confirmó su pedido por WhatsApp','Pedido '.$ref.($s['auto_dropi']?'. Se envía a Dropi automáticamente.':'. Revísalo y envíalo a Dropi.'),$link,(string)$c['id']);
  if($s['auto_dropi']){
   try{DropiOrders::submit($owner,(string)$r['id'],['confirm'=>true,'version'=>(int)$r['version']],true);}
   catch(HttpError $e){Orders::event($r,'whatsapp_auto_dropi_skipped',['reason'=>$e->getMessage()],null);}
  }
  return true;
 }

 // ---- Order detail ----

 public static function forOrder(array $r): array {
  $row=Database::one('SELECT * FROM whatsapp_order_confirmations WHERE order_id=? AND user_id=?',[$r['id'],$r['user_id']]);
  $owner=(string)$r['user_id'];$active=Entitlements::allows($owner,'whatsapp')?self::active($owner):null;
  $customer=$row&&$row['status']==='queued'&&$row['send_after']!==null&&strtotime((string)$row['send_after'])>time();
  $waiting=$row&&!$customer&&in_array($row['status'],['queued','sending'],true);
  $at=$customer?(new \DateTimeImmutable((string)$row['send_after']))->setTimezone(new \DateTimeZone('America/Bogota'))->format('H:i'):'';
  $current=$row&&$row['status']==='sent'&&$row['quote_id']===$r['quote_id']&&(int)$row['order_version']===(int)$r['version'];
  $editable=$r['sale_status']==='draft'&&in_array($r['integration_status'],['not_sent','failed'],true);
  $hint=match(true){
   !$active=>'Activa la confirmación por WhatsApp en Ventas WhatsApp → Confirmaciones.',
   !$editable=>null,
   $customer=>'Esperando que el cliente escriba por WhatsApp con su código TV-'.$row['code'].'. '.($active['template']?'Si no escribe, se le envía la plantilla a las '.$at.'.':'Sin plantilla aprobada, si no escribe no se le envía nada.'),
   !self::quoteValid($r)=>'Guarda una cotización vigente para enviar el resumen por WhatsApp.',
   $current=>'El cliente ya tiene este resumen. Espera su respuesta en el chat.',
   $waiting=>'Envío en curso.',
   default=>null};
  return ['enabled'=>$active!==null,'status'=>$row['status']??null,'origin'=>$row['origin']??null,'error'=>$row['error']??null,'reply'=>$row['reply']??null,'conversation_id'=>$row['conversation_id']??null,'channel'=>$row['channel']??null,'code'=>isset($row['code'])?'TV-'.$row['code']:null,'waiting_customer'=>$customer,
   'sent_at'=>$row['sent_at']??null,'replied_at'=>$row['replied_at']??null,'can_send'=>$active!==null&&$editable&&self::quoteValid($r)&&!$current&&!$waiting,'hint'=>$hint];
 }
 /** Sends (or resends) the summary of the current quote from the order detail. */
 public static function sendFromOrder(string $owner,string $orderId,array $b): array {
  Entitlements::require($owner,'whatsapp');
  $r=Orders::owned($owner,$orderId);
  if(!isset($b['version'])||!is_int($b['version'])||$b['version']!==(int)$r['version'])throw new HttpError(409,'El pedido cambió. Actualiza el detalle antes de continuar.');
  $state=self::forOrder($r);if(!$state['can_send'])throw new HttpError(409,$state['hint']??'Este pedido no admite enviar la confirmación ahora.');
  Auth::limit('whatsapp-confirm-send:'.$owner,60,3600);
  $row=Database::one('SELECT id FROM whatsapp_order_confirmations WHERE order_id=? AND user_id=?',[$r['id'],$owner]);
  if($row)$id=(string)$row['id'];else{$id=Support::uuid();Database::query("INSERT INTO whatsapp_order_confirmations(id,user_id,order_id,status,origin) VALUES(?,?,?,'skipped','manual')",[$id,$owner,$r['id']]);}
  $claimed=Database::query("UPDATE whatsapp_order_confirmations SET status='queued',origin='manual',error=NULL,reply=NULL,reply_pending=false,reply_message_id=NULL,reply_wamid=NULL,replied_at=NULL,message_id=NULL,sent_at=NULL,send_after=NULL,locked_at=NULL,updated_at=now() WHERE id=? AND (status NOT IN ('queued','sending') OR (status='queued' AND send_after>now()))",[$id])->rowCount();
  if($claimed!==1)throw new HttpError(409,'Ya hay un envío en curso para este pedido.');
  self::send($id);
  return Orders::detail($owner,$r['id']);
 }
}
