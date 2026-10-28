<?php
declare(strict_types=1);
namespace App;

/**
 * Read-only look at how Dropi returns one catalog product (console: dropi:product-probe email product_id): gallery,
 * price, stock and variations, to map variable products and the full gallery. Only the catalog search the panel already
 * uses is called (POST products/index with the id as keyword), with get_stock false (as the panel) and true.
 * Output keeps field names and catalog values; never the token or the supplier's personal data.
 */
final class DropiProductProbe {
 private const URL='https://api.dropi.co/integrations/products/index';
 private static function keys(mixed $v): string {return is_array($v)?'['.implode(',',array_keys($v)).']':gettype($v);}
 private static function short(mixed $v,int $max=160): string {return mb_substr(is_scalar($v)||$v===null?var_export($v,true):Support::json($v),0,$max);}
 /** Image entries: count, keys and the first URLs (path only, no query string). */
 private static function gallery(mixed $g,string $pad): array {
  if(!is_array($g))return [$pad.'gallery: '.self::keys($g)];
  $out=[$pad.'gallery: '.count($g).' elementos'.($g?' | claves '.self::keys($g[array_key_first($g)]):'')];
  foreach(array_slice($g,0,15) as $i=>$img)if(is_array($img))$out[]=$pad.'  #'.($i+1).' main='.self::short($img['main']??null,10).' url='.self::short(strtok((string)($img['urlS3']??$img['url']??''),'?'),140);
  return $out;
 }
 private static function stock(mixed $rows,string $pad,string $label): array {
  if(!is_array($rows))return [$pad.$label.': '.self::keys($rows)];
  $out=[$pad.$label.': '.count($rows).' elementos'.($rows?' | claves '.self::keys($rows[array_key_first($rows)]):'')];
  foreach(array_slice($rows,0,6) as $w)if(is_array($w))$out[]=$pad.'  stock='.self::short($w['stock']??null,20).' bodega='.self::short($w['warehouse']['name']??$w['warehouse_id']??null,60);
  return $out;
 }
 public static function run(string $email,string $productId): string {
  if(!preg_match('/^[1-9][0-9]{0,17}$/D',$productId))throw new \RuntimeException('ID de producto inválido.');
  $user=Database::one('SELECT id FROM users WHERE email=?',[strtolower($email)]);if(!$user)throw new \RuntimeException('No existe ese usuario.');
  $integration=Database::one('SELECT * FROM integrations WHERE user_id=? ORDER BY created_at LIMIT 1',[$user['id']]);
  if(!$integration)throw new \RuntimeException('Ese usuario no tiene integraciones Dropi.');
  $token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);
  $out=['== Dropi product probe '.gmdate('c').' (solo lectura) producto '.$productId];
  foreach([false,true] as $stock){
   $body=['startData'=>0,'pageSize'=>25,'order_type'=>'asc','order_by'=>'id','keywords'=>$productId,'active'=>true,'no_count'=>true,'integration'=>true,'get_stock'=>$stock];
   $c=curl_init(self::URL);
   curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>25,CURLOPT_USERAGENT=>'WordPress/6.5; https://tinbana.com',
    CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>Support::json($body),
    CURLOPT_HTTPHEADER=>['Content-Type: application/json','Accept: application/json','dropi-integration-key: '.$token]]);
   if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
   $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);$errno=curl_errno($c);curl_close($c);
   $out[]='';$out[]='-- POST products/index keywords='.$productId.' get_stock='.($stock?'true':'false');
   if($res===false){$out[]='   sin respuesta (curl '.$errno.')';continue;}
   $json=json_decode((string)$res,true);$out[]='   HTTP '.$status.' | claves: '.self::keys($json);
   if(!is_array($json)||!is_array($json['objects']??null)){$out[]='   '.mb_substr(str_replace($token,'[redacted]',strip_tags((string)$res)),0,400);continue;}
   $p=null;foreach($json['objects'] as $o)if(is_array($o)&&(string)($o['id']??'')===$productId)$p=Dropi::redact($o,$token);
   $out[]='   resultados: '.count($json['objects']).($p?' | encontrado':' | NO aparece ese ID en la búsqueda');
   if(!$p)continue;
   $out[]='   claves del producto: '.self::keys($p);
   foreach(['name','type','sale_price','suggested_price','sku','active','stock','visibility'] as $k)if(array_key_exists($k,$p))$out[]='   '.$k.' = '.self::short($p[$k]);
   $out=array_merge($out,self::gallery($p['gallery']??null,'   '),self::stock($p['warehouse_product']??null,'   ','warehouse_product'));
   $out[]='   attributes: '.self::short($p['attributes']??null,600);
   $out[]='   user (solo claves): '.self::keys($p['user']??null);
   $vars=$p['variations']??null;$out[]='   variations: '.(is_array($vars)?count($vars).' elementos':self::keys($vars));
   if(is_array($vars))foreach(array_slice($vars,0,10) as $i=>$v){
    if(!is_array($v))continue;
    $out[]='   == variación #'.($i+1).' claves: '.self::keys($v);
    foreach(['id','name','sku','sale_price','suggested_price','stock','main_image','image'] as $k)if(array_key_exists($k,$v))$out[]='      '.$k.' = '.self::short($v[$k]);
    foreach($v as $k=>$x)if(is_array($x)&&!in_array($k,['gallery','warehouse_product_variation','warehouse_product'],true))$out[]='      '.$k.' = '.self::short($x,400);
    if(array_key_exists('gallery',$v))$out=array_merge($out,self::gallery($v['gallery'],'      '));
    foreach(['warehouse_product_variation','warehouse_product'] as $k)if(array_key_exists($k,$v))$out=array_merge($out,self::stock($v[$k],'      ',$k));
   }
  }
  return implode("\n",$out)."\n";
 }
}
