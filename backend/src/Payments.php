<?php
declare(strict_types=1);
namespace App;

/**
 * Wompi payments, phase 2: online payment of landing orders (decisions of 2026-11-17, docs/WOMPI.md).
 * - Each landing offers cash on delivery, online payment or both (commerce.paymentMode), only while the store has
 *   the «payments» feature and a tested Wompi account; otherwise it stays cash on delivery.
 * - Online: products − the landing's online discount + the prepaid Dropi freight (EnvioConCobro=false), charged at once.
 * - The order is created «pending payment» with a random base reference (tb-<16 hex>); every checkout attempt uses
 *   base-<n>, so a declined payment can be retried. Only a signed APPROVED event whose amount and currency match marks
 *   it paid; the return page never does. 48 h without payment: Wompi is asked once more, then the order is cancelled.
 */
final class Payments {
 public const DUE_HOURS=48;
 public const MODES=['cod','online','both'];
 private const BASE='/^tb-[a-f0-9]{16}$/D';

 /** Connected Wompi account usable for this owner's landings, or null. */
 public static function account(string $owner): ?array {
  if($owner===''||!Entitlements::allows($owner,'payments'))return null;
  $a=WompiAccount::ofUser($owner);return $a&&$a['status']==='connected'?$a:null;
 }
 /** Effective mode of a landing: its setting when online payment is possible, otherwise cash on delivery. */
 public static function mode(array $r): string {
  $mode=$r['content']['commerce']['paymentMode']??'cod';if(!in_array($mode,self::MODES,true))$mode='cod';
  return $mode!=='cod'&&self::account((string)($r['user_id']??''))?$mode:'cod';
 }
 /** Online order still waiting for an approved payment (it cannot be confirmed meanwhile). */
 public static function awaiting(array $o): bool {return ($o['payment_method']??'cod')==='online'&&($o['payment_status']??'')!=='paid';}
 public static function discountPercent(array $c): int {$d=$c['commerce']['onlineDiscount']??0;return is_int($d)&&$d>=0&&$d<=50?$d:0;}

 /** Payment choice of the landing form ('' for cash on delivery only). */
 public static function choice(array $r,bool $preview): string {
  $mode=$preview?(($r['content']['commerce']['paymentMode']??'cod')):self::mode($r);if($mode==='cod'||!in_array($mode,self::MODES,true))return '';
  $pct=self::discountPercent($r['content']);$off=$pct>0?' · '.$pct.' % de descuento':'';
  $a=$preview?null:self::account((string)($r['user_id']??''));$methods=$a?(json_decode((string)($a['payment_methods']??'[]'),true)?:[]):['CARD','PSE','NEQUI'];
  $online='<span><strong>Pagar en línea</strong><small>Tarjeta, PSE, Nequi y más'.$off.'</small>'.self::brands($methods).'</span>';
  if($mode==='online')return '<div class="pay-choice is-single" data-pay-discount="'.$pct.'"><input type="hidden" name="payment" value="online"><p class="pay-single"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18v12H3z M3 10h18 M7 15h4"/></svg>'.$online.'</p></div>';
  return '<fieldset class="pay-choice" data-pay-discount="'.$pct.'"><legend>¿Cómo quieres pagar?</legend>'
   .'<label class="pay-option"><input type="radio" name="payment" value="online" checked>'.$online.'</label>'
   .'<label class="pay-option"><input type="radio" name="payment" value="cod"><span><strong>Pago contraentrega</strong><small>Pagas en efectivo al recibir</small></span></label></fieldset>';
 }

 /**
  * Trust row of the online option: «Pago seguro con Wompi» and badges of the methods the store's Wompi account really
  * accepts (from the connection test). Own simple badges (inline SVG, no external files), not copies of the brands' logos.
  */
 public static function brands(array $methods): string {
  $b=[
   'visa'=>'<svg viewBox="0 0 40 26" role="img" aria-label="Visa"><rect width="40" height="26" rx="5" fill="#fff" stroke="#e3e7ef"/><text x="20" y="17.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="800" font-style="italic" fill="#1a1f71">VISA</text></svg>',
   'mastercard'=>'<svg viewBox="0 0 40 26" role="img" aria-label="Mastercard"><rect width="40" height="26" rx="5" fill="#fff" stroke="#e3e7ef"/><circle cx="16.5" cy="13" r="7" fill="#eb001b"/><circle cx="23.5" cy="13" r="7" fill="#f79e1b" fill-opacity=".9"/><path d="M20 7.1a7 7 0 0 1 0 11.8 7 7 0 0 1 0-11.8z" fill="#ff5f00"/></svg>',
   'amex'=>'<svg viewBox="0 0 40 26" role="img" aria-label="American Express"><rect width="40" height="26" rx="5" fill="#2e77bc"/><text x="20" y="16.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8.5" font-weight="800" fill="#fff">AMEX</text></svg>',
   'pse'=>'<svg viewBox="0 0 40 26" role="img" aria-label="PSE"><rect width="40" height="26" rx="5" fill="#fff" stroke="#e3e7ef"/><circle cx="20" cy="13" r="9" fill="#0b3c7d"/><text x="20" y="16" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7.5" font-weight="800" fill="#fff">PSE</text></svg>',
   'nequi'=>'<svg viewBox="0 0 40 26" role="img" aria-label="Nequi"><rect width="40" height="26" rx="5" fill="#210049"/><text x="20" y="16.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8.5" font-weight="800" fill="#e5007e">Nequi</text></svg>',
   'daviplata'=>'<svg viewBox="0 0 40 26" role="img" aria-label="Daviplata"><rect width="40" height="26" rx="5" fill="#ed1c27"/><text x="20" y="16" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="6.6" font-weight="800" fill="#fff">DaviPlata</text></svg>',
   'bancolombia'=>'<svg viewBox="0 0 40 26" role="img" aria-label="Bancolombia"><rect width="40" height="26" rx="5" fill="#2c2a29"/><text x="20" y="15.8" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="5.6" font-weight="800" fill="#fdda24">Bancolombia</text></svg>',
  ];
  $show=[];
  if(in_array('CARD',$methods,true))array_push($show,'visa','mastercard','amex');
  if(in_array('PSE',$methods,true))$show[]='pse';
  if(in_array('NEQUI',$methods,true))$show[]='nequi';
  if(in_array('DAVIPLATA',$methods,true))$show[]='daviplata';
  if(array_intersect(['BANCOLOMBIA_TRANSFER','BANCOLOMBIA_QR','BANCOLOMBIA_COLLECT','BANCOLOMBIA'],$methods))$show[]='bancolombia';
  return '<span class="pay-trust"><span class="pay-secure"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 10V7a6 6 0 0 1 12 0v3 M5 10h14v11H5z M12 14v3"/></svg>Pago seguro con <b>Wompi</b></span>'
   .($show?'<span class="pay-brands">'.implode('',array_map(fn($k)=>$b[$k],$show)).'</span>':'').'</span>';
 }

 /**
  * Decides how a landing order is paid. Cash on delivery returns ['method'=>'cod']. Online fixes the amount on the
  * server (never from the browser) and overwrites the freight in $data with the prepaid quote.
  */
 public static function prepare(array $r,array &$data,array $b,array $v,int $quantity,?array $variant): array {
  $mode=self::mode($r);$want=$b['payment']??'cod';
  if($mode==='cod'||($mode==='both'&&$want!=='online'))return ['method'=>'cod'];
  $c=$r['content'];$goods=$data['total']!==null?(float)$data['total']:null;
  if($goods===null||$goods<=0)throw new HttpError(409,'Este producto no tiene precio para pagar en línea. Elige contraentrega o escríbenos.');
  $pct=self::discountPercent($c);$discount=round($goods*$pct/100);$shipping=0.0;$carrier=null;
  if(($c['commerce']['dropiShipping']??false)===true&&($data['source']??'dropi')!=='own'){
   $q=DropiShipping::forLanding($r,(string)$v['delivery']['city_code'],$quantity,$variant['price']??null,false);
   if($q===null)throw new HttpError(409,'No pudimos calcular el envío a tu ciudad para el pago en línea. Intenta de nuevo en un momento o elige contraentrega.');
   $shipping=(float)$q['amount'];$carrier=$q['carrier']??null;
   $data['shipping_source']='dropi';$data['shipping_price']=$shipping;$data['shipping_carrier']=$carrier;
  }
  // Without Dropi freight on the landing the buyer paid no shipping: the order keeps $0 (Dropi still charges its freight to the wallet).
  if($shipping===0.0){$data['shipping_source']='included';$data['shipping_price']=0;}
  $amount=$goods-$discount+$shipping;$data['grand_total']=$amount;$data['payment_method']='online';
  return ['method'=>'online','reference'=>'tb-'.bin2hex(random_bytes(8)),'goods'=>$goods,'discount_percent'=>$pct,'discount'=>$discount,'shipping'=>$shipping,'shipping_carrier'=>$carrier,'amount'=>$amount,'amount_in_cents'=>(int)round($amount*100),'currency'=>'COP','attempts'=>0];
 }

 /** Marks a just-created order as online, pending payment for DUE_HOURS. */
 public static function attach(array $order,array $pay): array {
  $due=Database::timestamp(gmdate('c',time()+self::DUE_HOURS*3600));
  Database::query("UPDATE orders SET payment_method='online',payment_status='pending',payment_reference=?,payment=?::jsonb,payment_due_at=?,updated_at=now() WHERE id=? AND payment_method='cod' AND payment_reference IS NULL",[$pay['reference'],Support::json($pay),$due,$order['id']]);
  $o=Database::one('SELECT * FROM orders WHERE id=?',[$order['id']]);Orders::event($o,'payment_requested',['amount'=>$pay['amount'],'discount_percent'=>$pay['discount_percent'],'shipping'=>$pay['shipping'],'due_at'=>$due],null);
  return $o;
 }

 private static function data(array $o): array {return json_decode((string)($o['payment']??'{}'),true)?:[];}
 public static function byReference(string $owner,string $base): ?array {return preg_match(self::BASE,$base)?Database::one("SELECT * FROM orders WHERE user_id=? AND payment_reference=? AND payment_method='online'",[$owner,$base]):null;}

 /** A new signed checkout attempt for a pending order: base-<n>. Returns the Wompi address. */
 public static function checkout(array $o,string $landingUrl): string {
  if($o['payment_status']!=='pending'||$o['sale_status']==='cancelled')throw new HttpError(409,$o['payment_status']==='paid'?'Este pedido ya está pagado.':'Este pedido ya no admite pagos.');
  $a=WompiAccount::ofUser((string)$o['user_id']);if(!$a)throw new HttpError(409,'La tienda ya no tiene pagos en línea activos. Escríbele para completar tu pedido.');
  $p=self::data($o);$n=(int)($p['attempts']??0)+1;if($n>20)throw new HttpError(429,'Demasiados intentos de pago para este pedido. Escríbele a la tienda.');
  $p['attempts']=$n;Database::query('UPDATE orders SET payment=?::jsonb,updated_at=now() WHERE id=?',[Support::json($p),$o['id']]);
  $c=json_decode((string)$o['customer'],true)?:[];$extra=[];
  if(filter_var($c['email']??'',FILTER_VALIDATE_EMAIL))$extra['customer-data:email']=$c['email'];
  $name=trim(($c['first_name']??'').' '.($c['last_name']??''));if($name!=='')$extra['customer-data:full-name']=mb_substr($name,0,120);
  // Back to the same landing, which shows the result (and sends the Purchase to the store's pixels when it is paid).
  $back=Wompi::redirectUrl('');if($back!==null&&str_starts_with($landingUrl,'https://'))$extra['redirect-url']=$landingUrl.'?pago='.$o['payment_reference'];
  return Wompi::checkoutUrl((string)$a['public_key'],$o['payment_reference'].'-'.$n,(int)$p['amount_in_cents'],WompiAccount::integritySecret($a),$extra);
 }

 /** What the buyer's return page shows. Public by the unguessable reference; no personal data. */
 public static function status(array $o,string $slug): array {
  $p=self::data($o);$state=$o['payment_status']==='paid'?'paid':($o['payment_status']==='expired'||$o['sale_status']==='cancelled'?'closed':'pending');
  return ['status'=>$state,'declined'=>in_array($p['last_status']??'',['DECLINED','ERROR','VOIDED'],true),'amount'=>(float)($p['amount']??0),'currency'=>'COP','quantity'=>(int)$o['quantity'],
   'order_number'=>$o['order_number'],'tracking_url'=>$o['order_number']?OrderLookup::url((string)$o['user_id'],(string)$o['order_number']):null,
   'retry_url'=>$state==='pending'?'/p/'.$slug.'/pagar/'.$o['payment_reference']:null,'due_at'=>$o['payment_due_at'],
   'receipt'=>$state==='paid'?self::receipt($o,$p):null];
 }
 /** Proof of payment the buyer can download: store, order, product and the Wompi transaction (no contact data). */
 private static function receipt(array $o,array $p): array {
  $d=json_decode((string)$o['product_data'],true)?:[];$v=json_decode((string)($o['variant_data']??'null'),true);
  return ['store'=>OrderMail::settings((string)$o['user_id'])['sender_name'],'order_number'=>Orders::displayNumber($o),'product'=>(string)($d['product_name']??'Producto'),
   'variant'=>is_array($v)?(string)($v['label']??''):'','quantity'=>(int)$o['quantity'],'goods'=>(float)($p['goods']??0),'discount'=>(float)($p['discount']??0),'shipping'=>(float)($p['shipping']??0),
   'amount'=>(float)($p['amount']??0),'method'=>$p['method']??null,'transaction_id'=>$p['transaction_id']??null,'reference'=>$o['payment_reference'],'paid_at'=>$o['paid_at']&&($ts=strtotime((string)$o['paid_at'])?:strtotime((string)$o['paid_at'].' UTC'))?gmdate('c',$ts):null];
 }

 /** Signed Wompi event already stored (WompiAccount::receive): applies it to its order. Idempotent. */
 public static function apply(array $account,array $event): void {
  $t=is_array($event['data']['transaction']??null)?$event['data']['transaction']:null;if(!$t||!is_string($t['reference']??null))return;
  if(!preg_match('/^(tb-[a-f0-9]{16})-([0-9]{1,3})$/D',$t['reference'],$m))return;
  $db=Database::connection();$db->beginTransaction();
  try{
   $o=Database::one("SELECT * FROM orders WHERE user_id=? AND payment_reference=? AND payment_method='online' FOR UPDATE",[$account['user_id'],$m[1]]);
   if(!$o){$db->commit();return;}
   $paid=self::settle($o,$t,'event');$db->commit();
  }catch(\Throwable $e){$db->rollBack();throw $e;}
  if($paid)self::afterPaid((string)$o['id']);
 }

 /** One transaction result on its order (row locked by the caller). True when it just became paid (not a late payment). */
 private static function settle(array $o,array $t,string $source): bool {
  $p=self::data($o);$status=(string)($t['status']??'');$p['last_status']=$status;$p['last_transaction']=(string)($t['id']??'');
  if($status!=='APPROVED'){
   Database::query('UPDATE orders SET payment=?::jsonb,updated_at=now() WHERE id=?',[Support::json($p),$o['id']]);
   if(in_array($status,['DECLINED','ERROR','VOIDED'],true))Orders::event($o,'payment_declined',['status'=>$status,'transaction_id'=>$t['id']??null,'reference'=>$t['reference']??null],null);
   return false;
  }
  if($o['payment_status']==='paid')return false;
  $amount=(int)($t['amount_in_cents']??-1);$currency=(string)($t['currency']??'COP');
  if($amount!==(int)($p['amount_in_cents']??-2)||$currency!=='COP'){
   $p['mismatch']=['amount_in_cents'=>$amount,'currency'=>$currency,'transaction_id'=>$t['id']??null];
   Database::query('UPDATE orders SET payment=?::jsonb,updated_at=now() WHERE id=?',[Support::json($p),$o['id']]);
   Orders::event($o,'payment_mismatch',['expected_in_cents'=>$p['amount_in_cents']??null,'received_in_cents'=>$amount,'currency'=>$currency,'transaction_id'=>$t['id']??null],null);return false;
  }
  $p['transaction_id']=(string)($t['id']??'');$p['method']=is_string($t['payment_method_type']??null)?$t['payment_method_type']:null;$p['source']=$source;
  $late=$o['sale_status']==='cancelled';
  Database::query("UPDATE orders SET payment_status='paid',paid_at=now(),payment=?::jsonb,version=version+1,updated_at=now() WHERE id=?",[Support::json($p),$o['id']]);
  $o=Database::one('SELECT * FROM orders WHERE id=?',[$o['id']]);
  Orders::event($o,$late?'payment_after_cancel':'payment_approved',['amount'=>$p['amount']??null,'transaction_id'=>$p['transaction_id'],'method'=>$p['method'],'source'=>$source],null);
  if($late)return false;
  // Phase 4: paying is the buyer's confirmation (no call, no «1 SÍ»). The confirmation email says the payment arrived;
  // the store hears about the new paid order. Own products take their stock here, as on any confirmation.
  OrderMail::queue($o,'owner_new_order');
  if($o['sale_status']==='draft')Orders::confirmByCustomer($o,['source'=>'wompi','evidence'=>'Pago en línea aprobado por Wompi','transaction_id'=>$p['transaction_id'],'amount'=>$p['amount']??null,'accepted'=>true,'at'=>gmdate('c')]);
  return true;
 }

 /**
  * After the commit of a newly paid order: «pago recibido» in the WhatsApp chat (only inside the 24-hour window), a panel
  * notification, and with option B (auto_dropi) the order goes to Dropi SIN RECAUDO by itself. Failures never undo the payment.
  */
 public static function afterPaid(string $id): void {
  $o=Database::one('SELECT * FROM orders WHERE id=?',[$id]);if(!$o||$o['payment_status']!=='paid')return;
  $owner=(string)$o['user_id'];$p=self::data($o);$amount='$'.number_format((float)($p['amount']??0),0,',','.');$own=($o['fulfillment']??'dropi')==='own';
  $a=WompiAccount::ofUser($owner);$auto=!$own&&$a&&(int)($a['auto_dropi']??0)===1&&Entitlements::allows($owner,'dropi_orders');
  try{
   $c=self::conversationFor($o);$wa=WhatsAppAccount::ofUser($owner);
   if($c&&$wa&&Entitlements::allows($owner,'whatsapp')&&WhatsAppInbox::windowOpen($c['last_customer_at'])){
    $name=trim((string)(json_decode((string)$o['customer'],true)['first_name']??''));
    WhatsAppInbox::sendText($wa,$c,'¡Pago recibido'.($name!==''?', '.$name:'').'! Tu pedido '.Orders::displayNumber($o).' por '.$amount.' quedó confirmado. Te avisaremos cuando salga hacia tu dirección.','system',null);
   }
  }catch(\Throwable $t){error_log('Tinbana paid notice: '.get_class($t));}
  $c=json_decode((string)$o['customer'],true)?:[];$who=trim(($c['first_name']??'').' '.($c['last_name']??''))?:'Un cliente';
  Notifications::notify($owner,'order_confirmed',$who.' pagó su pedido en línea','Pedido '.Orders::displayNumber($o).' · '.$amount.'. '.($own?'Es un producto propio: prepáralo y márcalo como despachado.':($auto?'Se envía a Dropi como SIN RECAUDO automáticamente.':'Revísalo y envíalo a Dropi como SIN RECAUDO.')),'/panel/pedidos/'.$o['id'],null);
  if(!$auto)return;
  try{DropiOrders::submit($owner,(string)$o['id'],['confirm'=>true,'version'=>(int)$o['version']],true);}
  catch(\Throwable $t){error_log('Tinbana paid order to Dropi: '.get_class($t));Orders::event($o,'auto_dropi_failed',['message'=>$t instanceof HttpError?$t->getMessage():'No se pudo enviar a Dropi'],null);}
 }

 /**
  * Orders past their 48 h: Wompi is asked once more (an event may have been lost) and, without an approved payment,
  * the order is cancelled as expired. Called every minute by mail:work; bounded per run.
  */
 public static function expire(int $max=20): array {
  $out=['paid'=>0,'expired'=>0];$after=[];
  foreach(Database::all("SELECT id FROM orders WHERE payment_method='online' AND payment_status='pending' AND sale_status<>'cancelled' AND payment_due_at<now() ORDER BY payment_due_at LIMIT ".max(1,min(100,$max))) as $row){
   $db=Database::connection();$db->beginTransaction();
   try{
    $o=Database::one("SELECT * FROM orders WHERE id=? AND payment_status='pending' FOR UPDATE",[$row['id']]);if(!$o){$db->commit();continue;}
    $found=self::reconcile($o);
    if($found){if(self::settle($o,$found,'reconcile'))$after[]=(string)$o['id'];$out['paid']++;}
    else{
     Database::query("UPDATE orders SET payment_status='expired',sale_status='cancelled',version=version+1,updated_at=now() WHERE id=?",[$o['id']]);
     Orders::event(Database::one('SELECT * FROM orders WHERE id=?',[$o['id']]),'payment_expired',['hours'=>self::DUE_HOURS],null);$out['expired']++;
    }
    $db->commit();
   }catch(\Throwable $e){$db->rollBack();error_log('Tinbana payment expiry: '.get_class($e));}
  }
  foreach($after as $id)self::afterPaid($id);
  return $out;
 }

 /**
  * Wompi phase 3: the payment link of a pending order by WhatsApp. The server always writes the link (never the AI):
  * inside the 24-hour window Tinbana sends it; outside, only a template could, and templates have no link buttons yet,
  * so the store gets a wa.me address that opens its own WhatsApp with the message ready.
  */
 public static function retryUrl(array $o): ?string {
  if(!self::awaiting($o)||$o['payment_status']!=='pending'||$o['sale_status']==='cancelled'||empty($o['payment_reference']))return null;
  $p=json_decode((string)$o['product_data'],true)?:[];$landing=is_string($p['landing_url']??null)?$p['landing_url']:'';
  return preg_match('~^https?://[^\s]+/p/[a-z0-9-]+$~D',$landing)?$landing.'/pagar/'.$o['payment_reference']:null;
 }
 public static function linkText(array $o,bool $reminder=false): string {
  $c=json_decode((string)$o['customer'],true)?:[];$name=trim((string)($c['first_name']??''));$p=self::data($o);
  $amount='$'.number_format((float)($p['amount']??0),0,',','.');$due=$o['payment_due_at']?(new \DateTimeImmutable((string)$o['payment_due_at'].' UTC'))->setTimezone(new \DateTimeZone('America/Bogota'))->format('d/m h:i a'):null;
  return 'Hola'.($name!==''?' '.$name:'').($reminder?', tu pedido '.Orders::displayNumber($o).' sigue reservado, pero aún no vemos el pago.':', este es el link para pagar tu pedido '.Orders::displayNumber($o).'.')
   ."\nTotal: ".$amount.' (tarjeta, PSE, Nequi y más con Wompi).'."\n".self::retryUrl($o)
   .($due?"\nSi no se paga antes del ".$due.', el pedido se cancela solo.':'')."\nSi ya pagaste, ignora este mensaje.";
 }
 /** The store's open chat with this order's customer (any window state), or null. */
 public static function conversationFor(array $o): ?array {
  $a=WhatsAppAccount::ofUser((string)$o['user_id']);$phone=preg_replace('/\D/','',(string)(json_decode((string)$o['customer'],true)['phone']??''))??'';
  if(!$a||!preg_match('/^[1-9][0-9]{7,14}$/D',$phone))return null;
  return Database::one('SELECT c.*,ct.phone,ct.profile_name FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id AND ct.user_id=c.user_id WHERE c.user_id=? AND c.account_id=? AND ct.phone=? ORDER BY c.last_customer_at DESC LIMIT 1',[$o['user_id'],$a['id'],$phone]);
 }
 /** Panel: send the link in the chat when the window is open; always returns the wa.me fallback. */
 public static function sendLink(string $owner,string $id,array $b): array {
  $o=Orders::owned($owner,$id);$url=self::retryUrl($o);if($url===null)throw new HttpError(409,'Este pedido no tiene un pago en línea pendiente.');
  $text=self::linkText($o);$phone=preg_replace('/\D/','',(string)(json_decode((string)$o['customer'],true)['phone']??''))??'';
  $waMe=preg_match('/^[1-9][0-9]{7,14}$/D',$phone)?'https://wa.me/'.$phone.'?text='.rawurlencode($text):null;
  $out=['sent'=>false,'wa_me'=>$waMe,'text'=>$text];
  if(($b['channel']??'whatsapp')!=='whatsapp')return $out+['message'=>'Link listo para enviar.'];
  if(!Entitlements::allows($owner,'whatsapp'))return $out+['message'=>'Tu plan no incluye WhatsApp en Tinbana: ábrelo en tu WhatsApp para enviarlo.'];
  $c=self::conversationFor($o);$a=WhatsAppAccount::ofUser($owner);
  if(!$c||!$a||!WhatsAppInbox::windowOpen($c['last_customer_at']))return $out+['message'=>$c?'El cliente no te ha escrito en las últimas 24 horas, así que WhatsApp no deja enviarle texto desde Tinbana. Ábrelo en tu WhatsApp para enviárselo.':'No hay un chat con este cliente en Tinbana. Ábrelo en tu WhatsApp para enviárselo.'];
  Auth::limit('payment-link:'.$owner,60,3600);
  $m=WhatsAppInbox::sendText($a,$c,$text,'agent',$owner);
  if(($m['status']??'')==='failed')return $out+['message'=>'WhatsApp no aceptó el mensaje'.(!empty($m['error'])?': '.$m['error']:'').'. Ábrelo en tu WhatsApp para enviárselo.'];
  Orders::event($o,'payment_link_sent',['channel'=>'whatsapp','conversation_id'=>$c['id']],$owner);
  return ['sent'=>true,'conversation_id'=>$c['id']]+$out+['message'=>'Link de pago enviado por WhatsApp.'];
 }
 /** How the agent sees the payment of an order. */
 public static function chatLabel(array $o): string {
  if(($o['payment_method']??'cod')!=='online')return 'contraentrega';
  return match($o['payment_status']){'paid'=>'en línea, pagado','expired'=>'en línea, vencido sin pago',default=>$o['sale_status']==='cancelled'?'en línea, cancelado':'en línea, esperando pago'};
 }

 /** An approved transaction of any attempt of this order, asked to Wompi with the store's private key; null otherwise. */
 private static function reconcile(array $o): ?array {
  $a=WompiAccount::ofUser((string)$o['user_id']);if(!$a)return null;$p=self::data($o);$base=Wompi::base((string)$a['environment']);
  for($n=1;$n<=min(20,(int)($p['attempts']??0));$n++){
   [$s,$j]=Wompi::request($base,'GET','/transactions?reference='.rawurlencode($o['payment_reference'].'-'.$n),WompiAccount::privateKey($a));
   if($s!==200)continue;foreach((array)($j['data']??[]) as $t)if(is_array($t)&&($t['status']??'')==='APPROVED')return $t;
  }
  return null;
 }
}
