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

 public static function run(string $email='',string $destination='11001'): string {
  if(!preg_match('/^[0-9]{5,8}$/D',$destination))throw new \RuntimeException('Código DANE de destino inválido.');
  $user=$email!==''?Database::one('SELECT id FROM users WHERE email=?',[strtolower($email)]):null;
  if($email!==''&&!$user)throw new \RuntimeException('No existe ese usuario.');
  $integration=Database::one('SELECT * FROM integrations'.($user?' WHERE user_id=?':'').' ORDER BY created_at LIMIT 1',$user?[$user['id']]:[]);
  if(!$integration)throw new \RuntimeException('No hay integraciones Dropi configuradas.');
  $product=Database::one('SELECT original_data FROM selected_products WHERE integration_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1',[$integration['id'],$integration['user_id']]);
  $token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);
  $out=['== Dropi shipping probe '.gmdate('c').' (solo lectura)'];
  $raw=$product?json_decode($product['original_data'],true):null;$origin=null;$price=50000;
  if(is_array($raw)){
   $price=(int)round((float)($raw['sale_price']??$raw['suggested_price']??50000));
   $warehouse=$raw['warehouse_product'][0]['warehouse']??null;
   $out[]='Producto '.($raw['id']??'?').' · sale_price '.($raw['sale_price']??'?').' · claves del producto: '.implode(',',array_keys($raw));
   $out[]='Bodega (claves): '.(is_array($warehouse)?implode(',',array_keys($warehouse)):'sin bodega');
   if(is_array($warehouse['city']??null)){$city=$warehouse['city'];$out[]='Ciudad de bodega: '.Support::json(array_intersect_key($city,array_flip(['id','name','cod_dane','code','dane_code','department_id','department'])));$origin=$city['cod_dane']??$city['code']??$city['dane_code']??null;}
  }else $out[]='Sin productos seleccionados en esta integración.';
  // An empty body first: validation errors usually name the expected fields.
  $attempts=[['orders/cotizaEnvioTransportadoraV2',[]],['orders/cotizaEnvioTransportadoraV2',['EnvioConCobro'=>true,'ValorDeclarado'=>$price,'ciudad_remitente'=>['cod_dane'=>$origin],'ciudad_destino'=>['cod_dane'=>$destination]]],['trajectory/bycity',[]]];
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
   $out[]='   HTTP '.$status.(is_array($json)?' · claves: '.implode(',',array_keys($json)):'');
   $out[]='   '.mb_substr(str_replace($token,'[redacted]',$text),0,1500);
  }
  return implode("\n",$out)."\n";
 }
}
