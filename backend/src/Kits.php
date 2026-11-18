<?php
declare(strict_types=1);
namespace App;

/**
 * Phase B (2026-11-18): «Arma tu kit». The buyer picks a kit size (fixed price per size) and fills it with pieces
 * (repeatable, with an optional maximum per piece; a piece can be marked sold out by hand). One kit per order.
 * The block's items are the pieces (title, image, quantity = maximum per kit or '' for no limit, value 'agotada' =
 * sold out); data.sizes are the sizes. The server validates the choice against the published block and sets the price.
 */
final class Kits {
 public const SOLD_OUT='agotada';

 /** Kit sizes of a kit block: [{id,label,pieces,price}], 1 to 6, validated (called from Blocks::validate). */
 public static function sizes(mixed $value): array {
  if(!is_array($value)||!array_is_list($value)||count($value)<1||count($value)>6)throw new HttpError(422,'«Arma tu kit» necesita entre 1 y 6 tamaños de kit.');$out=[];$ids=[];
  foreach($value as $s){
   if(!is_array($s))throw new HttpError(422,'Tamaño de kit inválido.');$id=$s['id']??Support::uuid();if(!is_string($id)||!Support::isUuid($id)||isset($ids[$id]))throw new HttpError(422,'Identificador de tamaño inválido.');$ids[$id]=true;
   $label=Support::text($s['label']??'',60,false);$pieces=$s['pieces']??null;$price=$s['price']??null;
   if($label==='')throw new HttpError(422,'Cada tamaño de kit necesita un nombre, por ejemplo «Kit de 3».');
   if(!is_int($pieces)||$pieces<1||$pieces>30)throw new HttpError(422,'Cada tamaño de kit debe tener entre 1 y 30 piezas.');
   if($price!==null&&(!is_numeric($price)||(float)$price<=0||(float)$price>999999999))throw new HttpError(422,'El precio del tamaño de kit no es válido.');
   $out[]=['id'=>$id,'label'=>$label,'pieces'=>$pieces,'price'=>$price===null?null:round((float)$price,2)];
  }
  return $out;
 }
 /** Maximum of a piece per kit (item.quantity), or null for no limit. */
 public static function max(array $item): ?int {$q=trim((string)($item['quantity']??''));return ctype_digit($q)&&(int)$q>0?(int)$q:null;}
 public static function soldOut(array $item): bool {return strtolower(trim((string)($item['value']??'')))===self::SOLD_OUT;}

 /** The visible kit block of a landing content, or null. */
 public static function block(array $c): ?array {foreach($c['blocks']??[] as $b)if($b['type']==='kit'&&$b['visible'])return $b;return null;}

 /**
  * Landing order: validates the buyer's kit ({size, pieces:{itemId:count}}) and fixes price and quantity (1 kit).
  * Returns the kit summary stored in the order, or null when the landing has no kit.
  */
 public static function apply(array $r,array &$data,array $b,int $quantity): ?array {
  $block=self::block($r['content']);if(!$block)return null;
  $raw=$b['kit']??null;if(is_string($raw))$raw=json_decode($raw,true);
  if(!is_array($raw)||!is_string($raw['size']??null)||!is_array($raw['pieces']??null))throw new HttpError(422,'Arma tu kit antes de enviar el pedido: elige el tamaño y las piezas.');
  if($quantity!==1)throw new HttpError(422,'Se pide un kit por pedido.');
  $size=null;foreach($block['data']['sizes']??[] as $s)if($s['id']===$raw['size'])$size=$s;
  if(!$size)throw new HttpError(422,'Ese tamaño de kit ya no está disponible. Recarga la página y elige de nuevo.');
  $price=$size['price']??$r['content']['publicPrice'];if($price===null)throw new HttpError(409,'Este kit no tiene precio. Escríbenos para completar tu pedido.');
  $items=[];foreach($block['data']['items']??[] as $i)if($i['visible'])$items[$i['id']]=$i;
  $lines=[];$total=0;
  foreach($raw['pieces'] as $id=>$n){
   if(!is_string($id)||!isset($items[$id]))throw new HttpError(422,'Una de las piezas elegidas ya no está disponible. Recarga la página y arma tu kit de nuevo.');
   if(!is_int($n)||$n<0||$n>30)throw new HttpError(422,'Cantidad de pieza inválida.');if($n===0)continue;
   $item=$items[$id];if(self::soldOut($item))throw new HttpError(409,'«'.$item['title'].'» está agotada. Elige otra pieza.');
   $max=self::max($item);if($max!==null&&$n>$max)throw new HttpError(422,'Puedes elegir máximo '.$max.' de «'.$item['title'].'».');
   $lines[]=['id'=>$id,'name'=>$item['title'],'count'=>$n];$total+=$n;
  }
  if($total!==$size['pieces'])throw new HttpError(422,'Tu '.$size['label'].' lleva '.$size['pieces'].' piezas y elegiste '.$total.'.');
  $text=$size['label'].': '.implode(', ',array_map(fn($l)=>$l['count'].' × '.$l['name'],$lines));
  $data['public_price']=$data['unit_price']=$data['inflated_price']=(float)$price;$data['total']=round((float)$price,2);
  $data['kit']=['block'=>$block['id'],'size_id'=>$size['id'],'size'=>$size['label'],'pieces'=>$size['pieces'],'price'=>(float)$price,'items'=>$lines,'text'=>mb_substr($text,0,900)];
  return $data['kit'];
 }

 /** One line for orders, emails, WhatsApp and Dropi notes ('' when the order has no kit). */
 public static function text(array $productData): string {return is_array($productData['kit']??null)?(string)($productData['kit']['text']??''):'';}
}
