<?php
declare(strict_types=1);
namespace App;

/**
 * Read-only discovery of Dropi's freight quote contract (console: dropi:shipping-probe).
 * Only the fixed paths below are called; none of them creates or changes anything in Dropi.
 * Output keeps response shapes and messages, never the token or customer data.
 */
final class DropiProbe {
 private const BASE='https://api.dropi.co/integrations/';
 private const PATHS=['orders/cotizaEnvioTransportadoraV2','trajectory/bycity'];

  /** Scalar values with dotted keys, two levels deep; deeper arrays are listed by their keys. */
 private static function flatten(array $a,string $prefix='',int $depth=0): array {
  $out=[];foreach($a as $k=>$v){$key=$prefix.$k;if(is_array($v))$out+=$depth<1?self::flatten($v,$key.'.',$depth+1):[$key=>'['.implode(',',array_keys($v)).']'];else $out[$key]=$v;}
  return $out;
 }
 /** $full: only the cash-on-delivery quote, carriers in the order Dropi returns them, including distributionCompany and top-level fields (to look for the account carrier preference). */
 public static function run(string $email='',string $destination='11001',bool $full=false): string {
  if(!preg_match('/^[0-9]{5,8}$/D',$destination))throw new \RuntimeException('Código DANE de destino inválido.');
  // Dropi identifies municipalities with the 8-digit DANE code (Cali 76001000); DIVIPOLA 5-digit codes get the 000 suffix.
  if(strlen($destination)===5)$destination.='000';
  $user=$email!==''?Database::one('SELECT id FROM users WHERE email=?',[strtolower($email)]):null;
  if($email!==''&&!$user)throw new \RuntimeException('No existe ese usuario.');
  $integration=Database::one('SELECT * FROM integrations'.($user?' WHERE user_id=?':'').' ORDER BY created_at LIMIT 1',$user?[$user['id']]:[]);
  if(!$integration)throw new \RuntimeException('No hay integraciones Dropi configuradas.');
  $product=Database::one('SELECT original_data FROM selected_products WHERE integration_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1',[$integration['id'],$integration['user_id']]);
  $token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);
  $out=['== Dropi shipping probe '.gmdate('c').' (solo lectura) destino '.$destination];
  $raw=$product?json_decode($product['original_data'],true):null;$origin=null;$price=50000;
  if(is_array($raw)){
   $price=(int)round((float)($raw['sale_price']??$raw['suggested_price']??50000));
   $warehouse=$raw['warehouse_product'][0]['warehouse']??null;
   $out[]='Producto '.($raw['id']??'?').' | sale_price '.($raw['sale_price']??'?').' | claves del producto: '.implode(',',array_keys($raw));
   $out[]='Bodega (claves): '.(is_array($warehouse)?implode(',',array_keys($warehouse)):'sin bodega');
   if(is_array($warehouse['city']??null)){$city=$warehouse['city'];$out[]='Ciudad de bodega: '.Support::json(array_intersect_key($city,array_flip(['id','name','cod_dane','code','dane_code','department_id','department'])));$origin=$city['cod_dane']??$city['code']??$city['dane_code']??null;}
  }else $out[]='Sin productos seleccionados en esta integración.';
  // Body confirmed on 2026-10-23 (cash on delivery and prepaid): EnvioConCobro, ValorDeclarado, ciudad_remitente/ciudad_destino.cod_dane.
  $attempts=[['orders/cotizaEnvioTransportadoraV2',['EnvioConCobro'=>true,'ValorDeclarado'=>$price,'ciudad_remitente'=>['cod_dane'=>$origin],'ciudad_destino'=>['cod_dane'=>$destination]]],['orders/cotizaEnvioTransportadoraV2',['EnvioConCobro'=>false,'ValorDeclarado'=>$price,'ciudad_remitente'=>['cod_dane'=>$origin],'ciudad_destino'=>['cod_dane'=>$destination]]]];
  if($full)$attempts=[$attempts[0]];
  foreach($attempts as [$path,$body]){
   if(!in_array($path,self::PATHS,true))continue;
   $c=curl_init(self::BASE.$path);
   curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>20,CURLOPT_USERAGENT=>'WordPress/6.5; https://tinbana.com',
    CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>Support::json((object)$body),
    CURLOPT_HTTPHEADER=>['Content-Type: application/json;charset=UTF-8','Accept: application/json','dropi-integration-key: '.$token]]);
   if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
   $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);$errno=curl_errno($c);curl_close($c);
   $out[]='-- POST '.$path.' body='.Support::json((object)$body);
   if($res===false){$out[]='   sin respuesta (curl '.$errno.')';continue;}
   $json=json_decode((string)$res,true);$text=is_array($json)?Support::json(Dropi::redact($json,$token)):mb_substr(strip_tags((string)$res),0,300);
   $out[]='   HTTP '.$status.(is_array($json)?' | claves: '.implode(',',array_keys($json)):'');
   if($full&&is_array($json)){foreach($json as $k=>$v)if($k!=='objects')$out[]='   top.'.$k.' = '.mb_substr(Support::json(is_array($v)?self::flatten(Dropi::redact($v,$token)):$v),0,600);}
   if($full&&is_array($json)&&is_array($json['objects']??null)&&array_is_list($json['objects'])){foreach($json['objects'] as $i=>$o){if(!is_array($o))continue;$o=Dropi::redact($o,$token);$dc=is_array($o['distributionCompany']??null)?$o['distributionCompany']:null;unset($o['distributionCompany']);$out[]='   #'.($i+1).' '.mb_substr(Support::json(self::flatten($o)),0,700);$out[]='      distributionCompany: '.($dc===null?'(no viene)':mb_substr(Support::json(self::flatten($dc)),0,1800));}continue;}
   // One line per carrier: every scalar field except the bulky distributionCompany record.
   if(is_array($json)&&is_array($json['objects']??null)&&array_is_list($json['objects'])){foreach($json['objects'] as $o){if(!is_array($o))continue;$o=Dropi::redact($o,$token);unset($o['distributionCompany']);$flat=self::flatten($o);$out[]='   * '.mb_substr(Support::json($flat),0,1400);}continue;}
   $out[]='   '.mb_substr(str_replace($token,'[redacted]',$text),0,1500);
  }
  return implode("\n",$out)."\n";
 }
}
