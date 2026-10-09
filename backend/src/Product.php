<?php
declare(strict_types=1);
namespace App;
final class Product {
 public static function supplierStatus(array $user):?string {
  // Only explicit upstream verification data; a premium plan is not verification.
  if(is_string($user['verification_status']??null)&&trim($user['verification_status'])!=='')return mb_substr(trim($user['verification_status']),0,100);
  if(is_bool($user['verified']??null))return $user['verified']?'VERIFICADO':'NO VERIFICADO';
  return null;
 }
 public static function number(mixed $v): ?float { return !is_bool($v)&&$v!==null&&$v!==''&&is_numeric($v)&&is_finite((float)$v)?(float)$v:null; }
 public static function image(mixed $v): ?string { if(!is_string($v)||trim($v)==='')return null;$v=trim($v);if(preg_match('/[\x00-\x1f\x7f]/',$v))return null;$v=preg_replace_callback('/[^\x21-\x7e]/u',fn($m)=>rawurlencode($m[0]),$v);if(preg_match('/^[a-z][a-z0-9+.-]*:/i',$v))return Support::url($v)?$v:null;if(str_starts_with($v,'//'))return null;$url='https://d39ru7awumhhs2.cloudfront.net/'.ltrim($v,'/');return Support::url($url)?$url:null; }
 public static function description(mixed $v): string { if(!is_string($v))return '';$v=preg_replace('~<(script|style)\b[^>]*>.*?</\1>~is','',$v);$v=preg_replace('~<br\s*/?>|</p\s*>~i',"\n",$v);$v=preg_replace('~<li\b[^>]*>~i',"\n• ",$v);return trim(html_entity_decode(strip_tags($v),ENT_QUOTES|ENT_HTML5,'UTF-8')); }
 public static function map(array $r): array {
  $gallery=$r['gallery']??[];usort($gallery,fn($a,$b)=>(int)!in_array($a['main']??false,[true,1,'1'],true)<=>(int)!in_array($b['main']??false,[true,1,'1'],true));
  $images=array_values(array_unique(array_filter(array_map(fn($i)=>self::image($i['urlS3']??null)??self::image($i['url']??null),$gallery))));
  $warehouses=array_map(fn($w)=>['name'=>$w['warehouse']['name']??null,'city'=>$w['warehouse']['city']['name']??null,'stock'=>self::number($w['stock']??null)],$r['warehouse_product']??[]);
  $stock=$warehouses&&!in_array(null,array_column($warehouses,'stock'),true)?array_sum(array_column($warehouses,'stock')):null;
  return ['id'=>(string)$r['id'],'name'=>$r['name']??'Producto sin nombre','description'=>self::description($r['description']??''),'price'=>self::number($r['sale_price']??null),'suggestedPrice'=>self::number($r['suggested_price']??null),'cost'=>null,'sku'=>$r['sku']??null,'type'=>$r['type']??null,'images'=>$images,'categories'=>array_map(fn($c)=>['id'=>$c['pivot']['category_id']??null,'name'=>$c['name']??null],$r['categories']??[]),'stock'=>$stock,'warehouses'=>$warehouses,'supplier'=>$r['user']['store_name']??$r['user']['name']??null,'supplierStatus'=>self::supplierStatus($r['user']??[]),'supplierId'=>$r['user']['id']??null,'variations'=>$r['variations']??[],'attributes'=>$r['attributes']??[]];
 }
}
