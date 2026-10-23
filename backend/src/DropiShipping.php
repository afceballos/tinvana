<?php
declare(strict_types=1);
namespace App;

/**
 * Freight quote from Dropi for a landing's buyer city (opt-in per landing: commerce.dropiShipping).
 * Contract confirmed on 2026-10-23 with the real token (DropiProbe): POST orders/cotizaEnvioTransportadoraV2
 * {EnvioConCobro, ValorDeclarado, ciudad_remitente:{cod_dane}, ciudad_destino:{cod_dane}} returns one entry
 * per carrier with objects.precioEnvio or an error. Read-only: it never creates anything in Dropi.
 * Choice agreed with the user: cheapest carrier without error, rounded up to $1.000.
 */
final class DropiShipping {
 public const URL='https://api.dropi.co/integrations/orders/cotizaEnvioTransportadoraV2';
 private const TTL=21600;

 private static function endpoint(): string {
  // Loopback override for the isolated test suite only; production always uses the fixed host.
  $url=Support::env('DROPI_QUOTE_URL');
  if($url!==''&&Support::env('APP_ENV')!=='production'&&preg_match('~^https://127\.0\.0\.1:[0-9]{2,5}/[A-Za-z0-9/]*$~D',$url))return $url;
  return self::URL;
 }
 /** Dropi uses 8-digit DANE municipality codes (Cali 76001000); DIVIPOLA 5-digit codes get the 000 suffix. */
 public static function dane(string $code): ?string {
  if(preg_match('/^[0-9]{8}$/D',$code))return $code;
  return preg_match('/^[0-9]{5}$/D',$code)?$code.'000':null;
 }
 public static function origin(array $raw): ?string {
  foreach($raw['warehouse_product']??[] as $w){$code=$w['warehouse']['city']['cod_dane']??null;if(is_string($code)&&($dane=self::dane($code)))return $dane;}
  return null;
 }
 /** @return array{amount:int,raw:float,carrier:string,carrier_id:int|null}|null */
 public static function pick(array $objects): ?array {
  $best=null;
  foreach($objects as $o){
   if(!is_array($o))continue;$price=$o['objects']['precioEnvio']??null;
   if(!empty($o['error'])||!is_numeric($price)||(float)$price<=0)continue;
   if($best===null||(float)$price<$best['raw'])$best=['raw'=>(float)$price,'carrier'=>(string)($o['transportadora']??''),'carrier_id'=>is_numeric($o['transportadora_id']??null)?(int)$o['transportadora_id']:null];
  }
  if($best===null)return null;
  $best['amount']=(int)(ceil($best['raw']/1000)*1000);
  return $best;
 }
 private static function cachePath(string $key): string {return dirname(__DIR__).'/storage/cache/shipping/'.$key.'.json';}
 public static function quote(array $integration,string $origin,string $destination,int $declared,bool $cod=true): ?array {
  $body=['EnvioConCobro'=>$cod,'ValorDeclarado'=>$declared,'ciudad_remitente'=>['cod_dane'=>$origin],'ciudad_destino'=>['cod_dane'=>$destination]];
  $key=hash('sha256',$integration['id'].'|'.Support::json($body));$file=self::cachePath($key);
  if(is_file($file)&&filemtime($file)>time()-self::TTL){$cached=json_decode((string)file_get_contents($file),true);if(is_array($cached))return $cached['quote'];}
  try{$token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);}catch(\Throwable){return null;}
  if($token===''||preg_match('/[\r\n]/',$token))return null;
  $c=curl_init(self::endpoint());
  curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>12,CURLOPT_USERAGENT=>'WordPress/6.5; https://tinbana.com',
   CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>Support::json($body),
   CURLOPT_HTTPHEADER=>['Content-Type: application/json;charset=UTF-8','Accept: application/json','dropi-integration-key: '.$token]]);
  if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
  $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
  $json=$res===false?null:json_decode((string)$res,true);
  if($status<200||$status>=300||!is_array($json)||($json['isSuccess']??false)!==true||!is_array($json['objects']??null)){error_log('Tinvana shipping quote failed status='.$status);return null;}
  $quote=self::pick($json['objects']);
  if(!is_dir(dirname($file)))@mkdir(dirname($file),0700,true);
  @file_put_contents($file,Support::json(['quote'=>$quote]),LOCK_EX);
  return $quote;
 }
 /** Quote for a published landing; null when disabled, not computable or Dropi has no carrier for the city. */
 public static function forLanding(array $landing,string $cityCode,int $quantity): ?array {
  $r=Landing::decode($landing);$c=$r['content'];
  if(($c['commerce']['dropiShipping']??false)!==true||$c['publicPrice']===null)return null;
  $destination=self::dane($cityCode);if(!$destination)return null;
  $p=Database::one('SELECT integration_id,original_data FROM selected_products WHERE id=? AND user_id=?',[$r['selected_product_id'],$r['user_id']]);if(!$p)return null;
  $origin=self::origin(json_decode((string)$p['original_data'],true)?:[]);if(!$origin)return null;
  $integration=Database::one('SELECT * FROM integrations WHERE id=? AND user_id=?',[$p['integration_id'],$r['user_id']]);if(!$integration)return null;
  // Orders are sent as CON RECAUDO, so quote cash on delivery for the declared product total.
  return self::quote($integration,$origin,$destination,(int)round($c['publicPrice']*$quantity),true);
 }
}
