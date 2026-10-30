<?php
declare(strict_types=1);
namespace App;

/**
 * Stage 6B: at most one reminder per unconfirmed order and per purchase left halfway in the chat (whatsapp_reminders,
 * unique ref, recorded before sending so it never goes twice). Run by the whatsapp:work cron.
 * - Unconfirmed order: 3 hours after the summary («1 SÍ / 2 NO» or the confirmation buttons) without an answer. Inside
 *   the 24-hour window the summary is shown again; outside it, the confirmation template is sent again (if the store
 *   has one). 24 hours after the reminder without an answer the store is notified («no confirmó»).
 * - Purchase left halfway: the customer gave purchase data to the agent and stopped answering 2 hours ago; one free
 *   text inside the window, without a template, and only once per chat until it closes and opens again.
 * Never when the customer opted out or said they are not interested, an advisor holds the chat, the chat is closed, or outside the store's hours
 * (it waits for the opening while the reminder still makes sense).
 */
final class WhatsAppReminders {
 public const UNCONFIRMED_HOURS=3;
 public const ABANDONED_HOURS=2;
 public const NO_ANSWER_HOURS=24;
 private const BUYING=['name','city','address','neighborhood','quantity','variant'];

 private static function claim(string $owner,string $kind,string $ref,?string $orderId,?string $convId): ?string {
  $id=Support::uuid();
  $done=Database::query("INSERT INTO whatsapp_reminders(id,user_id,kind,ref,order_id,conversation_id,status) VALUES(?,?,?,?,?,?,'sent') ON CONFLICT(user_id,ref) DO NOTHING",[$id,$owner,$kind,$ref,$orderId,$convId])->rowCount();
  return $done===1?$id:null;
 }
 private static function finish(string $id,string $status,?string $channel,?string $error=null): void {
  Database::query('UPDATE whatsapp_reminders SET status=?,channel=?,error=?,resolved_at='.($status==='sent'?'NULL':'now()').' WHERE id=?',[$status,$channel,$error!==null?mb_substr($error,0,500):null,$id]);
 }
 private static function exists(string $owner,string $ref): bool {return (bool)Database::one('SELECT id FROM whatsapp_reminders WHERE user_id=? AND ref=?',[$owner,$ref]);}
 /** null: send now; 'wait': try later (outside hours); 'off': the store turned it off; otherwise the reason to skip it. */
 private static function gate(string $owner,string $kind,?array $c): ?string {
  if(!OrderStatusNotices::settings($owner)['reminders'][$kind]||!Entitlements::allows($owner,'whatsapp'))return 'off';
  if($c){
   if(Database::one('SELECT opted_out_at FROM whatsapp_contacts WHERE id=?',[$c['contact_id']])['opted_out_at']??null)return 'El cliente se dio de baja';
   if(($c['closed_at']??null)!==null&&($c['closed_reason']??'')==='not_interested')return 'El cliente dijo que no le interesa';
   // An advisor who took the chat or wrote in the last day is handling it; a chat that is «human» only because the
   // agent is not available still gets the reminder.
   if($c['owner_mode']==='human'&&(($c['handoff_reason']??'')==='Tomada por un asesor'||Database::one("SELECT id FROM whatsapp_messages WHERE conversation_id=? AND sender='agent' AND created_at>now()-interval '24 hours' LIMIT 1",[$c['id']])))return 'Un asesor tiene el chat';
  }
  return WhatsAppAgentSettings::inHours(WhatsAppAgentSettings::forUser($owner)['settings'])?null:'wait';
 }
 public static function runDue(): array {
  $out=['sent'=>0,'skipped'=>0,'no_answer'=>0];
  self::unconfirmed($out);self::abandoned($out);self::resolve($out);
  return $out;
 }

 /** Orders waiting for «1 SÍ / 2 NO» in a chat, or for the confirmation buttons, for more than 3 hours. */
 private static function unconfirmed(array &$out): void {
  $since=gmdate('c',time()-self::UNCONFIRMED_HOURS*3600);$found=[];
  foreach(Database::all("SELECT w.id,w.user_id,w.order_id,w.conversation_id FROM whatsapp_order_confirmations w JOIN orders o ON o.id=w.order_id AND o.user_id=w.user_id WHERE w.status='sent' AND w.reply IS NULL AND w.sent_at<? AND w.sent_at>now()-interval '3 days' AND o.sale_status='draft' ORDER BY w.sent_at LIMIT 50",[Database::timestamp($since)]) as $w)
   $found[$w['order_id']]=['owner'=>(string)$w['user_id'],'order'=>(string)$w['order_id'],'conv'=>$w['conversation_id'],'confirmation'=>(string)$w['id']];
  foreach(Database::all("SELECT id,user_id,pending FROM whatsapp_conversations WHERE pending IS NOT NULL AND closed_at IS NULL ORDER BY updated_at LIMIT 200") as $c){
   $p=json_decode((string)$c['pending'],true);
   if(!is_array($p)||($p['type']??'')!=='confirm_order'||isset($p['answer'])||strtotime((string)($p['at']??''))>strtotime($since)||strtotime((string)($p['at']??''))<time()-3*86400)continue;
   $found[$p['order_id']]??=['owner'=>(string)$c['user_id'],'order'=>(string)$p['order_id'],'conv'=>(string)$c['id'],'confirmation'=>null];
  }
  foreach($found as $f){
   $ref='unconfirmed:'.$f['order'];if(self::exists($f['owner'],$ref))continue;
   $o=Database::one("SELECT * FROM orders WHERE id=? AND user_id=? AND sale_status='draft'",[$f['order'],$f['owner']]);if(!$o)continue;
   $c=$f['conv']?Database::one('SELECT c.*,ct.phone,ct.profile_name FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id WHERE c.id=? AND c.user_id=?',[$f['conv'],$f['owner']]):null;
   $why=self::gate($f['owner'],'unconfirmed',$c);if($why==='wait'||$why==='off')continue;
   $id=self::claim($f['owner'],'unconfirmed',$ref,$f['order'],$c['id']??null);if(!$id)continue;
   if($why!==null){self::finish($id,'skipped',null,$why);$out['skipped']++;continue;}
   try{
    if($c&&WhatsAppInbox::windowOpen($c['last_customer_at'])){
     $a=Database::one('SELECT * FROM whatsapp_accounts WHERE id=? AND user_id=?',[$c['account_id'],$f['owner']]);
     $name=trim((string)(json_decode((string)$o['customer'],true)['first_name']??''));
     if($a)WhatsAppInbox::sendText($a,$c,'Hola'.($name!==''?' '.$name:'').', ¿pudiste revisar tu pedido '.Orders::displayNumber($o).'? Te lo dejo de nuevo:','system',null);
     WhatsAppOrderChat::show($f['owner'],(string)$c['id'],(string)$o['id']);
     self::finish($id,'sent','text');
    }elseif($f['confirmation']&&($act=WhatsAppOrderConfirm::active($f['owner']))&&$act['template']){
     // Outside the window only a template can write: the confirmation template goes again, with new buttons.
     Database::query("UPDATE whatsapp_order_confirmations SET status='queued',error=NULL,message_id=NULL,sent_at=NULL,send_after=NULL,locked_at=NULL,updated_at=now() WHERE id=? AND status='sent' AND reply IS NULL",[$f['confirmation']]);
     $ok=WhatsAppOrderConfirm::send($f['confirmation']);
     self::finish($id,$ok?'sent':'failed','template',$ok?null:'No se pudo reenviar la plantilla de confirmación');
    }else{self::finish($id,'skipped',null,'El cliente no escribió en las últimas 24 horas y no hay plantilla de confirmación');$out['skipped']++;continue;}
   }catch(\Throwable $t){error_log('WhatsApp reminder '.$id.': '.get_class($t));self::finish($id,'failed',null,'No se pudo enviar el recordatorio');continue;}
   Orders::event($o,'whatsapp_reminder_sent',['kind'=>'unconfirmed','conversation_id'=>$c['id']??null],null);
   $out['sent']++;
  }
 }

 /** The customer gave purchase data to the agent and went quiet 2 hours ago (the chat is still the agent's). */
 private static function abandoned(array &$out): void {
  $rows=Database::all("SELECT c.*,ct.phone,ct.profile_name FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id AND ct.user_id=c.user_id WHERE c.owner_mode='ai' AND c.closed_at IS NULL AND c.pending IS NULL AND c.last_customer_at<now()-interval '".self::ABANDONED_HOURS." hours' AND c.last_customer_at>now()-interval '23 hours' AND c.last_message_at>c.last_customer_at ORDER BY c.last_customer_at LIMIT 50");
  foreach($rows as $c){
   $owner=(string)$c['user_id'];$captured=json_decode((string)$c['captured'],true)?:[];
   if(!array_filter(self::BUYING,fn($k)=>trim((string)($captured[$k]??''))!==''))continue;
   // A purchase already turned into an order in the last day is not «left halfway».
   if($c['order_id']&&Database::one("SELECT id FROM orders WHERE id=? AND created_at>now()-interval '24 hours'",[$c['order_id']]))continue;
   // At most one per chat until it closes and opens again, however many messages the customer writes.
   $ref='abandoned:'.$c['id'].':'.substr(hash('sha256',(string)($c['opened_at']??'first')),0,16);if(self::exists($owner,$ref))continue;
   $why=self::gate($owner,'abandoned',$c);if($why==='wait'||$why==='off')continue;
   $id=self::claim($owner,'abandoned',$ref,null,(string)$c['id']);if(!$id)continue;
   if($why!==null){self::finish($id,'skipped',null,$why);$out['skipped']++;continue;}
   $a=Database::one('SELECT * FROM whatsapp_accounts WHERE id=? AND user_id=?',[$c['account_id'],$owner]);
   $name=explode(' ',trim((string)($captured['name']??'')))[0]?:explode(' ',trim((string)($c['profile_name']??'')))[0];
   $product=null;if($c['product_id']&&($p=Database::one('SELECT mapped_data FROM selected_products WHERE id=? AND user_id=?',[$c['product_id'],$owner])))$product=json_decode((string)$p['mapped_data'],true)['name']??null;
   try{
    if(!$a)throw new \RuntimeException('account');
    $sent=WhatsAppInbox::sendText($a,$c,'Hola'.($name!==''?' '.$name:'').', ¿seguimos con tu pedido'.(is_string($product)&&$product!==''?' de '.$product:'').'? Cuando quieras me escribes y lo terminamos. 😊','system',null);
    $ok=$sent['status']!=='failed';self::finish($id,$ok?'sent':'failed','text',$ok?null:(string)$sent['error']);if($ok)$out['sent']++;
   }catch(\Throwable $t){error_log('WhatsApp reminder '.$id.': '.get_class($t));self::finish($id,'failed',null,'No se pudo enviar el recordatorio');}
  }
 }

 /** Answered reminders are closed; an order still unconfirmed 24 hours after its reminder is reported to the store. */
 private static function resolve(array &$out): void {
  foreach(Database::all("SELECT r.*,o.sale_status FROM whatsapp_reminders r LEFT JOIN orders o ON o.id=r.order_id WHERE r.status='sent' ORDER BY r.created_at LIMIT 100") as $r){
   $old=strtotime((string)$r['created_at'])<time()-self::NO_ANSWER_HOURS*3600;
   $c=$r['conversation_id']?Database::one('SELECT last_customer_at FROM whatsapp_conversations WHERE id=?',[$r['conversation_id']]):null;
   $replied=$c&&$c['last_customer_at']&&strtotime((string)$c['last_customer_at'])>strtotime((string)$r['created_at']);
   if($r['kind']==='unconfirmed'){
    if(($r['sale_status']??'draft')!=='draft'||$replied){self::finish((string)$r['id'],'answered',$r['channel']);continue;}
    if(!$old)continue;
    self::finish((string)$r['id'],'no_answer',$r['channel']);$out['no_answer']++;
    if($o=Database::one('SELECT * FROM orders WHERE id=?',[$r['order_id']])){
     Orders::event($o,'whatsapp_no_answer',['conversation_id'=>$r['conversation_id']],null);
     $who=trim((string)(json_decode((string)$o['customer'],true)['first_name']??''))?:'Un cliente';
     Notifications::notify((string)$r['user_id'],'order_no_answer',$who.' no confirmó su pedido '.Orders::displayNumber($o),'Le enviamos el resumen y un recordatorio sin respuesta. Llámalo o cancela el pedido.','/panel/pedidos/'.$o['id'],$r['conversation_id']);
    }
   }else{
    if($replied)self::finish((string)$r['id'],'answered',$r['channel']);
    elseif($old)self::finish((string)$r['id'],'no_answer',$r['channel']);
   }
  }
 }
}
