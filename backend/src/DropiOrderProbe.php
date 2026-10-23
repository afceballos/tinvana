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
