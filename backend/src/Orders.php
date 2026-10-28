<?php
declare(strict_types=1);
namespace App;

/** Local order lifecycle. Submission to Dropi lives in DropiOrders. */
final class Orders {
 // Public order number TB-XXXX-XXXX: random, unique (database index), without 0/O/1/I/L so it reads and dictates well.
 private const NUMBER_CHARS='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
 public const NUMBER_RE='[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}';
 public static function newNumber(): string {
  for($i=0;$i<20;$i++){$c='';for($j=0;$j<8;$j++)$c.=self::NUMBER_CHARS[random_int(0,strlen(self::NUMBER_CHARS)-1)];$n='TB-'.substr($c,0,4).'-'.substr($c,4);
   if(!Database::one('SELECT id FROM orders WHERE order_number=?',[$n]))return $n;}
  throw new \RuntimeException('No se pudo generar el número de pedido.');
 }
 /** Accepts TB-7KQ2-MX9P written with or without dashes, spaces or lowercase; null when it is not an order number. */
 public static function normalizeNumber(string $raw): ?string {
  $s=strtoupper(preg_replace('/[^a-z0-9]/i','',$raw)??'');if(str_starts_with($s,'TB'))$s=substr($s,2);
  return preg_match('/^('.self::NUMBER_RE.')('.self::NUMBER_RE.')$/D',$s,$m)?'TB-'.$m[1].'-'.$m[2]:null;
 }
 /** Orders created before the number existed get one the first time they are read. */
 private static function ensureNumber(array $r): array {
  if(!empty($r['order_number'])||empty($r['id']))return $r;
  for($i=0;$i<3;$i++){try{Database::query('UPDATE orders SET order_number=? WHERE id=? AND order_number IS NULL',[self::newNumber(),$r['id']]);break;}catch(\PDOException){}}
  $r['order_number']=Database::one('SELECT order_number FROM orders WHERE id=?',[$r['id']])['order_number']??null;return $r;
 }
 /** Number shown to people: the public order number, or the first 8 characters of the id. */
 public static function displayNumber(array $r): string {return !empty($r['order_number'])?(string)$r['order_number']:strtoupper(substr((string)$r['id'],0,8));}
 public static function fromLead(string $owner,string $leadId): array {
  if(!Support::isUuid($leadId))throw new HttpError(404,'Consulta no encontrada.');
  $lead=Database::one('SELECT * FROM leads WHERE id=? AND user_id=?',[$leadId,$owner]);
  if(!$lead)throw new HttpError(404,'Consulta no encontrada.');
  $p=json_decode($lead['product_data'],true,512,JSON_THROW_ON_ERROR);
  $unit=self::amount($p['public_price']??null,true);$id=Support::uuid();
  // Freight quoted by Dropi at submission time arrives prefilled; the quote is still saved and accepted manually.
  $shipping=is_numeric($p['shipping_price']??null)?self::amount((string)(int)$p['shipping_price'],true):null;
    // The variant the buyer chose on the landing comes with its label, so the order is ready for Dropi.
  $variant=is_array($p['variant']??null)&&preg_match('/^[1-9][0-9]{0,17}$/D',(string)($p['variant']['id']??''))?['id'=>(string)$p['variant']['id'],'label'=>(string)($p['variant']['label']??''),'sku'=>null]:null;
  $r=Database::one('INSERT INTO orders(id,order_number,user_id,lead_id,customer,delivery_address,product_data,quantity,unit_price,shipping_price,variant_data) VALUES(?,?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?,?,?::jsonb) ON CONFLICT(lead_id) DO NOTHING RETURNING *',[
   $id,self::newNumber(),$owner,$leadId,Support::json(array_intersect_key($lead,array_flip(['first_name','last_name','email','phone']))),$lead['delivery_address']??'{}',$lead['product_data'],max(1,min(100,(int)($p['quantity']??1))),$unit,$shipping,$variant?Support::json($variant):null
  ]);
  if($r)self::event($r,'created',['origin'=>'landing','lead_id'=>$leadId],null);
  else $r=Database::one('SELECT * FROM orders WHERE lead_id=? AND user_id=?',[$leadId,$owner]);
  return self::view($r);
 }
 public static function create(string $owner,array $b): array {
  $db=Database::connection();$db->beginTransaction();
  try{$r=self::fromLead($owner,(string)($b['lead_id']??''));$db->commit();return ['order'=>$r];}
  catch(\Throwable $e){$db->rollBack();throw $e;}
 }
 public static function amount(mixed $value,bool $nullable=false): ?string {
  if($nullable&&$value===null)return null;
  if(!is_string($value)&&!is_int($value)&&!is_float($value))throw new HttpError(422,'Importe inválido.');
  $s=(string)$value;
  if(!preg_match('/^(0|[1-9][0-9]{0,9})(?:\.([0-9]{1,2}))?$/D',$s,$m))throw new HttpError(422,'Usa importes positivos, sin separadores de miles y con máximo dos decimales.');
  return $m[1].'.'.str_pad($m[2]??'',2,'0');
 }
 private static function cents(string $v): int {[$a,$b]=explode('.',$v);return (int)$a*100+(int)$b;}
 private static function decimal(int $v): string {return intdiv($v,100).'.'.str_pad((string)($v%100),2,'0',STR_PAD_LEFT);}
 private static function sameFields(array $a,array $b): bool {ksort($a);ksort($b);return $a===$b;}
 public static function owned(string $owner,string $id,bool $lock=false): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Pedido no encontrado.');
  $r=Database::one('SELECT * FROM orders WHERE id=? AND user_id=?'.($lock?' FOR UPDATE':''),[$id,$owner]);
  if(!$r)throw new HttpError(404,'Pedido no encontrado.');return $r;
 }
 public static function view(array $r): array {
  $r=self::ensureNumber($r);
  foreach(['customer','delivery_address','product_data','confirmation','variant_data','offer_snapshot','integration_data','dropi_tracking'] as $key)$r[$key]=($r[$key]??null)===null?null:json_decode($r[$key],true,512,JSON_THROW_ON_ERROR);
  $r['quantity']=(int)$r['quantity'];$r['version']=(int)$r['version'];
  $r['total']=$r['unit_price']!==null&&$r['shipping_price']!==null?self::decimal(self::cents($r['unit_price'])*$r['quantity']+self::cents($r['shipping_price'])):null;
  return $r;
 }
 public static function listing(string $owner,array $q): array {
  $status=$q['status']??'';if(!is_string($status)||!in_array($status,['','draft','confirmed','cancelled'],true))throw new HttpError(422,'Estado inválido.');
  $page=max(1,min(10000,(int)($q['page']??1)));$args=[$owner];$where='user_id=?';
  if($status!==''){$where.=' AND sale_status=?';$args[]=$status;}
  // Search by order number (TB-7KQ2-MX9P, with or without dashes) or a part of it.
  $q2=is_string($q['q']??null)?strtoupper(preg_replace('/[^a-z0-9]/i','',$q['q'])??''):'';if(str_starts_with($q2,'TB'))$q2=substr($q2,2);
  if($q2!==''){if(strlen($q2)>8)throw new HttpError(422,'Número de pedido inválido.');$where.=" AND REPLACE(order_number,'-','') LIKE ?";$args[]='%'.$q2.'%';}
  // Date range by Colombia calendar day (UTC-5, no DST): from 00:00 of `from` to the end of `to`.
  $day=function(string $key)use($q):?\DateTimeImmutable{$v=$q[$key]??'';if($v==='')return null;if(!is_string($v)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$v)||!checkdate((int)substr($v,5,2),(int)substr($v,8,2),(int)substr($v,0,4)))throw new HttpError(422,'Fecha inválida.');return new \DateTimeImmutable($v.'T00:00:00-05:00');};
  $from=$day('from');$to=$day('to');
  if($from&&$to&&$from>$to)throw new HttpError(422,'La fecha inicial debe ser anterior o igual a la final.');
  if($from){$where.=' AND created_at>=?';$args[]=Database::timestamp($from->format(DATE_ATOM));}
  if($to){$where.=' AND created_at<?';$args[]=Database::timestamp($to->modify('+1 day')->format(DATE_ATOM));}
  $rows=Database::all('SELECT * FROM orders WHERE '.$where.' ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET '.(($page-1)*25),$args);
  return ['orders'=>array_map([self::class,'view'],array_slice($rows,0,25)),'hasNext'=>count($rows)>25,'page'=>$page];
 }
 public static function detail(string $owner,string $id): array {
  $r=self::owned($owner,$id);$events=Database::all('SELECT id,event_type,order_version,data,created_at FROM order_events WHERE order_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 100',[$id,$owner]);
  foreach($events as &$e)$e['data']=json_decode($e['data'],true);
  $product=ProductOffers::forOrder($r);
  return ['order'=>self::view($r),'events'=>$events,'commercial'=>ProductOffers::view($owner,$product['id']),'dropi'=>DropiOrders::readiness($r),'shipping_hint'=>self::shippingHint($r),'whatsapp'=>WhatsAppOrderConfirm::forOrder($r)];
 }
 /**
  * Quote of a landing order for its WhatsApp confirmation: the price the landing showed and the freight Dropi quoted
  * when the buyer submitted. Without that freight, or with a variant to choose, it refuses (no invented values).
  * Needs the locked row inside an open transaction.
  */
 public static function autoQuote(array $r): array {
  if($r['unit_price']===null)throw new HttpError(409,'El pedido no tiene el precio de la landing: cotízalo a mano.');
  if($r['shipping_price']===null)throw new HttpError(409,'Dropi no cotizó el envío a esta ciudad: cotízalo a mano y envía la confirmación desde el pedido.');
  $product=ProductOffers::forOrder($r);$mapped=json_decode($product['mapped_data'],true);
  $variants=ProductOffers::variants($product);$chosen=json_decode((string)($r['variant_data']??'null'),true);
  if(($variants||strtoupper((string)($mapped['type']??''))==='VARIABLE')&&!in_array((string)($chosen['id']??''),array_column($variants,'id'),true))throw new HttpError(409,'El producto tiene variantes: elige la variante en el pedido y envía la confirmación desde allí.');
  $address=json_decode($r['delivery_address'],true);foreach(['country','state','city','address'] as $key)if(empty($address[$key]))throw new HttpError(409,'La dirección del pedido está incompleta: corrígela antes de confirmar.');
  $r=Database::one("UPDATE orders SET version=version+1,quote_id=?,quote_expires_at=now()+interval '24 hours',confirmation=null,updated_at=now() WHERE id=? RETURNING *",[Support::uuid(),$r['id']]);
  self::event($r,'auto_quoted',['quantity'=>(int)$r['quantity'],'unit_price'=>$r['unit_price'],'shipping_price'=>$r['shipping_price'],'quote_id'=>$r['quote_id'],'expires_at'=>$r['quote_expires_at'],'validation'=>'landing_price_and_dropi_shipping'],null);
  return $r;
 }
 /** Records the buyer's own acceptance (WhatsApp button). Locked row, open transaction; the caller checked the quote. */
 public static function confirmByCustomer(array $r,array $confirmation): array {
  $r=Database::one("UPDATE orders SET sale_status='confirmed',confirmation=?::jsonb,version=version+1,updated_at=now() WHERE id=? RETURNING *",[Support::json($confirmation),$r['id']]);
  self::event($r,'confirmed',$confirmation,null);OrderMail::queue($r,'buyer_confirmed');
  return $r;
 }
 /** Shipping cost the landing shows to buyers, as a quote suggestion. Dropi's catalog has no per-product freight. */
 public static function shippingHint(array $r): ?array {
  $l=Database::one('SELECT l.content,l.published_content FROM landing_pages l JOIN leads a ON a.landing_page_id=l.id AND a.user_id=l.user_id WHERE a.id=? AND a.user_id=?',[$r['lead_id'],$r['user_id']]);
  if(!$l)return null;$c=json_decode((string)($l['published_content']?:$l['content']),true);if(!is_array($c))return null;
  $texts=[];if(is_string($c['commerce']['shipping']??null))$texts[]=$c['commerce']['shipping'];
  foreach($c['blocks']??[] as $b)if(($b['type']??'')==='shipping'&&is_string($b['data']['cost']??null))$texts[]=$b['data']['cost'];
  foreach($texts as $text)if($hint=self::parseShipping($text))return $hint;
  return null;
 }
 /** "Gratis"/"Incluido" is 0; otherwise the first peso amount of at least 1.000 (so "2 a 5 días" is ignored). */
 public static function parseShipping(string $text): ?array {
  $text=trim($text);if($text==='')return null;
  if(preg_match('/grat[ií]s|incluid|sin costo|free/iu',$text))return ['amount'=>'0.00','text'=>mb_substr($text,0,120)];
  if(preg_match_all('/([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]+)(?:[.,]([0-9]{1,2}))?(?![0-9])/u',$text,$all,PREG_SET_ORDER))foreach($all as $m){$whole=preg_replace('/[.,]/','',$m[1]);if((int)$whole>=1000&&strlen($whole)<=9)return ['amount'=>$whole.'.'.str_pad($m[2]??'',2,'0'),'text'=>mb_substr($text,0,120)];}
  return null;
 }
 public static function event(array $r,string $type,array $data,?string $actor): void {
  Database::query('INSERT INTO order_events(id,order_id,user_id,actor_id,event_type,order_version,data) VALUES(?,?,?,?,?,?,?::jsonb)',[Support::uuid(),$r['id'],$r['user_id'],$actor,$type,$r['version'],Support::json($data)]);
 }
 public static function change(string $owner,string $id,array $b,string $action): array {
  $db=Database::connection();$db->beginTransaction();
  try{
   $r=self::owned($owner,$id,true);
   if(!isset($b['version'])||!is_int($b['version'])||$b['version']!==(int)$r['version'])throw new HttpError(409,'El pedido cambió. Actualiza el detalle antes de continuar.');
   if(!in_array($r['integration_status'],['not_sent','failed'],true))throw new HttpError(409,$r['integration_status']==='sent'?'El pedido ya se creó en Dropi. Gestiona cambios o cancelación desde Dropi.':'El pedido tiene un envío a Dropi pendiente de revisión.');
   if($action==='customer'){
    if($r['sale_status']!=='draft')throw new HttpError(409,'Devuelve el pedido a revisión antes de editar sus datos.');
    $customer=['first_name'=>Support::text($b['first_name']??null,100),'last_name'=>Support::text($b['last_name']??null,100),'email'=>strtolower(Support::text($b['email']??null,254))];
    if(!filter_var($customer['email'],FILTER_VALIDATE_EMAIL))throw new HttpError(422,'Verifica el email del comprador.');
    $number=DeliveryAddress::phone(Support::text($b['phone']??null,30),'CO');$customer['phone']=$number['phone'];
    $address=DeliveryAddress::validate($b);
    $before=['customer'=>json_decode($r['customer'],true),'delivery_address'=>json_decode($r['delivery_address'],true)];
    $addressChanged=!self::sameFields($before['delivery_address'],$address);
    if(self::sameFields($before['customer'],$customer)&&!$addressChanged){$db->commit();return self::detail($owner,$id);}
    $r=Database::one('UPDATE orders SET customer=?::jsonb,delivery_address=?::jsonb,shipping_price=?,quote_id=null,quote_expires_at=null,confirmation=null,version=version+1,updated_at=now() WHERE id=? RETURNING *',[Support::json($customer),Support::json($address),$addressChanged?null:$r['shipping_price'],$id]);
    self::event($r,'customer_updated',['before'=>$before,'after'=>['customer'=>$customer,'delivery_address'=>$address],'shipping_invalidated'=>$addressChanged],$owner);
   }elseif($action==='reopen'){
    if($r['sale_status']!=='confirmed')throw new HttpError(409,'Solo puedes devolver a revisión un pedido confirmado localmente.');
    $reason=Support::text($b['reason']??null,1000);
    $previous=['confirmation'=>json_decode($r['confirmation']??'null',true),'quote_id'=>$r['quote_id'],'quantity'=>$r['quantity'],'unit_price'=>$r['unit_price'],'shipping_price'=>$r['shipping_price'],'customer'=>json_decode($r['customer'],true),'delivery_address'=>json_decode($r['delivery_address'],true),'variant'=>json_decode($r['variant_data']??'null',true),'offer'=>json_decode($r['offer_snapshot']??'null',true)];
    $r=Database::one("UPDATE orders SET sale_status='draft',shipping_price=null,quote_id=null,quote_expires_at=null,confirmation=null,version=version+1,updated_at=now() WHERE id=? RETURNING *",[$id]);
    self::event($r,'reopened',['reason'=>$reason,'previous'=>$previous],$owner);
   }elseif($action==='quote'){
    if($r['sale_status']!=='draft')throw new HttpError(409,'Solo puedes cotizar un borrador.');
    $qty=$b['quantity']??null;if(!is_int($qty)||$qty<1||$qty>100)throw new HttpError(422,'La cantidad debe estar entre 1 y 100.');
    $product=ProductOffers::forOrder($r);$mapped=json_decode($product['mapped_data'],true);$variants=ProductOffers::variants($product);$variant=null;$variantId=$b['variant_id']??null;
    if($variantId!==null&&(!is_string($variantId)||!preg_match('/^[1-9][0-9]{0,17}$/D',$variantId)))throw new HttpError(422,'Variante inválida.');
    foreach($variants as $v)if($v['id']===$variantId)$variant=$v;
    if($variantId!==null&&!$variant)throw new HttpError(422,'La variante no pertenece a este producto. Actualiza sus datos si cambió en Dropi.');
    if(($variants||strtoupper((string)($mapped['type']??''))==='VARIABLE')&&!$variant)throw new HttpError(422,'Selecciona una variante válida del producto.');
    $offer=null;if(($b['use_offer']??false)!==false){if($b['use_offer']!==true)throw new HttpError(422,'Selección de oferta inválida.');$offer=ProductOffers::resolve($product,$b['offer_version']??null,$qty);}
    $unit=$offer?$offer['unit_price']:self::amount($b['unit_price']??null);$shipping=self::amount($b['shipping_price']??null);
    if(self::cents($unit)<1)throw new HttpError(422,'El precio público debe ser mayor que cero.');
    $notes=Support::text($b['notes']??'',2000,false);
    $address=json_decode($r['delivery_address'],true);foreach(['country','state','city','address'] as $key)if(empty($address[$key]))throw new HttpError(422,'La consulta no tiene una dirección completa. No se puede cotizar todavía.');
    $r=Database::one("UPDATE orders SET quantity=?,unit_price=?,shipping_price=?,notes=?,variant_data=?::jsonb,offer_snapshot=?::jsonb,version=version+1,quote_id=?,quote_expires_at=LEAST(now()+interval '24 hours',COALESCE(?::timestamptz,now()+interval '24 hours')),confirmation=null,updated_at=now() WHERE id=? RETURNING *",[$qty,$unit,$shipping,$notes,Support::json($variant),Support::json($offer),Support::uuid(),Database::timestamp($offer['ends_at']??null),$id]);
    self::event($r,'quoted',['quantity'=>$qty,'unit_price'=>$unit,'shipping_price'=>$shipping,'quote_id'=>$r['quote_id'],'expires_at'=>$r['quote_expires_at'],'customer'=>json_decode($r['customer'],true),'delivery_address'=>json_decode($r['delivery_address'],true),'variant'=>$variant,'offer'=>$offer,'notes'=>$notes,'validation'=>'manual_not_supplier_verified'],$owner);
   }elseif($action==='confirm'){
    if($r['sale_status']!=='draft'||!$r['quote_id']||strtotime($r['quote_expires_at'])<=time())throw new HttpError(409,'Necesitas una cotización vigente antes de confirmar.');
    if(($b['quote_id']??'')!==$r['quote_id'])throw new HttpError(409,'La confirmación no corresponde a la cotización actual.');
    $evidence=Support::text($b['evidence']??null,2000);if(mb_strlen($evidence)<10)throw new HttpError(422,'Describe la aceptación del comprador con al menos 10 caracteres.');
    if(($b['accepted']??false)!==true)throw new HttpError(422,'Debes confirmar que verificaste la aceptación del comprador.');
    $confirmation=['quote_id'=>$r['quote_id'],'quoted_version'=>(int)$r['version'],'evidence'=>$evidence,'recorded_by'=>$owner,'recorded_at'=>gmdate('c'),'method'=>'operator_record'];
    $r=Database::one("UPDATE orders SET sale_status='confirmed',confirmation=?::jsonb,version=version+1,updated_at=now() WHERE id=? RETURNING *",[Support::json($confirmation),$id]);
    self::event($r,'confirmed',$confirmation,$owner);OrderMail::queue($r,'buyer_confirmed');
   }elseif($action==='cancel'){
    if($r['sale_status']==='cancelled')throw new HttpError(409,'El pedido ya está cancelado.');
    $reason=Support::text($b['reason']??null,1000);
    $r=Database::one("UPDATE orders SET sale_status='cancelled',version=version+1,quote_id=null,quote_expires_at=null,updated_at=now() WHERE id=? RETURNING *",[$id]);
    self::event($r,'cancelled',['reason'=>$reason],$owner);OrderMail::queue($r,'buyer_cancelled');
   }else throw new HttpError(404,'Operación no disponible.');
   $db->commit();return self::detail($owner,$id);
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }
}
