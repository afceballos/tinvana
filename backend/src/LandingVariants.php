<?php
declare(strict_types=1);
namespace App;

/**
 * Variants of a landing: the product's Dropi variants (product snapshot, renewed by «Actualizar desde Dropi») plus the
 * store's choices per variant in content.variants.items[id] = {price, image, hidden}. A variant without its own price
 * uses the landing's public price; without its own image, the one Dropi gave (the product photo). Variants that Dropi
 * no longer returns disappear; new ones appear visible with the landing price. Stock 0 shows as sold out.
 */
final class LandingVariants {
 private const MAX=300;

 /** Store choices from the editor. */
 public static function validate(mixed $value): array {
  if($value===null)return ['items'=>(object)[]];
  if(!is_array($value))throw new HttpError(422,'Variantes inválidas.');
  $items=$value['items']??[];if(is_object($items))$items=(array)$items;if(!is_array($items)||count($items)>self::MAX)throw new HttpError(422,'Variantes inválidas.');$out=[];
  foreach($items as $id=>$item){
   $id=(string)$id;if(!preg_match('/^[1-9][0-9]{0,17}$/D',$id)||!is_array($item))throw new HttpError(422,'Variante inválida.');
   $price=$item['price']??null;if($price!==null&&($price===''||!is_numeric($price)||!is_finite((float)$price)||(float)$price<=0||(float)$price>999999999))throw new HttpError(422,'El precio de cada variante debe ser mayor que cero.');
   $image=$item['image']??'';if(!is_string($image)||strlen($image)>2000||($image!==''&&!Support::url(trim($image))))throw new HttpError(422,'Solo se permiten URLs HTTP o HTTPS para las fotos de las variantes.');
   $hidden=$item['hidden']??false;if(!is_bool($hidden))throw new HttpError(422,'Variante inválida.');
   if($price===null&&$image===''&&!$hidden)continue;
   $out[$id]=['price'=>$price===null?null:round((float)$price,2),'image'=>trim($image),'hidden'=>$hidden];
  }
  return ['items'=>$out?:(object)[]];
 }
 /**
  * Variants shown on the landing, with the final price and image, in Dropi's order.
  * @return list<array{id:string,label:string,options:array<string,string>,price:?float,image:?string,available:bool}>
  */
 public static function visible(array $content,array $snapshot): array {
  $items=(array)($content['variants']['items']??[]);$out=[];
  foreach(is_array($snapshot['variants']??null)?$snapshot['variants']:[] as $v){
   $id=(string)($v['id']??'');$own=(array)($items[$id]??[]);if($id===''||($own['hidden']??false)===true)continue;
   $options=[];foreach($v['options']??[] as $o)if(is_array($o)&&isset($o['name'],$o['value']))$options[(string)$o['name']]=(string)$o['value'];
   if(!$options)$options=['Opción'=>(string)$v['label']];
   $out[]=['id'=>$id,'label'=>(string)$v['label'],'options'=>$options,'price'=>isset($own['price'])?(float)$own['price']:($content['publicPrice']===null?null:(float)$content['publicPrice']),
    'image'=>($own['image']??'')!==''?$own['image']:($v['image']??null),'available'=>($v['stock']??null)!==0&&($v['stock']??null)!==0.0];
  }
  return $out;
 }
 /** Option names and their values in order of appearance, e.g. Color: Negro, Blanco; Talla: S, M… */
 public static function options(array $variants): array {
  $out=[];foreach($variants as $v)foreach($v['options'] as $name=>$value){$out[$name]??=[];if(!in_array($value,$out[$name],true))$out[$name][]=$value;}
  return $out;
 }
 /** The variant chosen in the form (by id, or by its options without JavaScript); null when the landing has none. */
 public static function chosen(array $content,array $snapshot,array $b): ?array {
  $list=self::visible($content,$snapshot);if(!$list)return null;
  $id=$b['variant_id']??'';$picked=null;
  if(is_string($id)&&$id!==''){foreach($list as $v)if($v['id']===$id)$picked=$v;}
  elseif(is_array($b['variant_option']??null)){$want=$b['variant_option'];foreach($list as $v){$ok=true;foreach($v['options'] as $n=>$val)if(($want[$n]??null)!==$val)$ok=false;if($ok){$picked=$v;break;}}}
  if(!$picked)throw new HttpError(422,'Elige '.mb_strtolower(implode(' y ',array_keys(self::options($list)))).' antes de enviar tu pedido.');
  if(!$picked['available'])throw new HttpError(422,'Esa opción está agotada. Elige otra, por favor.');
  if($picked['price']===null)throw new HttpError(422,'Esta opción aún no tiene precio. Escríbenos para ayudarte.');
  return $picked;
 }
 /** Picker for the purchase dialog: one group of choices per option, plus the data the runtime uses. */
 public static function picker(array $content,array $snapshot): string {
  $list=self::visible($content,$snapshot);if(!$list)return '';
  $e=fn($v)=>Support::escape((string)$v);$html='<div class="vp" data-variant-picker><input type="hidden" name="variant_id" form="lead-form" data-lead-variant value="">';
  foreach(self::options($list) as $name=>$values){
   $html.='<fieldset class="vp-group" data-vp-option="'.$e($name).'"><legend><span>'.$e($name).'</span><strong class="vp-current" data-vp-current aria-live="polite"></strong></legend><div class="vp-choices">';
   foreach($values as $value)$html.='<label class="vp-choice"><input type="radio" name="variant_option['.$e($name).']" value="'.$e($value).'" form="lead-form" required data-vp-input><span>'.$e($value).'</span></label>';
   $html.='</div></fieldset>';
  }
  $data=array_map(fn($v)=>['id'=>$v['id'],'label'=>$v['label'],'options'=>$v['options'],'price'=>$v['price'],'image'=>$v['image'],'available'=>$v['available']],$list);
  return $html.'<p class="vp-error" data-vp-error role="alert" hidden></p><script type="application/json" data-vp-data>'.str_replace('</','<\/',Support::json($data)).'</script></div>';
 }
}
