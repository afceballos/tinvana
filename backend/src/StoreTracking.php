<?php
declare(strict_types=1);
namespace App;

/**
 * Store-wide measurement: Meta pixel, Google Analytics 4, Google Ads, Google Tag Manager and domain verification.
 * Only IDs with a fixed format are stored. The landing runtime loads the official scripts and sends the events
 * (PageView/ViewContent, InitiateCheckout and Purchase), and the page's CSP opens only the domains those IDs need.
 */
final class StoreTracking {
 public const DEFAULTS=['metaPixel'=>'','ga4'=>'','googleAds'=>'','googleAdsLabel'=>'','gtm'=>'','metaVerify'=>'','googleVerify'=>''];
 /** [format, message]. Each value is trimmed and, for Google IDs, upper-cased before the check. */
 private const RULES=[
  'metaPixel'=>['/^[0-9]{10,20}$/','El ID del píxel de Meta son solo números (entre 10 y 20).'],
  'ga4'=>['/^G-[A-Z0-9]{4,16}$/','El ID de Google Analytics 4 empieza por G- (por ejemplo G-AB12CD34EF).'],
  'googleAds'=>['/^AW-[0-9]{6,14}$/','El ID de Google Ads empieza por AW- seguido de números (por ejemplo AW-123456789).'],
  'googleAdsLabel'=>['/^[A-Za-z0-9_-]{6,40}$/','La etiqueta de conversión de Google Ads solo lleva letras, números, - y _.'],
  'gtm'=>['/^GTM-[A-Z0-9]{4,12}$/','El contenedor de Google Tag Manager empieza por GTM- (por ejemplo GTM-AB12CD3).'],
  'metaVerify'=>['/^[A-Za-z0-9]{20,64}$/','El código de verificación de Meta no tiene el formato esperado.'],
  'googleVerify'=>['/^[A-Za-z0-9_-]{20,100}$/','El código de verificación de Google no tiene el formato esperado.'],
 ];
 private const UPPER=['ga4','googleAds','gtm'];

 public static function view(string $owner): array { return ['tracking'=>self::settings($owner)]; }

 public static function settings(string $owner): array {
  $row=Database::one('SELECT settings FROM store_tracking WHERE user_id=?',[$owner]);
  $saved=$row?json_decode((string)$row['settings'],true):[];$s=self::DEFAULTS;
  foreach(self::DEFAULTS as $k=>$_)if(is_string($saved[$k]??null))$s[$k]=$saved[$k];return $s;
 }

 public static function save(string $owner,array $body): array {
  $s=self::validate($body);$value=Support::json($s);
  if(Database::one('SELECT user_id FROM store_tracking WHERE user_id=?',[$owner]))Database::query('UPDATE store_tracking SET settings=?::jsonb,updated_at=now() WHERE user_id=?',[$value,$owner]);
  else Database::query('INSERT INTO store_tracking(user_id,settings) VALUES(?,?::jsonb)',[$owner,$value]);
  return ['tracking'=>$s,'message'=>'Píxeles guardados. Se aplican a todas tus landings publicadas.'];
 }

 public static function validate(array $body): array {
  if(array_diff(array_keys($body),array_keys(self::DEFAULTS)))throw new HttpError(422,'Campo de medición desconocido.');$s=self::DEFAULTS;
  foreach(self::RULES as $k=>[$format,$message]){
   $v=$body[$k]??'';if(!is_string($v)||strlen($v)>400)throw new HttpError(422,$message);$v=trim($v);
   // People often paste the whole verification tag; keep only its content="…" value.
   if(in_array($k,['metaVerify','googleVerify'],true)&&preg_match('/content\s*=\s*["\']([^"\']+)["\']/i',$v,$m))$v=trim($m[1]);
   if(in_array($k,self::UPPER,true))$v=strtoupper($v);
   if($v!==''&&!preg_match($format,$v))throw new HttpError(422,$message);$s[$k]=$v;
  }
  if($s['googleAdsLabel']!==''&&$s['googleAds']==='')throw new HttpError(422,'Para usar la etiqueta de conversión, escribe también el ID de Google Ads (AW-…).');
  return $s;
 }

 /** Extra CSP sources for the configured tools: [directive => sources]. */
 public static function sources(array $s): array {
  $out=[];$add=function(string $d,array $v)use(&$out){$out[$d]=array_values(array_unique([...($out[$d]??[]),...$v]));};
  if($s['metaPixel']!==''){$add('script-src',['https://connect.facebook.net']);$add('connect-src',['https://www.facebook.com','https://connect.facebook.net']);}
  if($s['ga4']!==''||$s['googleAds']!==''||$s['gtm']!==''){
   $add('script-src',['https://www.googletagmanager.com','https://*.googletagmanager.com','https://www.google-analytics.com','https://googleads.g.doubleclick.net','https://www.googleadservices.com','https://www.google.com']);
   $add('connect-src',['https://*.google-analytics.com','https://*.analytics.google.com','https://*.googletagmanager.com','https://*.g.doubleclick.net','https://www.google.com','https://*.google.com','https://pagead2.googlesyndication.com','https://www.googleadservices.com']);
   $add('frame-src',['https://td.doubleclick.net','https://www.googletagmanager.com']);
  }
  return $out;
 }

 /** Rewrites the Content-Security-Policy header already set for this response with the sources above. */
 public static function allow(array $s): void {
  $extra=self::sources($s);if(!$extra||headers_sent())return;$policy=null;
  foreach(headers_list() as $h)if(stripos($h,'Content-Security-Policy:')===0)$policy=trim(substr($h,strlen('Content-Security-Policy:')));
  if($policy===null)return;header('Content-Security-Policy: '.self::extend($policy,$extra));
 }

 public static function extend(string $policy,array $extra): string {
  $parts=[];foreach(array_filter(array_map('trim',explode(';',$policy))) as $p){$name=strtolower(strtok($p,' '));$parts[$name]=$p;}
  foreach($extra as $d=>$sources)$parts[$d]=($parts[$d]??$d." 'self'").' '.implode(' ',$sources);
  return implode('; ',$parts);
 }

 /**
  * Head markup for a public landing: verification tags and the runtime config (JSON, not executed, so the CSP holds).
  * Nothing in previews: the store's own checks must not count as visits or sales.
  */
 public static function head(array $landing,array $content,bool $preview): string {
  if($preview||empty($landing['user_id']))return '';$s=self::settings((string)$landing['user_id']);$e=fn($v)=>Support::escape($v);$html='';
  if($s['metaVerify']!=='')$html.='<meta name="facebook-domain-verification" content="'.$e($s['metaVerify']).'">';
  if($s['googleVerify']!=='')$html.='<meta name="google-site-verification" content="'.$e($s['googleVerify']).'">';
  if($s['metaPixel']===''&&$s['ga4']===''&&$s['googleAds']===''&&$s['gtm']==='')return $html;
  $snapshot=is_array($landing['product_snapshot']??null)?$landing['product_snapshot']:[];
  $id=(string)($snapshot['id']??$landing['selected_product_id']??$landing['id']??'');
  $config=['meta'=>$s['metaPixel'],'ga4'=>$s['ga4'],'ads'=>$s['googleAds'],'adsLabel'=>$s['googleAdsLabel'],'gtm'=>$s['gtm'],
   'product'=>['id'=>$id,'name'=>(string)($content['title']??''),'price'=>$content['publicPrice']??null,'currency'=>'COP']];
  self::allow($s);
  return $html.'<script type="application/json" id="tb-tracking">'.json_encode($config,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).'</script>';
 }
}
