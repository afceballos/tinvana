<?php
declare(strict_types=1);
namespace App;

/**
 * Orders inside the WhatsApp chat: the customer's orders (by phone, or linked to the chat by a confirmation) as
 * context for the agent, the order status on request and the «1 SÍ / 2 NO» confirmation of an order still in draft.
 * The pending step lives in whatsapp_conversations.pending, so the chat knows where it stopped. The server confirms,
 * never the AI: «1» confirms only if the order still has the quote and version the customer saw.
 */
final class WhatsAppOrderChat {
 private const YES='/^\s*(1|s[ií]|confirm\w*|dale|de una|ok|listo)(?![\p{L}\p{N}])/iu';
 private const NO='/^\s*(2|no)(?![\p{L}\p{N}])/iu';
 public const ASK_CONFIRM='¿Lo confirmamos? Responde *1* para SÍ o *2* para NO (si quieres cambiar algo).';

 private static function digits(string $v): string {return preg_replace('/\D/','',$v)??'';}
 /** The customer's latest orders: same phone as the chat, or linked to this chat by a WhatsApp confirmation. */
 public static function ordersFor(string $owner,array $c,int $limit=5): array {
  $phone=self::digits((string)($c['phone']??''));$found=[];
  foreach(Database::all('SELECT o.* FROM orders o JOIN whatsapp_order_confirmations w ON w.order_id=o.id AND w.user_id=o.user_id WHERE o.user_id=? AND w.conversation_id=?',[$owner,$c['id']]) as $o)$found[$o['id']]=$o;
  if($phone!=='')foreach(Database::all('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 300',[$owner]) as $o){
   $p=self::digits((string)(json_decode((string)$o['customer'],true)['phone']??''));
   if($p!==''&&($p===$phone||(strlen($p)>=10&&str_ends_with($phone,substr($p,-10)))))$found[$o['id']]=$o;
  }
  usort($found,fn($a,$b)=>strcmp((string)$b['created_at'],(string)$a['created_at']));
  return array_slice(array_values($found),0,$limit);
 }
 /** An order the customer can still confirm in the chat. */
 public static function confirmable(array $o): bool {return $o['sale_status']==='draft'&&in_array($o['integration_status'],['not_sent','failed'],true);}
 /** Orders as the agent sees them (no contact data). */
 public static function context(string $owner,array $c): array {
  return array_map(function($o){$v=OrderLookup::view($o);return ['number'=>$v['number'],'product'=>$v['product'].($v['variant']!==''?' · '.$v['variant']:''),'quantity'=>$v['quantity'],'total'=>$v['total'],'status'=>$v['status']['label'],'needs_confirmation'=>self::confirmable($o),'created'=>substr((string)$o['created_at'],0,10)];},self::ordersFor($owner,$c));
 }
 private static function account(string $owner,array $c): ?array {return Database::one('SELECT * FROM whatsapp_accounts WHERE id=? AND user_id=?',[$c['account_id'],$owner]);}
 private static function send(string $owner,array $c,string $text): void {$a=self::account($owner,$c);if($a&&WhatsAppInbox::windowOpen($c['last_customer_at']))WhatsAppInbox::sendText($a,$c,$text,'system',null);}
 /**
  * Shows one order. If it can still be confirmed it is quoted when needed (landing price and Dropi freight, or freight
  * included in the price) and the chat waits for «1» or «2». Returns false when the order is not of this store.
  */
 public static function show(string $owner,string $conversationId,string $orderId): bool {
  $c=WhatsAppInbox::conversation($owner,$conversationId);
  $o=Database::one('SELECT * FROM orders WHERE id=? AND user_id=?',[$orderId,$owner]);if(!$o)return false;
  $ask=false;
  if(self::confirmable($o)){
   $db=Database::connection();$db->beginTransaction();
   try{
    $o=Orders::owned($owner,$orderId,true);
    if(self::confirmable($o)&&!WhatsAppOrderConfirm::quoteValid($o))$o=Orders::autoQuote($o);
    $ask=self::confirmable($o)&&WhatsAppOrderConfirm::quoteValid($o);
    if($ask)Database::query('UPDATE whatsapp_conversations SET pending=?::jsonb,updated_at=now() WHERE id=?',[Support::json(['type'=>'confirm_order','order_id'=>$o['id'],'quote_id'=>$o['quote_id'],'version'=>(int)$o['version'],'at'=>gmdate('c')]),$c['id']]);
    $db->commit();
   }catch(HttpError){if($db->inTransaction())$db->rollBack();$o=Database::one('SELECT * FROM orders WHERE id=?',[$orderId]);}
   catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  }
  self::send($owner,$c,OrderLookup::text($o).($ask?"\n\n".self::ASK_CONFIRM:"\n\nConsúltalo cuando quieras: ".OrderLookup::url($owner,Orders::displayNumber($o))));
  return true;
 }
 /** A question about «my order»: the only recent order, or the list to choose from; null when the phone has none. */
 public static function answerOrderQuestion(string $owner,array $c): bool {
  $orders=self::ordersFor($owner,$c);if(!$orders)return false;
  if(count($orders)===1)return self::show($owner,(string)$c['id'],(string)$orders[0]['id']);
  $lines=array_map(function($o){$v=OrderLookup::view($o);return '• '.$v['number'].' — '.$v['product'].($v['variant']!==''?' · '.$v['variant']:'').' ('.$v['status']['label'].')';},$orders);
  self::send($owner,$c,"Tienes estos pedidos con nosotros:\n".implode("\n",$lines)."\n\nEscríbeme el número del que quieres saber.");
  return true;
 }
 /** Inside the inbound transaction: «1»/«2» (or sí/no) while an order waits for confirmation. */
 public static function inbound(array $conv,string $type,string $text,string $messageId,string $wamid): bool {
  // Only typed answers: button taps go through their own check of the message they answer (context).
  if($type!=='text')return false;
  $p=json_decode((string)($conv['pending']??'null'),true);if(!is_array($p)||($p['type']??'')!=='confirm_order'||isset($p['answer']))return false;
  $answer=preg_match(self::YES,$text)?'yes':(preg_match(self::NO,$text)?'no':null);if(!$answer)return false;
  Database::query('UPDATE whatsapp_conversations SET pending=?::jsonb WHERE id=?',[Support::json($p+['answer'=>$answer,'message_id'=>$messageId,'wamid'=>$wamid,'text'=>mb_substr($text,0,100)]),$conv['id']]);
  return true;
 }
 /** After the commit: confirms (the same as the button) or hands the change to an advisor. */
 public static function answer(string $owner,string $conversationId): void {
  $c=WhatsAppInbox::conversation($owner,$conversationId);$p=json_decode((string)($c['pending']??'null'),true);
  if(!is_array($p)||!isset($p['answer']))return;
  if(Database::query('UPDATE whatsapp_conversations SET pending=NULL,updated_at=now() WHERE id=? AND pending IS NOT NULL',[$c['id']])->rowCount()!==1)return;
  $ref=($n=Database::one('SELECT id,order_number FROM orders WHERE id=?',[$p['order_id']]))?Orders::displayNumber($n):'';
  if($p['answer']==='no'){
   if($o=Database::one('SELECT * FROM orders WHERE id=? AND user_id=?',[$p['order_id'],$owner]))Orders::event($o,'whatsapp_change_requested',['conversation_id'=>$c['id'],'reply_wamid'=>$p['wamid']??null,'by'=>'text'],null);
   Database::query("UPDATE whatsapp_order_confirmations SET status='change',reply='change',replied_at=now(),updated_at=now() WHERE order_id=? AND user_id=? AND status<>'confirmed'",[$p['order_id'],$owner]);
   WhatsAppOrderConfirm::handoff($c,'Quiere cambiar algo del pedido '.$ref);
   Notifications::notify($owner,'order_change',WhatsAppAgent::who($c).' quiere cambiar algo de su pedido','Pedido '.$ref.'. Revisa el chat y corrige el pedido antes de confirmarlo.','/panel/whatsapp/'.$c['id'],(string)$c['id']);
   self::send($owner,$c,WhatsAppOrderConfirm::messages($owner)['change']);return;
  }
  $db=Database::connection();$db->beginTransaction();
  try{
   $r=Orders::owned($owner,(string)$p['order_id'],true);
   $ok=self::confirmable($r)&&$r['quote_id']===($p['quote_id']??null)&&(int)$r['version']===(int)($p['version']??-1)&&WhatsAppOrderConfirm::quoteValid($r);
   if($ok){
    $when=(new \DateTimeImmutable('now'))->setTimezone(new \DateTimeZone('America/Bogota'))->format('Y-m-d H:i');
    $r=Orders::confirmByCustomer($r,['quote_id'=>$r['quote_id'],'quoted_version'=>(int)$r['version'],'evidence'=>'El cliente respondió «'.($p['text']??'1').'» en WhatsApp ('.$when.', hora de Colombia) a la pregunta «¿Lo confirmamos?» con el resumen del pedido.',
     'recorded_by'=>null,'recorded_at'=>gmdate('c'),'method'=>'whatsapp_text','conversation_id'=>$c['id'],'reply_wamid'=>$p['wamid']??null]);
    Database::query("UPDATE whatsapp_order_confirmations SET status='confirmed',reply='confirm',replied_at=now(),updated_at=now() WHERE order_id=? AND user_id=?",[$r['id'],$owner]);
   }
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  if($ok){WhatsAppOrderConfirm::afterConfirm($owner,$r,$c,self::account($owner,$c));return;}
  // The order changed or the quote expired since the question: show it again with the current values.
  if(self::confirmable($r)){self::send($owner,$c,'Tu pedido cambió desde que te enviamos el resumen. Te comparto el resumen actualizado.');self::show($owner,(string)$c['id'],(string)$r['id']);}
  else self::send($owner,$c,'Tu pedido '.$ref.' ya está '.mb_strtolower(OrderLookup::status($r)['label']).'.');
 }
}
