<?php
declare(strict_types=1);
namespace App;

/**
 * Wompi (Colombia) contract, from the official docs (docs.wompi.co, checked 2026-11-17):
 * - Integrity signature: SHA256(reference + amount_in_cents + currency [+ expiration_time] + integrity secret), made on the server.
 * - Event checksum: SHA256(values of signature.properties taken from data, in that order + timestamp + events secret);
 *   it comes in signature.checksum and the X-Event-Checksum header. Wompi expects HTTP 200 and retries 3 times in 24 h.
 * - The browser redirect (?id=) is informative only: a payment counts only from a signed transaction.updated event.
 */
final class Wompi {
 public const SANDBOX='https://sandbox.wompi.co/v1';
 public const PRODUCTION='https://production.wompi.co/v1';
 public const CHECKOUT='https://checkout.wompi.co/p/';
 /** Key prefixes per environment: public, private, events secret, integrity secret. */
 public const PREFIXES=['test'=>['pub_test_','prv_test_','test_events_','test_integrity_'],'prod'=>['pub_prod_','prv_prod_','prod_events_','prod_integrity_']];

 /** API base for an environment. Tests point WOMPI_API_URL at a local simulator (never in production). */
 public static function base(string $environment): string {
  $url=Support::env('WOMPI_API_URL');
  if($url!==''&&Support::env('APP_ENV')!=='production'&&preg_match('~^https://127\.0\.0\.1:[0-9]{2,5}/v1$~D',$url))return $url;
  return $environment==='prod'?self::PRODUCTION:self::SANDBOX;
 }

 public static function integrity(string $reference,int $amountInCents,string $currency,string $secret,?string $expiration=null): string {
  return hash('sha256',$reference.$amountInCents.$currency.($expiration??'').$secret);
 }

 /** True only when the event checksum matches; the property list comes from the event (it may change), never fixed here. */
 public static function eventValid(array $event,string $secret,?string $header=null): bool {
  $props=$event['signature']['properties']??null;$given=(string)($header??$event['signature']['checksum']??'');
  if(!is_array($props)||!$props||$given===''||!isset($event['timestamp'])||!is_array($event['data']??null))return false;$chain='';
  foreach($props as $path){
   if(!is_string($path))return false;$v=$event['data'];
   foreach(explode('.',$path) as $k){if(!is_array($v)||!array_key_exists($k,$v))return false;$v=$v[$k];}
   if(is_array($v))return false;$chain.=is_bool($v)?($v?'true':'false'):(string)$v;
  }
  return hash_equals(strtolower(hash('sha256',$chain.$event['timestamp'].$secret)),strtolower($given));
 }

 /** 'test' or 'prod' when the four keys belong to one environment, otherwise null. */
 public static function environment(string $public,string $private,string $events,string $integrity): ?string {
  foreach(self::PREFIXES as $env=>$p)if(str_starts_with($public,$p[0])&&str_starts_with($private,$p[1])&&str_starts_with($events,$p[2])&&str_starts_with($integrity,$p[3]))return $env;
  return null;
 }

 /**
  * Return address for the checkout, or null: Wompi's edge answers 403 to the whole checkout when redirect-url is not a
  * public https address (checked 2026-11-17 with http://127.0.0.1), so local environments send none.
  */
 public static function redirectUrl(string $path): ?string {
  $app=rtrim(Support::env('APP_URL'),'/');$host=(string)parse_url($app,PHP_URL_HOST);
  if(!str_starts_with($app,'https://')||$host===''||$host==='localhost'||filter_var($host,FILTER_VALIDATE_IP)!==false)return null;
  return $app.$path;
 }

 /** Web Checkout address (redirect, no script on our pages). */
 public static function checkoutUrl(string $public,string $reference,int $amountInCents,string $integritySecret,array $extra=[]): string {
  return self::CHECKOUT.'?'.http_build_query(['public-key'=>$public,'currency'=>'COP','amount-in-cents'=>$amountInCents,'reference'=>$reference,'signature:integrity'=>self::integrity($reference,$amountInCents,'COP',$integritySecret)]+$extra);
 }

 /** JSON request to the Wompi API: [status, decoded body or null]. Keys never appear in logs or output. */
 public static function request(string $base,string $method,string $path,?string $bearer=null,?array $body=null): array {
  $c=curl_init($base.$path);
  curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>20,CURLOPT_USERAGENT=>'Tinbana/1.0',
   CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CUSTOMREQUEST=>$method,
   CURLOPT_HTTPHEADER=>array_merge(['Accept: application/json'],$bearer?['Authorization: Bearer '.$bearer]:[],$body!==null?['Content-Type: application/json']:[])]);
  if($body!==null)curl_setopt($c,CURLOPT_POSTFIELDS,Support::json($body));
  if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
  $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
  $json=is_string($res)?json_decode($res,true):null;return [$status,is_array($json)?$json:null];
 }
}
