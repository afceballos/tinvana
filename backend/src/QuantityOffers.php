<?php
declare(strict_types=1);
namespace App;

/**
 * Phase A (2026-11-18): the product's quantity offers (ProductOffers, «Precios por cantidad») shown on its landing as
 * pack cards and applied to landing orders. Decisions of the user: pack cards (one per tier, optional «Más elegido»),
 * the Wompi online discount stacks on top, and the tier price wins over a variant's own price.
 * The tier is resolved on the server with ProductOffers::resolve (highest minimum reached), never from the browser.
 */
final class QuantityOffers {
 /** Active tiers of the landing's product within its validity and the landing's maximum quantity, or null. */
 public static function forLanding(array $r): ?array {
  $c=$r['content'];$o=$c['commerce'];
  if(($o['quantityOffers']??false)!==true||!$o['quantityEnabled']||empty($r['selected_product_id'])||empty($r['user_id']))return null;
  $row=Database::one('SELECT version,settings FROM product_offers WHERE selected_product_id=? AND user_id=?',[$r['selected_product_id'],$r['user_id']]);if(!$row)return null;
  $s=json_decode((string)$row['settings'],true);
  if(!is_array($s)||empty($s['active'])||(!empty($s['starts_at'])&&strtotime($s['starts_at'])>time())||(!empty($s['ends_at'])&&strtotime($s['ends_at'])<=time()))return null;
  $tiers=[];foreach((array)($s['tiers']??[]) as $t)if((int)$t['min_quantity']<=(int)$o['maxQuantity'])$tiers[]=['q'=>(int)$t['min_quantity'],'p'=>(float)$t['unit_price']];
  usort($tiers,fn($a,$b)=>$a['q']<=>$b['q']);
  return $tiers?['version'=>(int)$row['version'],'tiers'=>$tiers,'highlight'=>is_int($o['offerHighlight']??null)?$o['offerHighlight']:null]:null;
 }

 /** Unit price of the tier reached by $quantity, or null below the first tier. */
 public static function unitFor(array $packs,int $quantity): ?float {$p=null;foreach($packs['tiers'] as $t)if($quantity>=$t['q'])$p=$t['p'];return $p;}

 /** Pack cards. The reference for the savings is the 1-unit tier, or the landing price when there is none. */
 public static function cards(array $packs,?float $base,bool $compact=false): string {
  $e=fn($v)=>Support::escape($v);$money=fn(float $v)=>'$'.number_format($v,0,',','.');
  $ref=$packs['tiers'][0]['q']===1?$packs['tiers'][0]['p']:$base;$html='';
  foreach($packs['tiers'] as $t){
   $total=$t['p']*$t['q'];$save=$ref!==null&&$ref>$t['p']?($ref-$t['p'])*$t['q']:0;$top=$packs['highlight']===$t['q'];
   $html.='<button type="button" class="qty-pack'.($top?' is-top':'').'" role="radio" aria-checked="'.($t['q']===1?'true':'false').'" data-pack-qty="'.$t['q'].'">'
    .($top?'<span class="qty-pack-badge">Más elegido</span>':'')
    .'<span class="qty-pack-head"><strong>'.$t['q'].' '.($t['q']===1?'unidad':'unidades').'</strong>'.($save>0?'<span class="qty-pack-save">Ahorras '.$e($money($save)).'</span>':'').'</span>'
    .'<span class="qty-pack-price"><b>'.$e($money($t['p'])).'</b>'.($t['q']>1?' c/u':'').'</span>'
    .($t['q']>1?'<span class="qty-pack-total">Total '.$e($money($total)).'</span>':'').'</button>';
  }
  return '<div class="qty-packs'.($compact?' is-compact':'').'" role="radiogroup" aria-label="Elige tu paquete">'.$html.'</div>';
 }

 /**
  * Landing order: the tier price for the quantity (server-side). Returns the offer snapshot, or null when the landing
  * shows no offers or the quantity is below the first tier.
  */
 public static function apply(array $r,array &$data,int $quantity): ?array {
  $packs=self::forLanding($r);if(!$packs||self::unitFor($packs,$quantity)===null)return null;
  try{$offer=ProductOffers::resolve(ProductOffers::product((string)$r['user_id'],(string)$r['selected_product_id']),$packs['version'],$quantity);}catch(HttpError){return null;}
  $unit=(float)$offer['unit_price'];
  $data['public_price']=$data['unit_price']=$data['inflated_price']=$unit;$data['total']=round($unit*$quantity,2);
  $data['quantity_offer']=['version'=>$offer['version'],'min_quantity'=>$offer['min_quantity'],'unit_price'=>$offer['unit_price']];
  return $offer;
 }
}
