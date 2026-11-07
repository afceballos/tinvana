<?php
declare(strict_types=1);
namespace App;

/**
 * Own products: created from scratch in Tinbana, without Dropi. The form data is kept in a Dropi-shaped copy
 * (selected_products.original_data, with an `own` key) so Product::map, landings, variants, offers and orders work as
 * with a Dropi product. The store keeps the stock and ships the orders itself: orders.fulfillment='own', no submission
 * to Dropi and a manual logistics state (ship) that sends the same notices to the customer as Dropi tracking.
 * Stock: null means not tracked (always for sale). A tracked stock goes down when an order is confirmed and comes
 * back when that order is cancelled, returned or sent back to review (orders.stock_units remembers what it took).
 */
final class OwnProducts {
 public const MAX_IMAGES=12;
 public const MAX_OPTIONS=3;
 public const MAX_VALUES=30;
 public const MAX_VARIANTS=100;
 /** Logistics states the store sets by hand, with the label kept in the order's tracking history. */
 public const STATES=['pending'=>'En preparación','guide_generated'=>'Despachado','in_transit'=>'En camino','novelty'=>'Novedad en la entrega','delivered'=>'Entregado','returned'=>'Devuelto'];

 public static function isOwn(array $product): bool {return ($product['source']??'dropi')==='own';}

 private static function fail(string $message): never {throw new HttpError(422,$message);}
 private static function name(mixed $v,int $max,string $label,bool $required=true): string {
  if($v===null&&!$required)return '';
  if(!is_string($v))self::fail($label.' inválido.');$v=trim(preg_replace('/\s+/u',' ',$v)??'');
  if($required&&$v==='')self::fail('Escribe '.mb_strtolower($label).'.');
  if(mb_strlen($v)>$max)self::fail($label.': máximo '.$max.' caracteres.');
  return $v;
 }
 private static function money(mixed $v,string $label,bool $required): ?float {
  if($v===null||$v===''){if($required)self::fail('Escribe '.mb_strtolower($label).'.');return null;}
  if(is_bool($v)||!is_numeric($v)||!is_finite((float)$v)||(float)$v<0||(float)$v>999999999)self::fail($label.' inválido. Usa un número sin separadores de miles.');
  $n=round((float)$v,2);if($required&&$n<=0)self::fail($label.' debe ser mayor que cero.');
  return $n;
 }
 private static function stock(mixed $v,string $label='El stock'): ?int {
  if($v===null||$v==='')return null;
  if(!is_int($v)&&!(is_string($v)&&preg_match('/^[0-9]{1,7}$/D',$v)))self::fail($label.' debe ser un número entero de 0 o más.');
  $n=(int)$v;if($n<0||$n>1000000)self::fail($label.' debe estar entre 0 y 1.000.000.');
  return $n;
 }
 /** Option values as the variant key: «Negro|L». */
 private static function key(array $values): string {return mb_strtolower(implode('|',$values));}

 /**
  * Form data → normalized product. $previous: the saved copy, so variants keep their ids (and the landing keeps
  * the price and photo chosen for each one).
  */
 public static function validate(array $b,string $owner,?array $previous=null): array {
  $name=self::name($b['name']??null,200,'El nombre del producto');
  $description=$b['description']??'';if(!is_string($description))self::fail('Descripción inválida.');$description=trim(str_replace("\r\n","\n",$description));
  // Same byte limit as the landing description, which starts with this text.
  if(strlen($description)>20000)self::fail('La descripción es demasiado larga (máximo unos 20.000 caracteres).');
  $price=self::money($b['price']??null,'El precio de venta',true);$cost=self::money($b['cost']??null,'El costo',false);
  $sku=self::name($b['sku']??null,120,'El SKU',false);
  $images=$b['images']??[];if(!is_array($images)||!array_is_list($images))self::fail('Fotos inválidas.');
  if(count($images)>self::MAX_IMAGES)self::fail('Máximo '.self::MAX_IMAGES.' fotos por producto.');
  $clean=[];foreach($images as $u){if(!is_string($u)||strlen($u)>2000||!Support::url(trim($u)))self::fail('Solo se permiten fotos con dirección HTTP o HTTPS.');$u=trim($u);if(!in_array($u,$clean,true))$clean[]=$u;}
  Media::validateReferences($clean,$owner,'');
  // Options (Color: Negro, Blanco; Talla: S, M) and one variant per combination, with its own price, stock and SKU.
  $options=$b['options']??[];if(!is_array($options)||!array_is_list($options))self::fail('Opciones inválidas.');
  if(count($options)>self::MAX_OPTIONS)self::fail('Máximo '.self::MAX_OPTIONS.' opciones (por ejemplo color, talla y material).');
  $groups=[];$seen=[];
  foreach($options as $o){
   if(!is_array($o))self::fail('Opción inválida.');$label=self::name($o['name']??null,40,'El nombre de la opción');
   if(isset($seen[mb_strtolower($label)]))self::fail('No repitas la opción «'.$label.'».');$seen[mb_strtolower($label)]=true;
   $values=$o['values']??null;if(!is_array($values)||!array_is_list($values)||!$values)self::fail('Escribe al menos un valor para «'.$label.'».');
   if(count($values)>self::MAX_VALUES)self::fail('Máximo '.self::MAX_VALUES.' valores en «'.$label.'».');
   $list=[];foreach($values as $v){$v=self::name($v,60,'El valor de «'.$label.'»');if(str_contains($v,'|'))self::fail('Los valores no pueden llevar «|».');if(in_array(mb_strtolower($v),array_map('mb_strtolower',$list),true))self::fail('No repitas «'.$v.'» en «'.$label.'».');$list[]=$v;}
   $groups[]=['name'=>$label,'values'=>$list];
  }
  $combos=[[]];foreach($groups as $g){$next=[];foreach($combos as $c)foreach($g['values'] as $v)$next[]=[...$c,$v];$combos=$next;}
  if($groups&&count($combos)>self::MAX_VARIANTS)self::fail('Esas opciones dan '.count($combos).' combinaciones; el máximo es '.self::MAX_VARIANTS.'.');
  $sent=[];foreach(is_array($b['variants']??null)?$b['variants']:[] as $v)if(is_array($v)&&is_string($v['key']??null))$sent[mb_strtolower($v['key'])]=$v;
  $old=[];$maxId=0;foreach(is_array($previous['own']['variants']??null)?$previous['own']['variants']:[] as $v){$old[self::key($v['values'])]=(int)$v['id'];$maxId=max($maxId,(int)$v['id']);}
  $variants=[];
  if($groups)foreach($combos as $values){
   $k=self::key($values);$in=$sent[$k]??[];$label=implode(' · ',$values);
   $variants[]=['id'=>$old[$k]??++$maxId,'values'=>$values,'price'=>self::money($in['price']??null,'El precio de «'.$label.'»',false)?:null,'stock'=>self::stock($in['stock']??null,'El stock de «'.$label.'»'),'sku'=>self::name($in['sku']??null,120,'El SKU de «'.$label.'»',false)];
  }
  $track=($b['track_stock']??false)===true;
  return ['name'=>$name,'description'=>$description,'price'=>$price,'cost'=>$cost,'sku'=>$sku,'images'=>$clean,'options'=>$groups,'variants'=>$variants,'track_stock'=>$track,
   'stock'=>$track&&!$groups?(self::stock($b['stock']??null)??0):null];
 }
 /** Dropi-shaped copy for Product::map. Without stock control, stock stays unknown (always for sale). */
 public static function raw(string $code,array $d): array {
  $track=$d['track_stock'];
  return ['id'=>$code,'name'=>$d['name'],'description'=>$d['description'],'sale_price'=>$d['price'],'suggested_price'=>null,'sku'=>$d['sku']!==''?$d['sku']:null,
   'type'=>$d['variants']?'VARIABLE':'SIMPLE','gallery'=>array_map(fn($u,$i)=>['url'=>$u,'main'=>$i===0],$d['images'],array_keys($d['images'])),'categories'=>[],'user'=>[],
   'warehouse_product'=>$track&&!$d['variants']?[['stock'=>$d['stock'],'warehouse'=>['name'=>'Inventario propio']]]:[],
   'variations'=>array_map(fn($v)=>['id'=>$v['id'],'name'=>implode(' · ',$v['values']),'sku'=>$v['sku']!==''?$v['sku']:null,'sale_price'=>$v['price']??$d['price'],'suggested_price'=>null,'stock'=>$track?($v['stock']??0):null,
    'attribute_values'=>array_map(fn($g,$value)=>['attribute_name'=>$g['name'],'value'=>$value],$d['options'],$v['values'])],$d['variants']),
   'own'=>['cost'=>$d['cost'],'track_stock'=>$track,'options'=>$d['options'],'variants'=>$d['variants']]];
 }
 /** Form data of a saved own product, with the current stock (orders change it). */
 public static function form(array $p): array {
  $raw=json_decode((string)$p['original_data'],true);$own=$raw['own']??[];$stock=null;
  foreach($raw['warehouse_product']??[] as $w)$stock=($stock??0)+(int)($w['stock']??0);
  $live=[];foreach($raw['variations']??[] as $v)$live[(int)$v['id']]=$v['stock']??null;
  $variants=array_map(fn($v)=>['key'=>implode('|',$v['values']),'values'=>$v['values'],'price'=>$v['price'],'stock'=>array_key_exists($v['id'],$live)&&$live[$v['id']]!==null?(int)$live[$v['id']]:$v['stock'],'sku'=>$v['sku']],$own['variants']??[]);
  return ['id'=>$p['id'],'name'=>$raw['name'],'description'=>$raw['description'],'price'=>$raw['sale_price'],'cost'=>$own['cost']??null,'sku'=>$raw['sku']??'',
   'images'=>array_column($raw['gallery']??[],'url'),'options'=>$own['options']??[],'variants'=>$variants,'track_stock'=>(bool)($own['track_stock']??false),'stock'=>$stock,
   'landing_id'=>Database::one('SELECT id FROM landing_pages WHERE selected_product_id=? AND user_id=?',[$p['id'],$p['user_id']])['id']??null];
 }
 public static function create(string $owner,array $b): array {
  Entitlements::require($owner,'landings');Entitlements::ensureRoom($owner,'products');
  $d=self::validate($b,$owner);$id=Support::uuid();$raw=self::raw(substr(str_replace('-','',$id),0,10),$d);
  Database::query("INSERT INTO selected_products(id,user_id,integration_id,dropi_id,source,original_data,mapped_data) VALUES(?,?,NULL,NULL,'own',?::jsonb,?::jsonb)",[$id,$owner,Support::json($raw),Support::json(Product::map($raw))]);
  return ['id'=>$id,'product'=>self::form(self::owned($owner,$id))];
 }
 public static function owned(string $owner,string $id,bool $lock=false): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Producto no encontrado.');
  $p=Database::one('SELECT * FROM selected_products WHERE id=? AND user_id=?'.($lock?' FOR UPDATE':''),[$id,$owner]);
  if(!$p)throw new HttpError(404,'Producto no encontrado.');
  if(!self::isOwn($p))throw new HttpError(409,'Este producto viene de Dropi: sus datos se actualizan desde Dropi.');
  return $p;
 }
 /** Edits the product. Its landings take the new stock, variants and photos list; their texts and prices stay. */
 public static function update(string $owner,string $id,array $b): array {
  Entitlements::require($owner,'landings');
  $db=Database::connection();$db->beginTransaction();
  try{
   $p=self::owned($owner,$id,true);$previous=json_decode((string)$p['original_data'],true);
   $d=self::validate($b,$owner,$previous);$raw=self::raw((string)$previous['id'],$d);
   LandingStock::store($p,$raw);$db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  return ['product'=>self::form(self::owned($owner,$id)),'message'=>'Producto guardado. Sus landings ya muestran el stock y las variantes nuevas.'];
 }
 /** Landing content for a new landing of an own product: its price, and each variant's own price. */
 public static function landingStart(array $mapped,array $content): array {
  if(($mapped['source']??'')!=='own')return $content;
  $content['publicPrice']=$mapped['price'];$items=[];
  foreach($mapped['variants']??[] as $v)if($v['price']!==null&&$v['price']!==$mapped['price'])$items[$v['id']]=['price'=>$v['price'],'image'=>'','hidden'=>false];
  if($items)$content['variants']=['items'=>$items];
  return $content;
 }
 /** Units of an own product (or of its variant) that are left, or null when the stock is not tracked. */
 public static function left(array $mapped,?string $variantId): ?int {
  if($variantId!==null){foreach($mapped['variants']??[] as $v)if((string)$v['id']===$variantId)return $v['stock']===null?null:(int)$v['stock'];return null;}
  return ($mapped['stock']??null)===null?null:(int)$mapped['stock'];
 }

 // ---- Stock of own orders ----

 /** Moves $units (negative takes) in the saved copy. Returns the new copy, or null when the stock is not tracked. */
 private static function move(array $raw,?string $variantId,int $units): ?array {
  if(!($raw['own']['track_stock']??false))return null;
  if($raw['variations']??[]){
   foreach($raw['variations'] as &$v)if((string)$v['id']===$variantId){$v['stock']=max(0,(int)($v['stock']??0)+$units);unset($v);return $raw;}
   return null;
  }
  if(!isset($raw['warehouse_product'][0]))return null;
  $raw['warehouse_product'][0]['stock']=max(0,(int)($raw['warehouse_product'][0]['stock']??0)+$units);return $raw;
 }
 private static function productOf(array $order): ?array {
  if(($order['fulfillment']??'dropi')!=='own')return null;
  $p=ProductOffers::forOrder($order);return Database::one('SELECT * FROM selected_products WHERE id=? FOR UPDATE',[$p['id']]);
 }
 /** A confirmed own order takes its units. Locked order row, open transaction. */
 public static function take(array $order): array {
  if(($order['fulfillment']??'dropi')!=='own'||$order['stock_units']!==null)return $order;
  $p=self::productOf($order);if(!$p)return $order;
  $raw=json_decode((string)$p['original_data'],true);$variant=json_decode((string)($order['variant_data']??'null'),true);$variantId=isset($variant['id'])?(string)$variant['id']:null;
  $qty=(int)$order['quantity'];$before=self::left(Product::map($raw),$variantId);$next=self::move($raw,$variantId,-$qty);if(!$next)return $order;
  LandingStock::store($p,$next);
  $order=Database::one('UPDATE orders SET stock_units=? WHERE id=? RETURNING *',[$qty,$order['id']]);
  Orders::event($order,'stock_taken',['units'=>$qty,'variant'=>$variant['label']??null,'before'=>$before,'left'=>max(0,(int)$before-$qty)],null);
  if($before!==null&&$before<$qty)Orders::event($order,'stock_short',['units'=>$qty,'available'=>$before],null);
  return $order;
 }
 /** Puts back what an own order took (cancelled, returned or back to review). */
 public static function release(array $order,string $why): array {
  if(($order['fulfillment']??'dropi')!=='own'||$order['stock_units']===null)return $order;
  $p=self::productOf($order);$units=(int)$order['stock_units'];
  if($p){$raw=json_decode((string)$p['original_data'],true);$variant=json_decode((string)($order['variant_data']??'null'),true);$next=self::move($raw,isset($variant['id'])?(string)$variant['id']:null,$units);if($next)LandingStock::store($p,$next);}
  $order=Database::one('UPDATE orders SET stock_units=NULL WHERE id=? RETURNING *',[$order['id']]);
  Orders::event($order,'stock_returned',['units'=>$units,'reason'=>$why],null);
  return $order;
 }

 // ---- Shipping by the store ----

 /** The store moves an own order through its logistics states; the customer gets the same notices as with Dropi. */
 public static function ship(string $owner,string $id,array $b): array {
  $db=Database::connection();$db->beginTransaction();
  try{
   $r=Orders::owned($owner,$id,true);
   if(!isset($b['version'])||!is_int($b['version'])||$b['version']!==(int)$r['version'])throw new HttpError(409,'El pedido cambió. Actualiza el detalle antes de continuar.');
   if(($r['fulfillment']??'dropi')!=='own')throw new HttpError(409,'Este pedido se despacha con Dropi: su estado llega desde Dropi.');
   if($r['sale_status']!=='confirmed')throw new HttpError(409,'Confirma el pedido antes de despacharlo.');
   $state=$b['state']??null;if(!is_string($state)||!isset(self::STATES[$state]))throw new HttpError(422,'Estado de despacho inválido.');
   if($state===$r['logistics_status'])throw new HttpError(409,'El pedido ya está «'.self::STATES[$state].'».');
   if($r['logistics_status']==='returned')throw new HttpError(409,'El pedido fue devuelto: ya no cambia de estado.');
   $carrier=self::name($b['carrier']??null,60,'La transportadora',false);$guide=self::name($b['guide']??null,80,'El número de guía',false);
   $note=$b['note']??'';if(!is_string($note)||mb_strlen(trim($note))>500)throw new HttpError(422,'La nota admite máximo 500 caracteres.');$note=trim($note);
   if($state==='novelty'&&$note==='')throw new HttpError(422,'Describe la novedad: el cliente la verá en el aviso.');
   $t=json_decode((string)($r['dropi_tracking']??'null'),true)?:['history'=>[]];$now=gmdate(DATE_ATOM);
   $t=['status'=>self::STATES[$state],'carrier'=>$carrier!==''?$carrier:($t['carrier']??null),'guide'=>$guide!==''?$guide:($t['guide']??null),'shipping_amount'=>null,
    'novelty'=>$state==='novelty'?$note:null,'history'=>array_slice([...($t['history']??[]),['status'=>self::STATES[$state],'at'=>$now,'novelty'=>$state==='novelty'?$note:null,'note'=>$state!=='novelty'&&$note!==''?$note:null]],-50),'updated_at'=>$now,'manual'=>true];
   $from=$r['logistics_status'];
   $r=Database::one('UPDATE orders SET logistics_status=?,dropi_tracking=?::jsonb,version=version+1,updated_at=now() WHERE id=? RETURNING *',[$state,Support::json($t),$id]);
   Orders::event($r,'shipping_updated',['from'=>$from,'to'=>$state,'carrier'=>$t['carrier'],'guide'=>$t['guide'],'note'=>$note!==''?$note:null],$owner);
   OrderStatusNotices::queue($r,$state,$t);
   if($state==='returned')self::release($r,'returned');
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  return Orders::detail($owner,$id);
 }
 /** Order detail panel of an own order (in place of the Dropi submission). */
 public static function readiness(array $r): array {
  $state=(string)($r['logistics_status']??'not_requested');
  $message=match(true){
   $r['sale_status']==='cancelled'=>'Pedido cancelado.',
   $r['sale_status']!=='confirmed'=>'Producto propio: cuando el cliente confirme, lo despachas tú y marcas aquí cada paso.',
   $state==='not_requested'=>'Confirmado. Prepáralo y marca aquí cuando salga: el cliente recibe un aviso en cada paso.',
   default=>'Estado actual: '.(self::STATES[$state]??$state).'.',
  };
  return ['mode'=>'own','status'=>'not_sent','can_submit'=>false,'can_resolve'=>false,'dropi_order_id'=>null,'last'=>null,'preview'=>null,'checks'=>[],'message'=>$message,
   'states'=>self::STATES,'can_ship'=>$r['sale_status']==='confirmed'&&$state!=='returned','stock_units'=>$r['stock_units']===null?null:(int)$r['stock_units']];
 }
}
