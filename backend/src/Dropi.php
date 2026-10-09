<?php
declare(strict_types=1);
namespace App;
final class Dropi {
 public static function parameters(array $q): array {
  $page=filter_var($q['page']??1,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>100000]]);if($page===false)throw new HttpError(422,'Página inválida.');
  $sort=$q['sort']??'default';$orders=['default'=>['id','asc'],'recent'=>['id','desc'],'name_asc'=>['name','asc'],'name_desc'=>['name','desc']];if(!is_string($sort)||!isset($orders[$sort]))throw new HttpError(422,'Orden inválido.');
  $keywords=Support::text($q['search']??'',150,false);
  $size=filter_var($q['pageSize']??25,FILTER_VALIDATE_INT);if(!in_array($size,[25,30,50],true))throw new HttpError(422,'Tamaño de página inválido.');
  return self::payload(['pageSize'=>$size,'startData'=>($page-1)*$size,'order_by'=>$orders[$sort][0],'order_type'=>$orders[$sort][1],'keywords'=>$keywords,'category_id'=>$q['category']??'']);
 }
 public static function payload(array $input): array {
  $start=filter_var($input['startData']??0,FILTER_VALIDATE_INT);
  $size=filter_var($input['pageSize']??50,FILTER_VALIDATE_INT);
  $orderBy=$input['order_by']??'id';$orderType=$input['order_type']??'asc';$keywords=$input['keywords']??'';
  if($start===false||$start<0||$start>10000000||!in_array($size,[1,20,25,30,50],true)
   ||!in_array($orderBy,['id','name','price','sale_price'],true)||!in_array($orderType,['asc','desc'],true)
   ||!is_string($keywords)||strlen($keywords)>300)throw new HttpError(422,'Filtros Dropi inválidos.');
  $body=['startData'=>$start,'pageSize'=>$size,'order_type'=>$orderType,'order_by'=>$orderBy,
   'keywords'=>$keywords,'active'=>true,'no_count'=>true,'integration'=>true,'get_stock'=>false];
  if(isset($input['category_id'])&&$input['category_id']!==''){
   $category=filter_var($input['category_id'],FILTER_VALIDATE_INT);
   if($category===false||$category<1)throw new HttpError(422,'Categoría inválida.');$body['category_id']=$category;
  }
  return $body;
 }
 // Sanitize successful responses too, before caching or saving a product snapshot.
 public static function redact(mixed $value,string $secret): mixed {
  if(is_array($value)){
   foreach($value as $key=>$item){
    if(in_array(strtolower((string)$key),['dropi-integration-key','dropi_integration_key','token','access_token','refresh_token','token_ciphertext'],true))unset($value[$key]);
    else $value[$key]=self::redact($item,$secret);
   }
   return $value;
  }
  return is_string($value)&&$secret!==''?str_replace($secret,'[redacted]',$value):$value;
 }
 public static function request(array $integration,array $params=[],bool $categories=false): array {
  $token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);
  if($token===''||strlen($token)>4096||preg_match('/[\r\n]/',$token))throw new HttpError(422,'Token de integración inválido.');
  $payload=$categories?null:self::payload($params);
  $c=curl_init($categories?'https://api.dropi.co/integrations/categories':'https://api.dropi.co/integrations/products/index');
  curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_HTTP_VERSION=>CURL_HTTP_VERSION_1_1,
   CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>20,CURLOPT_USERAGENT=>'WordPress/6.5; https://zenzales.com',
   CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
   CURLOPT_HTTPHEADER=>['Content-Type: application/json','Accept: application/json','dropi-integration-key: '.$token]]);
  if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
  if($payload!==null)curl_setopt_array($c,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>Support::json($payload)]);
  $body=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);$error=curl_errno($c);curl_close($c);
  if($body===false)throw new HttpError(502,'No fue posible conectar con Dropi.',['upstream_status'=>$status,'transport_code'=>$error]);
  $json=json_decode($body,true);
  if(is_array($json))$json=self::redact($json,$token);
  if($status<200||$status>=300) { $msg=is_array($json)?($json['message']??$json['error']??''):''; if(!is_string($msg))$msg='';$msg=str_replace($token,'[redacted]',Product::description($msg));throw new HttpError(502,'Dropi devolvió HTTP '.$status.($msg?': '.substr($msg,0,250):''),['upstream_status'=>$status]); }
  if(!is_array($json)||($json['isSuccess']??true)===false||!isset($json['objects'])||!is_array($json['objects']))throw new HttpError(502,'Dropi no devolvió una respuesta de productos válida.');
  return $json;
 }
 public static function find(array $integration,string $id): array {
  // Query a bounded search, then verify the exact ID. Never trust client-supplied product snapshots.
  $r=self::request($integration,['keywords'=>$id]);
  foreach($r['objects'] as $p)if((string)($p['id']??'')===$id)return $p;
  throw new HttpError(422,'Dropi no devolvió ese ID al buscarlo. Selecciona el producto desde una página reciente del catálogo.');
 }
}
