<?php
declare(strict_types=1);
namespace App;

/**
 * Stock of a landing's product. The page renders with the saved copy; the buy button and the form ask Dropi for the
 * current stock (the same read-only catalog search as «Actualizar desde Dropi»). A check is reused for 10 minutes per
 * product, the form always checks again. The fresh copy is saved in the product and its landings, so the panel and
 * the next visitors see it too. If Dropi does not answer, the saved copy decides and the sale is not blocked.
 */
final class LandingStock {
 public const TTL=600;
 private const TIMEOUT=6;
 private const RETRY=60; // after a Dropi failure, wait a minute before asking again
 public const SOLD_OUT='Este producto no tiene unidades disponibles por ahora.';

 /**
  * Availability from a product copy. Only an explicit 0 means sold out (unknown stock sells). With variants, the
  * landing sells while one visible variant has stock.
  * @return array{available:bool,variants:array<string,bool>}
  */
 public static function availability(array $content,array $snapshot): array {
  if(is_array($snapshot['variants']??null)&&$snapshot['variants']){
   $map=[];foreach(LandingVariants::visible($content,$snapshot) as $v)$map[$v['id']]=$v['available'];
   return ['available'=>in_array(true,$map,true),'variants'=>$map];
  }
  return ['available'=>!Product::soldOut($snapshot),'variants'=>[]];
 }
 /** Saves a fresh Dropi copy in the saved product and its landings (draft and, when published, the live one). */
 public static function store(array $product,array $raw,bool $checked=false): array {
  $mapped=Product::map($raw);$json=Support::json($mapped);
  $db=Database::connection();$db->beginTransaction();
  try{
   Database::query('UPDATE selected_products SET original_data=?::jsonb,mapped_data=?::jsonb'.($checked?',stock_checked_at=now()':'').',updated_at=now() WHERE id=?',[Support::json($raw),$json,$product['id']]);
   Database::query('UPDATE landing_pages SET product_snapshot=?::jsonb,published_product_snapshot=CASE WHEN published_product_snapshot IS NULL THEN NULL ELSE ?::jsonb END,updated_at=now() WHERE selected_product_id=? AND user_id=?',[$json,$json,$product['id'],$product['user_id']]);
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  return $mapped;
 }
 /**
  * Current availability of a published landing ($landing as Landing::published returns it). $fresh skips the
  * 10-minute reuse (the form). source: dropi (just asked), saved (reused copy) or saved_fallback (Dropi failed).
  */
 public static function check(array $landing,bool $fresh=false): array {
  $snapshot=is_array($landing['product_snapshot']??null)?$landing['product_snapshot']:[];$source='saved';
  $p=Database::one('SELECT * FROM selected_products WHERE id=? AND user_id=?',[$landing['selected_product_id']??'',$landing['user_id']??'']);
  if($p&&($fresh||!$p['stock_checked_at']||strtotime((string)$p['stock_checked_at'])<time()-self::TTL)){
   $integration=Database::one('SELECT * FROM integrations WHERE id=? AND user_id=?',[$p['integration_id'],$p['user_id']]);
   if($integration){
    try{$snapshot=self::store($p,Dropi::find($integration,(string)$p['dropi_id'],self::TIMEOUT),true);$source='dropi';}
    catch(HttpError $e){
     if($e->status===422&&str_contains($e->getMessage(),'no devolvió ese ID')){
      // Dropi answered and no longer offers the product (inactive or removed): it cannot be sold.
      Database::query('UPDATE selected_products SET stock_checked_at=now() WHERE id=?',[$p['id']]);
      return ['available'=>false,'variants'=>[],'source'=>'dropi'];
     }
     error_log('Stock check '.$p['id'].': HTTP '.$e->status);$source='saved_fallback';
     Database::query('UPDATE selected_products SET stock_checked_at=? WHERE id=?',[Database::timestamp(gmdate('c',time()-self::TTL+self::RETRY)),$p['id']]);
    }
    catch(\Throwable $e){error_log('Stock check '.$p['id'].': '.get_class($e));$source='saved_fallback';}
   }
  }
  return self::availability(is_array($landing['content']??null)?$landing['content']:[],$snapshot)+['source'=>$source];
 }
}
