<?php
declare(strict_types=1);
namespace App;

/**
 * Stage 6C, «Pendientes»: what needs a person, gathered from the inbox, orders, Dropi, WhatsApp and emails, most
 * urgent first. Read-only: every item links to where it is solved and disappears when it is solved there. Items that do
 * not solve themselves (a failed send, a customer who never answered…) can be marked as reviewed (pending_reviewed);
 * their key carries the occurrence, so a new problem shows up again. The menu counter only counts the urgent ones:
 * chats waiting for an advisor and Dropi novelties.
 */
final class Pending {
 public const SECTIONS=['chats'=>'Chats esperando asesor','novelties'=>'Novedades de Dropi','confirm'=>'Pedidos por confirmar con problema','dropi'=>'Pedidos confirmados sin enviar a Dropi','failed'=>'Envíos que fallaron','templates'=>'Plantillas rechazadas en uso'];
 private const LIMIT=50;
 private const DAYS=7;

 private static function who(array $o): string {$c=json_decode((string)$o['customer'],true)?:[];$n=trim(($c['first_name']??'').' '.($c['last_name']??''));return $n!==''?$n:'Cliente';}
 private static function item(string $key,string $title,string $detail,?string $since,array $links,bool $reviewable,?string $warn=null): array {
  return ['key'=>$key,'title'=>$title,'detail'=>mb_substr($detail,0,300),'since'=>$since,'links'=>$links,'reviewable'=>$reviewable,'warn'=>$warn];
 }
 /** A stored error as a sentence ending in one period. */
 private static function why(?string $e): string {$e=rtrim(trim((string)$e),'. ');return ($e!==''?$e:'sin detalle').'.';}
 private static function reviewed(string $owner): array {return array_flip(array_column(Database::all('SELECT item_key FROM pending_reviewed WHERE user_id=?',[$owner]),'item_key'));}
 private static function recent(): string {return (string)Database::timestamp(gmdate('c',time()-self::DAYS*86400));}

 /** Chats with an advisor where the customer wrote last (nobody answered yet), with the time left in the 24-hour window. */
 private static function chats(string $owner): array {
  $out=[];
  foreach(Database::all("SELECT c.id,c.handoff_reason,c.last_customer_at,ct.phone,ct.profile_name FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id AND ct.user_id=c.user_id WHERE c.user_id=? AND c.owner_mode='human' AND c.closed_at IS NULL AND c.last_customer_at IS NOT NULL AND c.last_customer_at>=c.last_message_at AND c.last_customer_at>? ORDER BY c.last_customer_at LIMIT ".self::LIMIT,[$owner,self::recent()]) as $c){
   $left=strtotime((string)$c['last_customer_at'])+WhatsAppInbox::WINDOW_SECONDS-time();
   $warn=$left<=0?'La ventana de 24 horas se cerró: solo puedes escribirle con una plantilla':($left<7200?'La ventana de 24 horas se cierra en '.max(1,intdiv($left,60)).' minutos':null);
   $out[]=self::item('chat:'.$c['id'],trim((string)$c['profile_name'])?:'+'.$c['phone'],(string)($c['handoff_reason']?:'Escribió y espera respuesta'),$c['last_customer_at'],[['label'=>'Abrir chat','to'=>'/panel/whatsapp/'.$c['id']]],false,$warn);
  }
  return $out;
 }
 private static function novelties(string $owner): array {
  $out=[];
  foreach(Database::all("SELECT * FROM orders WHERE user_id=? AND logistics_status='novelty' ORDER BY dropi_synced_at LIMIT ".self::LIMIT,[$owner]) as $o){
   $t=json_decode((string)($o['dropi_tracking']??'null'),true)?:[];
   $out[]=self::item('novelty:'.$o['id'].':'.md5((string)$o['dropi_status'].($t['novelty']??'')),self::who($o).' · '.Orders::displayNumber($o),'Novedad'.(!empty($t['novelty'])?': '.$t['novelty']:' en la entrega').(!empty($t['carrier'])?' ('.$t['carrier'].')':''),$t['updated_at']??$o['dropi_synced_at'],[['label'=>'Ver pedido','to'=>'/panel/pedidos/'.$o['id']]],true);
  }
  return $out;
 }
 /** Drafts the customer did not confirm: no answer after the reminder, asked for changes, or the summary could not go out. */
 private static function confirm(string $owner): array {
  $out=[];$seen=[];
  foreach(Database::all("SELECT r.id,r.created_at,r.conversation_id,o.* FROM whatsapp_reminders r JOIN orders o ON o.id=r.order_id WHERE r.user_id=? AND r.status='no_answer' AND o.sale_status='draft' ORDER BY r.created_at LIMIT ".self::LIMIT,[$owner]) as $o){
   $seen[$o['id']]=true;
   $out[]=self::item('no_answer:'.$o['id'],self::who($o).' · '.Orders::displayNumber($o),'No respondió el resumen ni el recordatorio. Llámalo o cancela el pedido.',$o['created_at'],array_values(array_filter([['label'=>'Ver pedido','to'=>'/panel/pedidos/'.$o['id']],$o['conversation_id']?['label'=>'Abrir chat','to'=>'/panel/whatsapp/'.$o['conversation_id']]:null])),true);
  }
  foreach(Database::all("SELECT w.status AS w_status,w.error AS w_error,w.conversation_id,w.updated_at AS w_at,o.* FROM whatsapp_order_confirmations w JOIN orders o ON o.id=w.order_id AND o.user_id=w.user_id WHERE w.user_id=? AND w.status IN ('change','skipped','failed') AND o.sale_status='draft' AND w.updated_at>? ORDER BY w.updated_at LIMIT ".self::LIMIT,[$owner,self::recent()]) as $o){
   if(isset($seen[$o['id']]))continue;$change=$o['w_status']==='change';
   $out[]=self::item('confirm:'.$o['id'].':'.$o['w_status'].':'.md5((string)$o['w_error']),self::who($o).' · '.Orders::displayNumber($o),$change?'Pidió cambiar algo del pedido.':'No se le pudo enviar el resumen: '.self::why($o['w_error']),$o['w_at'],
    array_values(array_filter([['label'=>'Ver pedido','to'=>'/panel/pedidos/'.$o['id']],$o['conversation_id']?['label'=>'Abrir chat','to'=>'/panel/whatsapp/'.$o['conversation_id']]:null])),true);
  }
  return $out;
 }
 private static function dropi(string $owner): array {
  $out=[];
  foreach(Database::all("SELECT * FROM orders WHERE user_id=? AND sale_status='confirmed' AND integration_status IN ('not_sent','failed','unknown') ORDER BY updated_at LIMIT ".self::LIMIT,[$owner]) as $o){
   $detail=match($o['integration_status']){'unknown'=>'Envío por verificar: no se sabe si llegó a Dropi. Revísalo en Dropi antes de enviarlo de nuevo.','failed'=>'El envío a Dropi falló. Revisa el motivo y vuelve a enviarlo.',default=>'Confirmado y listo para enviar a Dropi.'};
   $out[]=self::item('dropi:'.$o['id'],self::who($o).' · '.Orders::displayNumber($o),$detail,$o['updated_at'],[['label'=>$o['integration_status']==='unknown'?'Verificar':'Enviar a Dropi','to'=>'/panel/pedidos/'.$o['id']]],false,$o['integration_status']==='unknown'?'Revisa en Dropi antes de reintentar':null);
  }
  return $out;
 }
 /** Failed WhatsApp messages, status notices, reminders and order emails of the last days. */
 private static function failed(string $owner): array {
  $out=[];$since=self::recent();
  foreach(Database::all("SELECT m.id,m.error,m.created_at,m.conversation_id,ct.phone,ct.profile_name FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id=m.conversation_id JOIN whatsapp_contacts ct ON ct.id=c.contact_id WHERE m.user_id=? AND m.direction='out' AND m.status='failed' AND m.created_at>? ORDER BY m.created_at LIMIT ".self::LIMIT,[$owner,$since]) as $m)
   $out[]=self::item('msg:'.$m['id'],'WhatsApp a '.(trim((string)$m['profile_name'])?:'+'.$m['phone']),'Meta no entregó el mensaje: '.self::why($m['error']),$m['created_at'],[['label'=>'Abrir chat','to'=>'/panel/whatsapp/'.$m['conversation_id']]],true);
  foreach(Database::all("SELECT n.id,n.state,n.error,n.updated_at,o.* FROM whatsapp_status_notices n JOIN orders o ON o.id=n.order_id WHERE n.user_id=? AND n.status='failed' AND n.updated_at>? ORDER BY n.updated_at LIMIT ".self::LIMIT,[$owner,$since]) as $o)
   $out[]=self::item('notice:'.$o['id'],'Aviso «'.(OrderStatusNotices::STATES[$o['state']]??$o['state']).'» · '.Orders::displayNumber($o),'No se pudo enviar por WhatsApp: '.self::why($o['error']),$o['updated_at'],[['label'=>'Ver pedido','to'=>'/panel/pedidos/'.$o['id']]],true);
  foreach(Database::all("SELECT r.id,r.kind,r.error,r.created_at,r.order_id,r.conversation_id FROM whatsapp_reminders r WHERE r.user_id=? AND r.status='failed' AND r.created_at>? ORDER BY r.created_at LIMIT ".self::LIMIT,[$owner,$since]) as $r)
   $out[]=self::item('reminder:'.$r['id'],'Recordatorio «'.(OrderStatusNotices::REMINDERS[$r['kind']]??$r['kind']).'»','No se pudo enviar: '.self::why($r['error']),$r['created_at'],array_values(array_filter([$r['order_id']?['label'=>'Ver pedido','to'=>'/panel/pedidos/'.$r['order_id']]:null,$r['conversation_id']?['label'=>'Abrir chat','to'=>'/panel/whatsapp/'.$r['conversation_id']]:null])),true);
  foreach(Database::all("SELECT m.id,m.kind,m.updated_at,o.* FROM order_mail m JOIN orders o ON o.id=m.order_id WHERE m.user_id=? AND m.status='failed' AND m.updated_at>? ORDER BY m.updated_at LIMIT ".self::LIMIT,[$owner,$since]) as $o)
   $out[]=self::item('mail:'.$o['id'],'Correo a '.self::who($o).' · '.Orders::displayNumber($o),'El proveedor de correo no lo envió después de varios intentos.',$o['updated_at'],[['label'=>'Ver pedido','to'=>'/panel/pedidos/'.$o['id']]],true);
  usort($out,fn($a,$b)=>strcmp((string)$a['since'],(string)$b['since']));
  return array_slice($out,0,self::LIMIT);
 }
 /** Templates chosen for confirmations or notices that Meta rejected, paused or disabled. */
 private static function templates(string $owner): array {
  $ids=array_filter([WhatsAppOrderConfirm::settings($owner)['template_id'],OrderStatusNotices::settings($owner)['template_id']]);if(!$ids)return [];
  $out=[];
  foreach(Database::all('SELECT id,name,status,updated_at FROM whatsapp_templates WHERE user_id=? AND id IN ('.implode(',',array_fill(0,count($ids),'?')).") AND status IN ('REJECTED','PAUSED','DISABLED')",array_merge([$owner],array_values($ids))) as $t)
   $out[]=self::item('template:'.$t['id'],'Plantilla «'.$t['name'].'»',['REJECTED'=>'Meta la rechazó','PAUSED'=>'Meta la pausó','DISABLED'=>'Meta la desactivó'][$t['status']].': mientras tanto no se envían confirmaciones o avisos con ella fuera de las 24 horas.',$t['updated_at'],[['label'=>'Ver plantillas','to'=>'/panel/whatsapp/plantillas'],['label'=>'Cambiar en Confirmaciones','to'=>'/panel/whatsapp/confirmaciones']],false);
  return $out;
 }

 public static function view(string $owner): array {
  $wa=Entitlements::allows($owner,'whatsapp');$done=self::reviewed($owner);$sections=[];
  foreach(self::SECTIONS as $k=>$title){
   if(!$wa&&in_array($k,['chats','confirm','failed','templates'],true))continue;
   $items=array_values(array_filter(self::$k($owner),fn($i)=>!isset($done[$i['key']])));
   $sections[]=['key'=>$k,'title'=>$title,'urgent'=>in_array($k,['chats','novelties'],true),'items'=>$items];
  }
  return ['sections'=>$sections,'urgent'=>self::urgentOf($sections),'total'=>array_sum(array_map(fn($s)=>count($s['items']),$sections))];
 }
 private static function urgentOf(array $sections): int {return array_sum(array_map(fn($s)=>$s['urgent']?count($s['items']):0,$sections));}
 /** Menu counter: only chats waiting for an advisor and Dropi novelties. */
 public static function count(string $owner): array {
  $done=self::reviewed($owner);$n=count(array_filter(self::novelties($owner),fn($i)=>!isset($done[$i['key']])));
  if(Entitlements::allows($owner,'whatsapp'))$n+=count(self::chats($owner));
  return ['urgent'=>$n];
 }
 public static function review(string $owner,array $b): array {
  $key=$b['key']??null;if(!is_string($key)||!preg_match('/^[a-z_]+:[A-Za-z0-9:-]{1,110}$/D',$key))throw new HttpError(422,'Pendiente inválido.');
  $found=null;foreach(self::view($owner)['sections'] as $s)foreach($s['items'] as $i)if($i['key']===$key)$found=$i;
  if(!$found)throw new HttpError(404,'Ese pendiente ya no está en la lista.');
  if(!$found['reviewable'])throw new HttpError(409,'Este pendiente se resuelve solo cuando lo atiendes desde su enlace.');
  Database::query('INSERT INTO pending_reviewed(user_id,item_key) VALUES(?,?) ON CONFLICT(user_id,item_key) DO NOTHING',[$owner,$key]);
  return self::view($owner)+['message'=>'Marcado como revisado.'];
 }
}
