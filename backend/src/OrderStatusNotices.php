<?php
declare(strict_types=1);
namespace App;

/**
 * Stage 6A: the customer hears when the Dropi logistics state of the order changes (guide, on its way, novelty,
 * delivered), by email and by WhatsApp; both on by default and switchable per state by the store.
 * DropiTracking::sync calls queue() inside its transaction: the email goes to order_mail (mail:work) and the WhatsApp
 * notice to whatsapp_status_notices (whatsapp:work), one per order and state. WhatsApp sends free text inside the
 * 24-hour window, otherwise the approved template chosen for notices; without it the notice is skipped (the email
 * still goes). A novelty also notifies the store and hands the chat to an advisor. The voluntary opt-out does not stop
 * these notices: they are about an order the customer placed.
 */
final class OrderStatusNotices {
 public const STATES=['guide_generated'=>'Guía generada','in_transit'=>'En camino','novelty'=>'Novedad en la entrega','delivered'=>'Entregado'];
 public const MAIL=['guide_generated'=>'buyer_guide','in_transit'=>'buyer_in_transit','novelty'=>'buyer_novelty','delivered'=>'buyer_delivered'];
 /** Template variables Tinbana fills for a notice. */
 public const VALUES=['nombre'=>'Nombre del cliente','pedido'=>'Número de pedido','estado'=>'Estado del pedido','guia'=>'Número de guía','transportadora'=>'Transportadora','seguimiento'=>'Enlace para consultar el pedido','producto'=>'Producto','tienda'=>'Nombre de la tienda'];
 private const SENDING_MINUTES=5;

 // ---- Settings ----

 public static function defaults(): array {return ['whatsapp'=>array_fill_keys(array_keys(self::STATES),true),'template_id'=>null];}
 public static function settings(string $owner): array {
  $s=self::defaults();$row=Database::one('SELECT settings FROM whatsapp_notice_settings WHERE user_id=?',[$owner]);
  $saved=$row?json_decode((string)$row['settings'],true):null;
  if(is_array($saved)){foreach(self::STATES as $k=>$_)if(is_bool($saved['whatsapp'][$k]??null))$s['whatsapp'][$k]=$saved['whatsapp'][$k];if(is_string($saved['template_id']??null)&&Support::isUuid($saved['template_id']))$s['template_id']=$saved['template_id'];}
  return $s;
 }
 /** Why a template cannot carry the notices, or null when it can. */
 public static function ineligible(array $t): ?string {
  if($t['status']!=='APPROVED')return 'Meta todavía no la aprueba';
  if(json_decode((string)$t['buttons'],true))return 'Los avisos no llevan botones: usa una plantilla sin botones';
  foreach(json_decode((string)$t['variables'],true)?:[] as $v)if(!isset(self::VALUES[$v['key']]))return 'Usa la variable {{'.$v['key'].'}}, que Tinbana no sabe llenar en un aviso';
  return null;
 }
 private static function template(string $owner,array $s,array $account): ?array {
  $t=$s['template_id']?Database::one('SELECT * FROM whatsapp_templates WHERE id=? AND user_id=? AND account_id=?',[$s['template_id'],$owner,$account['id']]):null;
  return $t&&self::ineligible($t)===null?$t:null;
 }
 public static function view(string $owner): array {
  $s=self::settings($owner);$a=WhatsAppAccount::ofUser($owner);
  $templates=$a?Database::all("SELECT * FROM whatsapp_templates WHERE user_id=? AND account_id=? AND status<>'DELETED' ORDER BY created_at DESC",[$owner,$a['id']]):[];
  $recent=Database::all('SELECT n.id,n.order_id,n.state,n.status,n.channel,n.error,n.conversation_id,n.created_at,n.sent_at,o.order_number,o.customer FROM whatsapp_status_notices n JOIN orders o ON o.id=n.order_id AND o.user_id=n.user_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 20',[$owner]);
  return ['settings'=>$s,'states'=>self::STATES,'values'=>self::VALUES,'connected'=>$a!==null,'template_ready'=>$a&&self::template($owner,$s,$a)!==null,
   'templates'=>array_map(fn($t)=>['id'=>$t['id'],'name'=>$t['name'],'status'=>$t['status'],'body'=>$t['body'],'purpose'=>$t['purpose'],'problem'=>self::ineligible($t)],$templates),
   'recent'=>array_map(fn($r)=>['id'=>$r['id'],'order_id'=>$r['order_id'],'order_number'=>$r['order_number'],'customer'=>trim((json_decode((string)$r['customer'],true)['first_name']??'').' '.(json_decode((string)$r['customer'],true)['last_name']??'')),
    'state'=>$r['state'],'status'=>$r['status'],'channel'=>$r['channel'],'error'=>$r['error'],'conversation_id'=>$r['conversation_id'],'created_at'=>$r['created_at'],'sent_at'=>$r['sent_at']],$recent)];
 }
 public static function save(string $owner,array $b): array {
  $out=self::defaults();
  foreach(self::STATES as $k=>$_){$v=$b['whatsapp'][$k]??null;if(!is_bool($v))throw new HttpError(422,'Indica qué avisos se envían por WhatsApp.');$out['whatsapp'][$k]=$v;}
  $tid=$b['template_id']??null;if($tid!==null&&(!is_string($tid)||!Support::isUuid($tid)))throw new HttpError(422,'Plantilla inválida.');
  if($tid!==null){
   $a=WhatsAppAccount::ofUser($owner);$t=$a?Database::one('SELECT * FROM whatsapp_templates WHERE id=? AND user_id=? AND account_id=?',[$tid,$owner,$a['id']]):null;
   if(!$t)throw new HttpError(422,'Plantilla no encontrada.');if($why=self::ineligible($t))throw new HttpError(422,'Esa plantilla no sirve para los avisos: '.$why.'.');
  }
  $out['template_id']=$tid;$value=Support::json($out);
  if(Database::one('SELECT user_id FROM whatsapp_notice_settings WHERE user_id=?',[$owner]))Database::query('UPDATE whatsapp_notice_settings SET settings=?::jsonb,updated_at=now() WHERE user_id=?',[$value,$owner]);
  else Database::query('INSERT INTO whatsapp_notice_settings(user_id,settings) VALUES(?,?::jsonb)',[$owner,$value]);
  return self::view($owner)+['message'=>'Avisos guardados.'];
 }

 // ---- Texts ----

 /** Short phrase of the state, for the {{estado}} variable and the email. */
 public static function phrase(string $state,array $d): string {
  $guide=trim((string)($d['guide']??''));$carrier=trim((string)($d['carrier']??''));$novelty=trim((string)($d['novelty']??''));
  return match($state){
   'guide_generated'=>'ya tiene guía de envío'.($guide!==''?' N° '.$guide:'').($carrier!==''?' con '.$carrier:''),
   'in_transit'=>'va en camino'.($carrier!==''?' con '.$carrier:'').($guide!==''?' (guía '.$guide.')':''),
   'novelty'=>'tiene una novedad en la entrega'.($novelty!==''?': '.$novelty:''),
   'delivered'=>'fue entregado',
   default=>'cambió de estado',
  };
 }
 public static function values(array $order,string $state,array $d,string $store): array {
  $c=json_decode((string)$order['customer'],true)?:[];$p=json_decode((string)$order['product_data'],true)?:[];$ref=Orders::displayNumber($order);
  return ['nombre'=>trim((string)($c['first_name']??''))?:'cliente','pedido'=>$ref,'estado'=>self::phrase($state,$d),'guia'=>trim((string)($d['guide']??''))?:'por asignar',
   'transportadora'=>trim((string)($d['carrier']??''))?:'la transportadora','seguimiento'=>!empty($order['order_number'])?OrderLookup::url((string)$order['user_id'],(string)$order['order_number']):'',
   'producto'=>(string)($p['product_name']??'tu producto'),'tienda'=>$store];
 }
 /** Free text sent inside the 24-hour window. */
 public static function text(string $state,array $v): string {
  $track=$v['seguimiento']!==''?"\nConsúltalo aquí: ".$v['seguimiento']:'';
  return match($state){
   'guide_generated'=>'Hola '.$v['nombre'].', tu pedido '.$v['pedido'].' '.$v['estado'].'. 📦'.$track,
   'in_transit'=>'¡Tu pedido '.$v['pedido'].' '.$v['estado'].'! 🚚'.$track,
   'novelty'=>'Hola '.$v['nombre'].', tu pedido '.$v['pedido'].' '.$v['estado'].'. Un asesor te escribe para resolverlo.',
   'delivered'=>'¡Tu pedido '.$v['pedido'].' fue entregado! 🎉 Gracias por comprar en '.$v['tienda'].'. Si tienes alguna pregunta, escríbenos por aquí.',
   default=>'Tu pedido '.$v['pedido'].' '.$v['estado'].'.'.$track,
  };
 }

 // ---- Queue and sending ----

 /** Inside DropiTracking::sync (open transaction): the logistics state of the order changed to $state. */
 public static function queue(array $order,string $state,array $tracking): void {
  if(!isset(self::STATES[$state]))return;$owner=(string)$order['user_id'];
  $d=['guide'=>$tracking['guide']??null,'carrier'=>$tracking['carrier']??null,'novelty'=>$tracking['novelty']??null];
  OrderMail::queue($order,self::MAIL[$state],$d);
  if($state==='novelty')Notifications::notify($owner,'order_novelty','Novedad en el pedido '.Orders::displayNumber($order),self::phrase($state,$d).'. Revisa el pedido y contacta al cliente.','/panel/pedidos/'.$order['id']);
  if(!self::settings($owner)['whatsapp'][$state]||!Entitlements::allows($owner,'whatsapp')||!WhatsAppAccount::ofUser($owner))return;
  Database::query('INSERT INTO whatsapp_status_notices(id,user_id,order_id,state,details) VALUES(?,?,?,?,?::jsonb) ON CONFLICT(order_id,state) DO NOTHING',[Support::uuid(),$owner,$order['id'],$state,Support::json($d)]);
 }
 /** Cron (whatsapp:work). A notice stuck while sending is closed as failed, never sent again blindly. */
 public static function runDue(int $limit=10): int {
  Database::query("UPDATE whatsapp_status_notices SET status='failed',error='No se confirmó el envío. Revisa en el chat si llegó.',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '".self::SENDING_MINUTES." minutes'");
  $done=0;foreach(Database::all("SELECT id FROM whatsapp_status_notices WHERE status='queued' ORDER BY created_at LIMIT ".max(1,min(50,$limit))) as $r){try{if(self::send((string)$r['id']))$done++;}catch(\Throwable $t){error_log('WhatsApp status notice '.$r['id'].': '.get_class($t));}}
  return $done;
 }
 private static function finish(array $row,string $status,?string $error,array $extra=[]): void {
  $sets=['status=?','error=?','updated_at=now()'];$args=[$status,$error!==null?mb_substr($error,0,500):null];
  foreach($extra as $k=>$v){$sets[]=$k.'=?';$args[]=$v;}$args[]=$row['id'];
  Database::query('UPDATE whatsapp_status_notices SET '.implode(',',$sets).' WHERE id=?',$args);
  if($o=Database::one('SELECT * FROM orders WHERE id=?',[$row['order_id']]))Orders::event($o,'whatsapp_status_notice_'.$status,['state'=>$row['state'],'channel'=>$extra['channel']??null,'error'=>$error],null);
 }
 public static function send(string $id): bool {
  if(Database::query("UPDATE whatsapp_status_notices SET status='sending',updated_at=now() WHERE id=? AND status='queued'",[$id])->rowCount()!==1)return false;
  $row=Database::one('SELECT * FROM whatsapp_status_notices WHERE id=?',[$id]);$owner=(string)$row['user_id'];
  $order=Database::one('SELECT * FROM orders WHERE id=? AND user_id=?',[$row['order_id'],$owner]);
  $s=self::settings($owner);$account=WhatsAppAccount::ofUser($owner);
  $skip=match(true){
   !$order=>'El pedido ya no existe',
   !$s['whatsapp'][$row['state']]=>'Este aviso está desactivado',
   !$account||!Entitlements::allows($owner,'whatsapp')=>'WhatsApp no está conectado',
   $order['sale_status']==='cancelled'=>'El pedido está cancelado',
   (bool)Database::one("SELECT id FROM whatsapp_status_notices WHERE order_id=? AND id<>? AND created_at>? AND status IN ('queued','sending','sent')",[$row['order_id'],$id,$row['created_at']])=>'Ya hay un estado más reciente del pedido',
   default=>null,
  };
  if($skip){self::finish($row,'skipped',$skip);return false;}
  $phone=preg_replace('/\D/','',(string)(json_decode((string)$order['customer'],true)['phone']??''));
  if(!preg_match('/^[1-9][0-9]{7,14}$/D',$phone)){self::finish($row,'skipped','El teléfono del comprador no sirve para WhatsApp');return false;}
  // The chat of the order (made in the chat or confirmed there), else the chat of the same phone.
  $existing=Database::one('SELECT c.id FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id WHERE c.user_id=? AND c.account_id=? AND ct.phone=?',[$owner,$account['id'],$phone]);
  $c=$existing?WhatsAppInbox::conversation($owner,(string)$existing['id']):null;
  $open=$c&&WhatsAppInbox::windowOpen($c['last_customer_at']);$t=self::template($owner,$s,$account);
  if(!$open&&!$t){self::finish($row,'skipped','El cliente no escribió en las últimas 24 horas y no hay una plantilla aprobada para los avisos');return false;}
  $values=self::values($order,$row['state'],json_decode((string)$row['details'],true)?:[],(string)($account['verified_name']?:'nuestra tienda'));
  try{$msg=$open?null:WhatsAppTemplates::build($t,$values,$phone);}
  catch(HttpError $e){self::finish($row,'skipped',$e->getMessage());return false;}
  $c??=WhatsAppInbox::conversationFor($owner,$account,$phone,trim($values['nombre'])?:null,'Aviso del pedido '.$values['pedido'],true);
  $sent=$open?WhatsAppInbox::sendText($account,$c,self::text($row['state'],$values),'system',null)
   :WhatsAppInbox::sendGraph($account,$c,$msg['graph'],'template',$msg['text'],'template',null,null,0,['template'=>$t['name'],'order_id'=>$order['id'],'notice'=>$row['state']]);
  $ok=$sent['status']!=='failed'&&$sent['wamid']!==null;
  self::finish($row,$ok?'sent':'failed',$ok?null:(string)$sent['error'],['channel'=>$open?'text':'template','conversation_id'=>$c['id'],'message_id'=>$sent['id'],'sent_at'=>$ok?Database::timestamp(gmdate('c')):null]);
  // A novelty needs a person: the chat goes to an advisor (the store was notified when it was queued).
  if($ok&&$row['state']==='novelty')WhatsAppOrderConfirm::handoff($c,'Novedad en la entrega del pedido '.$values['pedido']);
  return $ok;
 }
}
