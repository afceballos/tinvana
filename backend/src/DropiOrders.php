<?php
declare(strict_types=1);
namespace App;

/**
 * Dropi order submission through the integrations API used by the catalog.
 * Contract taken from Dropify (wc-dropi-integration 4.7.3): POST orders/myorders with
 * dropi-integration-key; the order lands as PENDIENTE CONFIRMACION for review in Dropi.
 * A create call has no idempotency key, so an attempt with an unknown result is never retried
 * automatically: an operator checks Dropi and resolves it.
 */
final class DropiOrders {
 public const URL='https://api.dropi.co/integrations/orders/myorders';
 public const STATUS='PENDIENTE CONFIRMACION';
 public const RATE_TYPE='CON RECAUDO';
 private const STALE_SECONDS=120;

 private static function endpoint(): string {
  // Loopback override for the isolated test suite only; production always uses the fixed host.
  $url=Support::env('DROPI_ORDERS_URL');
  if($url!==''&&Support::env('APP_ENV')!=='production'&&preg_match('~^https://127\.0\.0\.1:[0-9]{2,5}/[a-z/]*$~D',$url))return $url;
  return self::URL;
 }
 private static function places(): array {static $data;return $data??=json_decode(file_get_contents(dirname(__DIR__).'/resources/geo/dropi-co.json'),true,512,JSON_THROW_ON_ERROR);}
 /** Department code and municipality name as the WooCommerce plugin sends them; DANE names otherwise. */
 public static function location(array $a): array {
  $p=self::places();
  return ['state'=>$p['departments'][$a['department_code']??'']??($a['state']??''),'city'=>$p['cities'][$a['city_code']??'']??($a['city']??'')];
 }
 private static function phone(string $e164): string {return str_starts_with($e164,'+57')?substr($e164,3):ltrim($e164,'+');}
 private static function cents(string $v): int {[$a,$b]=explode('.',$v);return (int)$a*100+(int)$b;}
 private static function supplier(array $raw): ?int {
  $id=$raw['user_id']??$raw['user']['id']??null;
  return is_numeric($id)&&(int)$id>0?(int)$id:null;
 }

 public static function payload(array $r,array $product): array {
  $raw=json_decode($product['original_data'],true,512,JSON_THROW_ON_ERROR);$mapped=json_decode($product['mapped_data'],true,512,JSON_THROW_ON_ERROR);
  $customer=json_decode($r['customer'],true);$address=json_decode($r['delivery_address'],true);$variant=json_decode($r['variant_data']??'null',true);
  $qty=(int)$r['quantity'];$total=self::cents($r['unit_price'])*$qty+self::cents($r['shipping_price']);
  // Same as the plugin: shipping is folded into the unit price so the products add up to the amount collected.
  $line=$raw;$line['name']=$mapped['name']??($raw['name']??'');$line['quantity']=$qty;$line['price']=round($total/$qty/100,2);
  if($variant)$line['variation_id']=(int)$variant['id'];
  $place=self::location($address);$ref='Tinvana '.substr($r['id'],0,8);
  return [
   'total_order'=>$total/100,
   'notes'=>trim($ref.($variant?'. Variante: '.$variant['label']:'')),
   'name'=>$customer['first_name'],'surname'=>$customer['last_name'],
   'dir'=>trim($address['address'].' '.($address['address_details']??'')),
   'country'=>'CO','state'=>$place['state'],'city'=>$place['city'],
   'phone'=>self::phone($customer['phone']),'client_email'=>$customer['email'],
   'payment_method_id'=>1,'status'=>self::STATUS,'type'=>'FINAL_ORDER','rate_type'=>self::RATE_TYPE,
   'products'=>[$line],'calculate_costs_and_shiping'=>true,'supplier_id'=>self::supplier($raw),'create_product_if_not_exist'=>false,
  ];
 }
 private static function summary(array $payload): array {
  return array_intersect_key($payload,array_flip(['total_order','notes','name','surname','dir','country','state','city','phone','client_email','status','rate_type','supplier_id']))
   +['product_id'=>$payload['products'][0]['id']??null,'quantity'=>$payload['products'][0]['quantity'],'price'=>$payload['products'][0]['price'],'variation_id'=>$payload['products'][0]['variation_id']??null];
 }
 private static function stale(array $r): bool {
  $data=json_decode($r['integration_data']??'null',true);
  return $r['integration_status']==='sending'&&(!isset($data['started_at'])||strtotime($data['started_at'])<time()-self::STALE_SECONDS);
 }

 public static function readiness(array $r): array {
  $p=ProductOffers::forOrder($r);$address=json_decode($r['delivery_address'],true);$mapped=json_decode($p['mapped_data'],true);$raw=json_decode($p['original_data'],true);$variants=ProductOffers::variants($p);$variant=json_decode($r['variant_data']??'null',true);$variantValid=!$variants&&strtoupper((string)($mapped['type']??''))!=='VARIABLE';
  foreach($variants as $v)if($variant&&$v['id']===($variant['id']??null))$variantValid=true;
  $configured=(bool)Database::one('SELECT id FROM integrations WHERE id=? AND user_id=?',[$p['integration_id'],$r['user_id']]);
  $checks=[
   ['key'=>'integration','label'=>'Integración del catálogo configurada','ready'=>$configured],
   ['key'=>'buyer_acceptance','label'=>'Aceptación del comprador registrada','ready'=>$r['sale_status']==='confirmed'&&$r['confirmation']!==null],
   ['key'=>'quote','label'=>'Cotización vigente con precio y envío','ready'=>$r['quote_id']!==null&&$r['quote_expires_at']!==null&&strtotime($r['quote_expires_at'])>time()&&$r['shipping_price']!==null],
   ['key'=>'address','label'=>'Dirección de Colombia con departamento y municipio','ready'=>($address['country_code']??'')==='CO'&&!empty($address['department_code'])&&!empty($address['city_code'])&&!empty($address['address'])],
   ['key'=>'variant','label'=>'Variante del catálogo seleccionada cuando aplica','ready'=>$variantValid],
   ['key'=>'supplier','label'=>'Producto con ID y proveedor de Dropi','ready'=>is_array($raw)&&!empty($raw['id'])&&self::supplier($raw)!==null],
  ];
  $status=$r['integration_status'];$ready=!in_array(false,array_column($checks,'ready'),true);
  $can=$ready&&in_array($status,['not_sent','failed'],true);
  $data=json_decode($r['integration_data']??'null',true);
  $preview=$ready&&$can?self::summary(self::payload($r,$p)):($data['request']??null);
  $message=match(true){
   $status==='sent'&&!empty($r['dropi_status'])=>'Orden creada en Dropi. Último estado conocido: '.str_replace('_',' ',(string)$r['dropi_status']).'.',
   $status==='sent'=>'Orden creada en Dropi con estado '.self::STATUS.'. Confírmala en tu panel de Dropi para que genere la guía.',
   $status==='unknown'||self::stale($r)=>'No sabemos si Dropi creó la orden. Búscala en tu panel de Dropi antes de hacer nada y registra aquí lo que encuentres. No se reintenta automáticamente para no duplicarla.',
   $status==='sending'=>'Envío en curso. Actualiza el pedido en unos segundos.',
   $status==='failed'=>'Dropi rechazó el último envío y no creó la orden. Corrige lo indicado y vuelve a enviarlo.',
   $can=>'Al enviarlo, Dropi recibirá la orden como '.self::STATUS.' y cobro '.self::RATE_TYPE.'. Revísala y confírmala en Dropi para generar la guía.',
   default=>'Completa los requisitos pendientes para habilitar el envío.'
  };
  return ['mode'=>'submission','status'=>$status,'can_submit'=>$can,'can_resolve'=>$status==='unknown'||self::stale($r),'dropi_order_id'=>$r['dropi_order_id']??null,'last'=>$data,'preview'=>$preview,'checks'=>$checks,'message'=>$message];
 }

 /** Sends one confirmed order. Returns the refreshed order detail. */
 public static function submit(string $owner,string $id,array $b): array {
  if(($b['confirm']??false)!==true)throw new HttpError(422,'Confirma que revisaste los datos antes de enviar el pedido a Dropi.');
  $db=Database::connection();$db->beginTransaction();
  try{
   $r=Orders::owned($owner,$id,true);
   if(!isset($b['version'])||!is_int($b['version'])||$b['version']!==(int)$r['version'])throw new HttpError(409,'El pedido cambió. Actualiza el detalle antes de continuar.');
   if(!in_array($r['integration_status'],['not_sent','failed'],true))throw new HttpError(409,'Este pedido ya tiene un envío a Dropi registrado o pendiente de revisión.');
   $check=self::readiness($r);if(!$check['can_submit'])throw new HttpError(409,'Completa los requisitos de envío antes de mandar el pedido a Dropi.');
   $product=ProductOffers::forOrder($r);$integration=Database::one('SELECT * FROM integrations WHERE id=? AND user_id=?',[$product['integration_id'],$owner]);
   if(!$integration)throw new HttpError(409,'La integración de Dropi del producto ya no existe.');
   $payload=self::payload($r,$product);$attempt=Support::uuid();$started=['attempt_id'=>$attempt,'started_at'=>gmdate('c'),'request'=>self::summary($payload)];
   $r=Database::one("UPDATE orders SET integration_status='sending',integration_data=?::jsonb,version=version+1,updated_at=now() WHERE id=? RETURNING *",[Support::json($started),$id]);
   Orders::event($r,'dropi_submit_started',$started,$owner);
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}

  $result=self::send($integration,$payload);

  $db->beginTransaction();
  try{
   $r=Orders::owned($owner,$id,true);$data=json_decode($r['integration_data']??'null',true);
   if($r['integration_status']!=='sending'||($data['attempt_id']??null)!==$attempt)throw new HttpError(409,'El estado del envío cambió durante la operación. Revisa el pedido.');
   $final=$started+['finished_at'=>gmdate('c'),'outcome'=>$result['outcome'],'http_status'=>$result['http_status'],'message'=>$result['message']];
   $r=Database::one('UPDATE orders SET integration_status=?,dropi_order_id=?,integration_data=?::jsonb,version=version+1,updated_at=now() WHERE id=? RETURNING *',[$result['outcome'],$result['dropi_order_id'],Support::json($final),$id]);
   Orders::event($r,['sent'=>'dropi_sent','failed'=>'dropi_rejected','unknown'=>'dropi_unknown'][$result['outcome']],['attempt_id'=>$attempt,'dropi_order_id'=>$result['dropi_order_id'],'http_status'=>$result['http_status'],'message'=>$result['message']],$owner);
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  return Orders::detail($owner,$id);
 }

 /** Operator records what Dropi shows after an attempt with an unknown result. */
 public static function resolve(string $owner,string $id,array $b): array {
  $db=Database::connection();$db->beginTransaction();
  try{
   $r=Orders::owned($owner,$id,true);
   if(!isset($b['version'])||!is_int($b['version'])||$b['version']!==(int)$r['version'])throw new HttpError(409,'El pedido cambió. Actualiza el detalle antes de continuar.');
   if($r['integration_status']!=='unknown'&&!self::stale($r))throw new HttpError(409,'Este pedido no tiene un envío pendiente de revisión.');
   $outcome=$b['outcome']??null;$note=Support::text($b['note']??null,1000);
   if($outcome==='created'){
    $external=$b['dropi_order_id']??null;
    if(!is_string($external)||!preg_match('/^[1-9][0-9]{0,17}$/D',$external))throw new HttpError(422,'Escribe el número de la orden que ves en Dropi.');
    $status='sent';
   }elseif($outcome==='not_created'){$external=null;$status='failed';}
   else throw new HttpError(422,'Indica si encontraste la orden en Dropi.');
   $data=json_decode($r['integration_data']??'null',true)?:[];$data['resolution']=['outcome'=>$outcome,'note'=>$note,'by'=>$owner,'at'=>gmdate('c')];
   $r=Database::one('UPDATE orders SET integration_status=?,dropi_order_id=?,integration_data=?::jsonb,version=version+1,updated_at=now() WHERE id=? RETURNING *',[$status,$external,Support::json($data),$id]);
   Orders::event($r,'dropi_resolved',['outcome'=>$outcome,'dropi_order_id'=>$external,'note'=>$note],$owner);
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  return Orders::detail($owner,$id);
 }

 /** @return array{outcome:'sent'|'failed'|'unknown',dropi_order_id:?string,http_status:int,message:string} */
 private static function send(array $integration,array $payload): array {
  try{$token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);}
  catch(\Throwable){return ['outcome'=>'failed','dropi_order_id'=>null,'http_status'=>0,'message'=>'No se pudo leer el token de la integración. Vuelve a guardarlo.'];}
  if($token===''||strlen($token)>4096||preg_match('/[\r\n]/',$token))return ['outcome'=>'failed','dropi_order_id'=>null,'http_status'=>0,'message'=>'Token de integración inválido.'];
  $c=curl_init(self::endpoint());
  curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_HTTP_VERSION=>CURL_HTTP_VERSION_1_1,
   CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>60,CURLOPT_USERAGENT=>'WordPress/6.5; https://tinbana.com',
   CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
   CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>Support::json($payload),
   CURLOPT_HTTPHEADER=>['Content-Type: application/json;charset=UTF-8','Accept: application/json','dropi-integration-key: '.$token]]);
  if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
  $body=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);$errno=curl_errno($c);curl_close($c);
  return self::classify($body===false?null:(string)$body,$status,$errno,$token);
 }

 /** Pure classification of a create-order response, kept public for unit tests. */
 public static function classify(?string $body,int $status,int $errno,string $token=''): array {
  $out=fn(string $o,string $m,?string $id=null)=>['outcome'=>$o,'dropi_order_id'=>$id,'http_status'=>$status,'message'=>mb_substr($token!==''?str_replace($token,'[redacted]',$m):$m,0,300)];
  if($body===null){
   // Failures before any byte reached Dropi cannot have created an order: DNS (6), connect (7), TLS handshake (35), certificate (60), CA file (77).
   if(in_array($errno,[6,7,35,60,77],true))return $out('failed','No fue posible conectar con Dropi (código '.$errno.'). La orden no se envió.');
   return $out('unknown','Sin respuesta de Dropi (código '.$errno.'). La orden pudo haberse creado.');
  }
  $json=json_decode($body,true);$message=is_array($json)?($json['message']??$json['status']??''):'';if(!is_string($message))$message='';$message=trim(Product::description($message));
  if($status>=200&&$status<300&&is_array($json)&&($json['isSuccess']??null)===true){
   $obj=$json['objects']??null;if(is_array($obj)&&array_is_list($obj))$obj=$obj[0]??null;$id=is_array($obj)?($obj['id']??null):null;
   if(is_int($id)||(is_string($id)&&preg_match('/^[1-9][0-9]{0,17}$/D',$id)))return $out('sent','Orden creada en Dropi.',(string)$id);
   return $out('unknown','Dropi respondió con éxito pero sin número de orden.');
  }
  if($status<500&&$status>=400||($status>=200&&$status<300&&is_array($json)&&($json['isSuccess']??null)===false))return $out('failed','Dropi rechazó la orden'.($message!==''?': '.$message:' (HTTP '.$status.').'));
  return $out('unknown','Respuesta inesperada de Dropi (HTTP '.$status.'). La orden pudo haberse creado.');
 }
}
