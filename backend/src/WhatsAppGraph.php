<?php
declare(strict_types=1);
namespace App;

/**
 * WhatsApp Cloud API client (Meta Graph API). Endpoints confirmed in Meta's official documentation (2026-10-26):
 * GET /{phone_number_id} (verified_name, display_phone_number, quality_rating) and POST /{phone_number_id}/messages.
 * The version comes from WHATSAPP_GRAPH_VERSION (v26.0 was current on that date). Tokens never leave the server.
 */
final class WhatsAppGraph {
 public const HOST='https://graph.facebook.com/';
 public const DEFAULT_VERSION='v26.0';

 /** Base URL. Loopback override for the isolated test suite only (like Dropi); production always uses Meta's host. */
 public static function base(): string {
  $url=Support::env('WHATSAPP_GRAPH_URL');
  if($url!==''&&Support::env('APP_ENV')!=='production'&&preg_match('~^https://127\.0\.0\.1:[0-9]{2,5}/$~D',$url))return $url;
  $version=Support::env('WHATSAPP_GRAPH_VERSION',self::DEFAULT_VERSION);
  if(!preg_match('/^v[0-9]{1,3}\.[0-9]$/D',$version))$version=self::DEFAULT_VERSION;
  return self::HOST.$version.'/';
 }

 /** @return array{status:int,json:?array,errno:int} */
 public static function request(string $method,string $path,string $token,?array $body=null,int $timeout=15): array {
  if($token===''||preg_match('/[\r\n]/',$token))throw new HttpError(422,'Token de WhatsApp inválido.');
  if(!preg_match('~^[A-Za-z0-9_/?=&.,-]+$~D',$path))throw new \InvalidArgumentException('Ruta de Graph inválida.');
  $c=curl_init(self::base().$path);
  $headers=['Accept: application/json','Authorization: Bearer '.$token];if($body!==null)$headers[]='Content-Type: application/json';
  curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_CONNECTTIMEOUT=>6,CURLOPT_TIMEOUT=>$timeout,
   CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_HTTPHEADER=>$headers]);
  if($body!==null)curl_setopt($c,CURLOPT_POSTFIELDS,Support::json($body));
  if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
  $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);$errno=curl_errno($c);curl_close($c);
  $json=is_string($res)?json_decode($res,true):null;
  return ['status'=>$status,'json'=>is_array($json)?$json:null,'errno'=>$errno];
 }

 /** Graph error text for the panel, without echoing tokens or request data. */
 public static function error(array $r): string {
  if($r['errno']!==0)return 'No fue posible conectar con Meta desde este servidor.';
  $e=$r['json']['error']??null;$code=is_array($e)&&isset($e['code'])?(int)$e['code']:0;
  if($r['status']===401||$code===190)return 'Meta rechazó el token: revisa que sea el token permanente del usuario del sistema y que no haya vencido.';
  if($code===100||$r['status']===404)return 'Meta no encontró ese número: revisa el Phone Number ID.';
  if($code===10||$code===200)return 'El token no tiene permiso sobre ese número (whatsapp_business_messaging y whatsapp_business_management).';
  return 'Meta respondió con un error (HTTP '.$r['status'].($code?', código '.$code:'').').';
 }

 /** Read-only: the number's verified name, display number and quality. Sends nothing. */
 public static function phone(string $phoneNumberId,string $token): array {
  $r=self::request('GET',rawurlencode($phoneNumberId).'?fields=verified_name,display_phone_number,quality_rating',$token);
  if($r['status']!==200||!is_array($r['json'])||!isset($r['json']['display_phone_number']))throw new HttpError(502,self::error($r));
  $j=$r['json'];
  $s=fn($v,int $max)=>mb_substr(trim(is_scalar($v)?(string)$v:''),0,$max);
  return ['verified_name'=>$s($j['verified_name']??'',200),'display_phone'=>$s($j['display_phone_number'],40),'quality_rating'=>$s($j['quality_rating']??'',20)];
 }
}
