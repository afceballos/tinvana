<?php
declare(strict_types=1);
namespace App;

final class ProductOffers {
 public static function product(string $owner,string $id): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Producto no encontrado.');
  $r=Database::one('SELECT * FROM selected_products WHERE id=? AND user_id=?',[$id,$owner]);
  if(!$r)throw new HttpError(404,'Producto no encontrado.');return $r;
 }
 public static function forOrder(array $order): array {
  $p=Database::one('SELECT p.* FROM selected_products p JOIN landing_pages l ON l.selected_product_id=p.id AND l.user_id=p.user_id JOIN leads a ON a.landing_page_id=l.id AND a.user_id=l.user_id WHERE a.id=? AND p.user_id=?',[$order['lead_id'],$order['user_id']]);
  if(!$p)throw new HttpError(409,'No se encontró el producto original del pedido.');return $p;
 }
 public static function variants(array $p): array {
  $mapped=json_decode($p['mapped_data'],true);$out=[];
  foreach($mapped['variations']??[] as $v){
   if(!is_array($v))continue;$id=(string)($v['id']??'');if(!preg_match('/^[1-9][0-9]{0,17}$/D',$id))continue;
   $label=$v['name']??$v['title']??$v['sku']??null;
   if(!is_string($label)||trim($label)==='')$label='Variante '.$id;
   $out[$id]=['id'=>$id,'label'=>mb_substr(trim($label),0,160),'sku'=>is_string($v['sku']??null)?mb_substr($v['sku'],0,120):null];
  }
  return array_values($out);
 }
 public static function view(string $owner,string $id): array {
  $p=self::product($owner,$id);$r=Database::one('SELECT version,settings FROM product_offers WHERE selected_product_id=? AND user_id=?',[$id,$owner]);$mapped=json_decode($p['mapped_data'],true);
  return ['product'=>['id'=>$id,'name'=>$mapped['name'],'dropi_id'=>(string)$p['dropi_id'],'type'=>$mapped['type']??null],'version'=>$r?(int)$r['version']:0,'settings'=>$r?json_decode($r['settings'],true):['active'=>false,'tiers'=>[],'starts_at'=>null,'ends_at'=>null],'variants'=>self::variants($p)];
 }
 private static function date(mixed $value): ?string {
  if($value===null||$value==='')return null;
  if(!is_string($value)||strlen($value)>35||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/D',$value))throw new HttpError(422,'La vigencia necesita una fecha ISO con zona horaria.');
  try{$d=new \DateTimeImmutable($value);$errors=\DateTimeImmutable::getLastErrors();if($errors&&($errors['warning_count']||$errors['error_count']))throw new \Exception();return $d->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');}catch(\Throwable){throw new HttpError(422,'Fecha de vigencia inválida.');}
 }
 public static function save(string $owner,string $id,array $b): array {
  $product=self::product($owner,$id);$id=$product['id'];$s=$b['settings']??null;
  if(!is_array($s)||!is_bool($s['active']??null)||!is_array($s['tiers']??null)||!array_is_list($s['tiers'])||count($s['tiers'])>10)throw new HttpError(422,'Configura hasta 10 tramos de cantidad.');
  $tiers=[];foreach($s['tiers'] as $tier){
   if(!is_array($tier)||!is_int($tier['min_quantity']??null)||$tier['min_quantity']<1||$tier['min_quantity']>100)throw new HttpError(422,'La cantidad mínima debe estar entre 1 y 100.');
   $qty=$tier['min_quantity'];if(isset($tiers[$qty]))throw new HttpError(422,'No repitas una cantidad mínima.');
   $price=Orders::amount($tier['unit_price']??null);if((float)$price<=0)throw new HttpError(422,'El precio de la oferta debe ser mayor que cero.');
   $tiers[$qty]=['min_quantity'=>$qty,'unit_price'=>$price];
  }
  ksort($tiers);$start=self::date($s['starts_at']??null);$end=self::date($s['ends_at']??null);
  if($start&&$end&&strtotime($end)<=strtotime($start))throw new HttpError(422,'El fin de la oferta debe ser posterior al inicio.');
  if($s['active']&&!$tiers)throw new HttpError(422,'Añade un tramo antes de activar la oferta.');
  $settings=['active'=>$s['active'],'tiers'=>array_values($tiers),'starts_at'=>$start,'ends_at'=>$end];
  if(!is_int($b['version']??null)||$b['version']<0)throw new HttpError(422,'Versión de oferta inválida.');
  $db=Database::connection();$db->beginTransaction();try{
   Database::one('SELECT id FROM selected_products WHERE id=? AND user_id=? FOR UPDATE',[$id,$owner]);
   $old=Database::one('SELECT version FROM product_offers WHERE selected_product_id=? AND user_id=? FOR UPDATE',[$id,$owner]);$version=$old?(int)$old['version']:0;
   if($version!==$b['version'])throw new HttpError(409,'La oferta cambió. Recarga antes de guardar.');
   $version++;Database::query('INSERT INTO product_offers(selected_product_id,user_id,version,settings) VALUES(?,?,?,?::jsonb) ON CONFLICT(selected_product_id) DO UPDATE SET version=excluded.version,settings=excluded.settings,updated_at=now()',[$id,$owner,$version,Support::json($settings)]);
   Database::query('INSERT INTO product_offer_versions(selected_product_id,user_id,version,settings) VALUES(?,?,?,?::jsonb)',[$id,$owner,$version,Support::json($settings)]);$db->commit();return self::view($owner,$id);
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }
 public static function resolve(array $p,mixed $version,int $quantity): array {
  // Lock current configuration so a concurrent edit cannot change the selected tier mid-quote.
  $r=Database::one('SELECT * FROM product_offers WHERE selected_product_id=? AND user_id=? FOR SHARE',[$p['id'],$p['user_id']]);
  if(!$r||!is_int($version)||$version!==(int)$r['version'])throw new HttpError(409,'La oferta cambió o no está disponible. Actualiza el pedido.');
  $s=json_decode($r['settings'],true);
  if(!$s['active']||($s['starts_at']&&strtotime($s['starts_at'])>time())||($s['ends_at']&&strtotime($s['ends_at'])<=time()))throw new HttpError(409,'La oferta no está vigente.');
  $tier=null;foreach($s['tiers'] as $t)if($quantity>=$t['min_quantity'])$tier=$t;
  if(!$tier)throw new HttpError(422,'La cantidad no alcanza el mínimo de esta oferta.');
  return ['selected_product_id'=>$p['id'],'version'=>(int)$r['version'],'min_quantity'=>$tier['min_quantity'],'unit_price'=>$tier['unit_price'],'starts_at'=>$s['starts_at'],'ends_at'=>$s['ends_at']];
 }
}
