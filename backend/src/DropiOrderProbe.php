<?php
declare(strict_types=1);
namespace App;

/**
 * Read-only discovery of Dropi's order status contract (console: dropi:order-probe).
 * GET only: PUT on orders/myorders/{id} changes the order state in Dropi (guide generation) and must never be used here.
 * Output shows field names and only status/guide/carrier/date values, never buyer data or the token.
 */
final class DropiOrderProbe {
 private const BASE='https://api.dropi.co/integrations/';
 private const SAFE='/(^id$|status|estado|guia|guide|tracking|transport|company|distribution|carrier|novedad|incidence|created|updated|date|fecha|history|historial|state)/i';

 public static function run(string $dropiId=''): string {
  if($dropiId!==''&&!preg_match('/^[1-9][0-9]{0,17}$/D',$dropiId))throw new \RuntimeException('Número de orden Dropi inválido.');
  $order=Database::one('SELECT o.user_id,o.dropi_order_id,o.lead_id FROM orders o WHERE o.dropi_order_id IS NOT NULL'.($dropiId!==''?' AND o.dropi_order_id=?':'').' ORDER BY o.updated_at DESC LIMIT 1',$dropiId!==''?[$dropiId]:[]);
  if(!$order)throw new \RuntimeException('No hay pedidos enviados a Dropi con número de orden.');
  $product=ProductOffers::forOrder($order);
  $integration=Database::one('SELECT * FROM integrations WHERE id=? AND user_id=?',[$product['integration_id'],$order['user_id']]);if(!$integration)throw new \RuntimeException('La integración del pedido ya no existe.');
  $token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);
  $id=(string)$order['dropi_order_id'];
  $out=['== Dropi order probe '.gmdate('c').' (solo lectura, GET) orden '.$id];
  foreach(['orders/myorders/'.$id,'orders/myorders?result_number=3&start=0'] as $path){
   $c=curl_init(self::BASE.$path);
   curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>20,CURLOPT_USERAGENT=>'WordPress/6.5; https://tinbana.com',CURLOPT_HTTPGET=>true,
    CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
    CURLOPT_HTTPHEADER=>['Accept: application/json','dropi-integration-key: '.$token]]);
   if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
   $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);$errno=curl_errno($c);curl_close($c);
   $out[]='-- GET '.$path;
   if($res===false){$out[]='   sin respuesta (curl '.$errno.')';continue;}
   $json=json_decode((string)$res,true);
   if(!is_array($json)){$out[]='   HTTP '.$status.' (no JSON) '.mb_substr(strip_tags((string)$res),0,200);continue;}
   $out[]='   HTTP '.$status.' | claves: '.implode(',',array_keys($json)).(isset($json['message'])&&is_string($json['message'])?' | message: '.mb_substr(str_replace($token,'[redacted]',$json['message']),0,200):'');
   $objects=$json['objects']??null;
   if(is_array($objects)&&array_is_list($objects)){$out[]='   objects: lista de '.count($objects);foreach(array_slice($objects,0,2) as $o)if(is_array($o))self::describe($o,'   ',$out,0);}
   elseif(is_array($objects))self::describe($objects,'   ',$out,0);
  }
  return implode("\n",$out)."\n";
 }
 /**
  * Wompi phase 4 discovery (console: dropi:order-probe rates [email]). GET only: the store's latest Dropi orders, to see
  * whether the account already has prepaid orders (rate_type other than CON RECAUDO) and how Dropi stores them.
  * Prints counts and, for one example of each rate type, only payment/rate/amount/status fields: no buyer data.
  */
 public static function rates(string $email='',string $dropiId=''): string {
  $user=$email!==''?Database::one('SELECT id FROM users WHERE email=?',[strtolower($email)]):null;
  if($email!==''&&!$user)throw new \RuntimeException('No existe ese usuario.');
  $integration=Database::one('SELECT * FROM integrations'.($user?' WHERE user_id=?':'').' ORDER BY created_at LIMIT 1',$user?[$user['id']]:[]);
  if(!$integration)throw new \RuntimeException('No hay integraciones Dropi configuradas.');
  $token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);
  if($dropiId!=='')return self::rateDetail($token,$dropiId);
  $out=['== Dropi rate probe '.gmdate('c').' (solo lectura, GET) últimos pedidos de la cuenta'];
  $safe='/^(id|rate_type|payment_method_id|payment_method|type|status|total_order|shipping_amount|shipping_price|price|amount|cash_on_delivery|collect|recaudo|value_to_collect|valor_recaudo|dropshipper_amount|supplier_amount|created_at)$/i';
  $rates=[];$examples=[];$seen=0;
  foreach([0,100] as $start){
   $c=curl_init(self::BASE.'orders/myorders?result_number=100&start='.$start);
   curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>30,CURLOPT_USERAGENT=>'WordPress/6.5; https://tinbana.com',CURLOPT_HTTPGET=>true,
    CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_HTTPHEADER=>['Accept: application/json','dropi-integration-key: '.$token]]);
   if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
   $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
   $json=is_string($res)?json_decode($res,true):null;$list=is_array($json['objects']??null)&&array_is_list($json['objects'])?$json['objects']:null;
   $out[]='-- GET orders/myorders?result_number=100&start='.$start.' → HTTP '.$status.($list===null?' (sin lista de pedidos)':' | '.count($list).' pedidos');
   if(!$list)break;
   foreach($list as $o){if(!is_array($o))continue;$seen++;$rate=is_scalar($o['rate_type']??null)?(string)$o['rate_type']:'(sin rate_type)';$rates[$rate]=($rates[$rate]??0)+1;
    if(!isset($examples[$rate])){$ex=[];foreach($o as $k=>$v)if(preg_match($safe,(string)$k)&&!is_array($v))$ex[$k]=is_bool($v)?($v?'true':'false'):mb_substr((string)$v,0,60);$examples[$rate]=$ex;}}
   if(count($list)<100)break;
  }
  $out[]='Pedidos revisados: '.$seen;
  foreach($rates as $rate=>$n)$out[]='rate_type «'.$rate.'»: '.$n.' pedidos | ejemplo: '.Support::json($examples[$rate]);
  if($seen>0&&!array_filter(array_keys($rates),fn($r)=>stripos($r,'SIN')!==false))$out[]='No hay pedidos SIN RECAUDO en los últimos '.$seen.': esta consulta no confirma si la cuenta los acepta.';
  return implode("\n",$out)."\n";
 }
 /**
  * One Dropi order (GET orders/myorders/{id}): every key, two levels deep, and values only of payment, collection,
  * amount, rate, type and status fields, so a prepaid order can be sent exactly like the one Dropi already has.
  * Contact fields (name, phone, email, address, city, document) never print, whatever their key.
  */
 private static function rateDetail(string $token,string $id): string {
  if(!preg_match('/^[1-9][0-9]{0,17}$/D',$id))throw new \RuntimeException('Número de orden Dropi inválido.');
  $c=curl_init(self::BASE.'orders/myorders/'.$id);
  curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>20,CURLOPT_USERAGENT=>'WordPress/6.5; https://tinbana.com',CURLOPT_HTTPGET=>true,
   CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_HTTPHEADER=>['Accept: application/json','dropi-integration-key: '.$token]]);
  if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
  $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
  $out=['== Dropi rate detail '.gmdate('c').' (solo lectura, GET) orden '.$id,'-- GET orders/myorders/'.$id.' → HTTP '.$status];
  $json=is_string($res)?json_decode($res,true):null;$o=is_array($json['objects']??null)?$json['objects']:null;
  if(!$o){$out[]='   sin datos de la orden'.(is_string($json['message']??null)?' | message: '.mb_substr(str_replace($token,'[redacted]',$json['message']),0,200):'');return implode("\n",$out)."\n";}
  $show='/(payment|pago|rate|recaudo|collect|cod$|total|amount|price|precio|valor|shipping|envio|flete|type|tipo|status|estado|method|wallet|commission|comision|discount|descuento|insurance|seguro|declared|declarado|profit|ganancia|supplier_id|warehouse_id|distribution_company_id|quantity|cantidad)/i';
  $hide='/(name|nombre|surname|apellido|phone|telefono|celular|email|correo|dir|address|direccion|city|ciudad|state|departamento|document|cedula|identific|note|nota|client|customer|user$|zip|postal|barrio|neighborhood|token|key)/i';
  $walk=function(array $a,string $pad,int $depth,string $parent='')use(&$walk,&$out,$show,$hide){
   $out[]=$pad.'* claves: '.implode(',',array_keys($a));
   foreach($a as $k=>$v){$k=(string)$k;
    if(is_array($v)){if($depth>=2||preg_match($hide,$k)){$out[]=$pad.'  '.$k.': ['.count($v).']';continue;}$out[]=$pad.'  '.$k.':';$walk(array_is_list($v)&&isset($v[0])&&is_array($v[0])?$v[0]:$v,$pad.'    ',$depth+1,$k);continue;}
    // Ids, and the name of a payment method or rate (not a person), are shown too.
    $named=$k==='name'&&preg_match('/(payment|pago|method|metodo|rate|tarifa)/i',$parent);
    if($k==='id'||$named||(preg_match($show,$k)&&!preg_match($hide,$k)))$out[]=$pad.'  '.$k.' = '.mb_substr(is_bool($v)?($v?'true':'false'):($v===null?'null':(string)$v),0,80);
   }
  };
  $walk($o,'   ',0);
  return implode("\n",$out)."\n";
 }
 /** Keys of every level; values only for status/guide/carrier/date-like keys. */
 private static function describe(array $a,string $pad,array &$out,int $depth): void {
  $out[]=$pad.'* claves: '.implode(',',array_keys($a));
  foreach($a as $k=>$v){
   if(is_array($v)){
    if($depth>=2){$out[]=$pad.'  '.$k.': ['.count($v).']';continue;}
    if(array_is_list($v)){$out[]=$pad.'  '.$k.': lista de '.count($v);if(isset($v[0])&&is_array($v[0]))self::describe($v[0],$pad.'    ',$out,$depth+1);}
    elseif(preg_match(self::SAFE,(string)$k)||$depth<1){$out[]=$pad.'  '.$k.':';self::describe($v,$pad.'    ',$out,$depth+1);}
   }elseif(preg_match(self::SAFE,(string)$k))$out[]=$pad.'  '.$k.' = '.mb_substr(is_bool($v)?($v?'true':'false'):(string)$v,0,120);
  }
 }
}
