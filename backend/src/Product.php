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
 /** Readable option value: words become "Negro" or "Talla"; sizes such as XL or 2XL stay as they are. */
 public static function optionValue(string $v): string {$v=trim($v);return preg_match('/^\p{L}{4,}(?:\s\p{L}+)*$/u',$v)?mb_convert_case(mb_strtolower($v),MB_CASE_TITLE):$v;}
 /**
  * Variants of a VARIABLE product (Dropi probe of 2026-10-28: price, suggested price and stock live in each variation,
  * stock per warehouse in warehouse_product_variation, options in attribute_values; variations have no photos). Each
  * one starts with the product's main photo; the store can change it later in the landing.
  */
 public static function variants(array $r,?string $image=null): array {
  $out=[];
  foreach(is_array($r['variations']??null)?$r['variations']:[] as $v){
   if(!is_array($v)||!empty($v['deleted_at']))continue;$id=(string)($v['id']??'');if(!preg_match('/^[1-9][0-9]{0,17}$/D',$id))continue;
   $options=[];foreach(is_array($v['attribute_values']??null)?$v['attribute_values']:[] as $a)if(is_array($a)&&is_scalar($a['value']??null)&&trim((string)$a['value'])!=='')$options[]=['name'=>self::optionValue((string)($a['attribute_name']??'Opción')),'value'=>self::optionValue((string)$a['value'])];
   $warehouses=[];foreach(is_array($v['warehouse_product_variation']??null)?$v['warehouse_product_variation']:[] as $w)if(is_array($w))$warehouses[]=['id'=>(string)($w['warehouse_id']??$w['warehouse']['id']??''),'name'=>$w['warehouse']['name']??null,'city'=>$w['warehouse']['city']['name']??null,'stock'=>self::number($w['stock']??null)];
   $stock=$warehouses&&!in_array(null,array_column($warehouses,'stock'),true)?array_sum(array_column($warehouses,'stock')):self::number($v['stock']??null);
   $label=$options?implode(' · ',array_column($options,'value')):(is_string($v['name']??null)&&trim($v['name'])!==''?trim($v['name']):'Variante '.$id);
   $out[]=['id'=>$id,'label'=>mb_substr($label,0,160),'options'=>$options,'sku'=>is_scalar($v['sku']??null)?mb_substr((string)$v['sku'],0,120):null,'price'=>self::number($v['sale_price']??null),'suggestedPrice'=>self::number($v['suggested_price']??null),'stock'=>$stock,'image'=>$image,'warehouses'=>$warehouses];
  }
  return $out;
 }
 public static function map(array $r): array {
  $gallery=$r['gallery']??[];usort($gallery,fn($a,$b)=>(int)!in_array($a['main']??false,[true,1,'1'],true)<=>(int)!in_array($b['main']??false,[true,1,'1'],true));
  $images=array_values(array_unique(array_filter(array_map(fn($i)=>self::image($i['urlS3']??null)??self::image($i['url']??null),$gallery))));
  $warehouses=array_map(fn($w)=>['name'=>$w['warehouse']['name']??null,'city'=>$w['warehouse']['city']['name']??null,'stock'=>self::number($w['stock']??null)],$r['warehouse_product']??[]);
  $stock=$warehouses&&!in_array(null,array_column($warehouses,'stock'),true)?array_sum(array_column($warehouses,'stock')):null;
  $variants=self::variants($r,$images[0]??null);$price=self::number($r['sale_price']??null);$suggested=self::number($r['suggested_price']??null);$priceMax=null;
  if($variants){
   // Variable product: price range, suggested price and stock come from its variants; warehouses add up per warehouse.
   $prices=array_values(array_filter(array_column($variants,'price'),fn($p)=>$p!==null));$suggestions=array_values(array_filter(array_column($variants,'suggestedPrice'),fn($p)=>$p!==null));
   if($price===null&&$prices){$price=min($prices);$priceMax=max($prices)>$price?max($prices):null;}
   if($suggested===null&&$suggestions)$suggested=min($suggestions);
   if(!$warehouses){$byId=[];foreach($variants as $v)foreach($v['warehouses'] as $w){$k=$w['id']!==''?$w['id']:(string)$w['name'];$byId[$k]??=['name'=>$w['name'],'city'=>$w['city'],'stock'=>0.0];$byId[$k]['stock']=$w['stock']===null||$byId[$k]['stock']===null?null:$byId[$k]['stock']+$w['stock'];}$warehouses=array_values($byId);}
   $known=array_column($variants,'stock');$stock=$stock??(!in_array(null,$known,true)?array_sum($known):null);
  }
  foreach($variants as &$v)unset($v['warehouses']);unset($v);
  return ['id'=>(string)$r['id'],'name'=>$r['name']??'Producto sin nombre','description'=>self::description($r['description']??''),'price'=>$price,'priceMax'=>$priceMax,'suggestedPrice'=>$suggested,'variants'=>$variants,'cost'=>null,'sku'=>$r['sku']??null,'type'=>$r['type']??null,'images'=>$images,'categories'=>array_map(fn($c)=>['id'=>$c['pivot']['category_id']??null,'name'=>$c['name']??null],$r['categories']??[]),'stock'=>$stock,'warehouses'=>$warehouses,'supplier'=>$r['user']['store_name']??$r['user']['name']??null,'supplierStatus'=>self::supplierStatus($r['user']??[]),'supplierId'=>$r['user']['id']??null,'variations'=>$r['variations']??[],'attributes'=>$r['attributes']??[]];
 }
}
