<?php
declare(strict_types=1);
namespace App;
final class Blocks {
 public const DROPI_FIELDS=['id','sku','categories','stock','supplier','supplierStatus','type','warehouses'];
 public static function registry():array {static $r;return $r??=json_decode(file_get_contents(dirname(__DIR__).'/blocks.json'),true,512,JSON_THROW_ON_ERROR);}
 public static function rich(string $html):string {
  if($html==='')return '';
  $doc=new \DOMDocument();$before=libxml_use_internal_errors(true);
  try{$doc->loadHTML('<?xml encoding="UTF-8"><div>'.$html.'</div>',LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);}
  finally{libxml_clear_errors();libxml_use_internal_errors($before);}
  $walk=function(\DOMNode $node)use(&$walk):string {
   if($node instanceof \DOMText)return Support::escape($node->nodeValue);
   if(!($node instanceof \DOMElement))return '';
   $tag=strtolower($node->tagName);if(in_array($tag,['script','style','iframe','object','embed','svg','math','template','head','link','meta'],true))return '';
   $inside='';foreach($node->childNodes as $child)$inside.=$walk($child);
   if($tag==='span'&&preg_match('/background-color:\s*(?:#e7efc7|rgb\(231,\s*239,\s*199\))/i',$node->getAttribute('style')))return '<mark>'.$inside.'</mark>';
   if(!in_array($tag,['p','br','strong','b','em','i','a','ul','ol','li','mark'],true))return $inside;
   if($tag==='br')return '<br>';
   $attrs='';if($tag==='a'){$href=trim($node->getAttribute('href'));if(!Support::url($href)&&!preg_match('/^#[a-zA-Z0-9_-]+$/',$href))return $inside;$attrs=' href="'.Support::escape($href).'" rel="noopener noreferrer"';}
   return '<'.$tag.$attrs.'>'.$inside.'</'.$tag.'>';
  };
  return $walk($doc->documentElement);
 }
 public static function text(mixed $value,int $max=20000):string {return Support::text($value??'', $max,false);}
 public static function images(mixed $value):array {
  if(!is_array($value)||count($value)>30)throw new HttpError(422,'Un bloque admite hasta 30 imágenes.');
  $out=[];foreach($value as $url){$url=self::text($url,2000);if($url==='')continue;if(!Support::url($url))throw new HttpError(422,'URL de imagen inválida.');$out[]=$url;}return $out;
 }
 public static function validate(mixed $blocks):array {
  if(!is_array($blocks)||!array_is_list($blocks)||count($blocks)>50)throw new HttpError(422,'Máximo 50 secciones por landing.');$registry=self::registry();$ids=[];$out=[];
  foreach($blocks as $b){
   if(!is_array($b)||!is_string($b['id']??null)||!Support::isUuid($b['id'])||isset($ids[$b['id']]))throw new HttpError(422,'Identificador de sección inválido o duplicado.');$ids[$b['id']]=true;
   $type=$b['type']??'';if(!is_string($type)||!isset($registry[$type]))throw new HttpError(422,'Tipo de sección inválido.');$definition=$registry[$type];
   $variant=$b['variant']??$definition['variants'][0];if(!is_string($variant)||!in_array($variant,$definition['variants'],true))throw new HttpError(422,'Variante de sección inválida.');
   $visible=$b['visible']??true;if(!is_bool($visible))throw new HttpError(422,'Visibilidad de sección inválida.');
   $style=$b['style']??[];if(!is_array($style))throw new HttpError(422,'Estilo inválido.');$cleanStyle=[];
   foreach(['tone'=>['paper','white','soft','brand'],'space'=>['compact','normal','large'],'align'=>['left','center','right'],'ratio'=>['square','landscape','portrait']] as $key=>$values){$v=$style[$key]??$values[0];if(!is_string($v)||!in_array($v,$values,true))throw new HttpError(422,'Estilo de sección inválido.');$cleanStyle[$key]=$v;}
   $d=$b['data']??[];if(!is_array($d))throw new HttpError(422,'Contenido de sección inválido.');$data=[];
   foreach($definition['fields'] as $field){
    if($field==='dropiFields'){$fields=$d[$field]??self::DROPI_FIELDS;if(!is_array($fields)||!array_is_list($fields)||count($fields)>8)throw new HttpError(422,'Campos de Dropi inválidos.');foreach($fields as $key)if(!is_string($key)||!in_array($key,self::DROPI_FIELDS,true))throw new HttpError(422,'Campo de Dropi no permitido.');$data[$field]=array_values(array_unique($fields));continue;}
    if($field==='images'){$data[$field]=self::images($d[$field]??[]);continue;}
    if($field==='relatedIds'||$field==='selectedProductIds'){$values=$d[$field]??[];if(!is_array($values)||!array_is_list($values)||count($values)>20)throw new HttpError(422,'Máximo 20 productos relacionados.');foreach($values as $id)if(!is_string($id)||!Support::isUuid($id))throw new HttpError(422,'Producto relacionado inválido.');$data[$field]=array_values(array_unique($values));continue;}
    $v=self::text($d[$field]??'',in_array($field,['text','conditions'],true)?20000:($field==='image'?2000:500));
    if($field==='image'&&$v!==''&&!Support::url($v))throw new HttpError(422,'URL de imagen inválida.');
    $data[$field]=$field==='text'?self::rich($v):$v;
   }
   if($definition['items']){
    $items=$d['items']??[];if(!is_array($items)||!array_is_list($items)||count($items)>20)throw new HttpError(422,'Máximo 20 elementos por sección.');$data['items']=[];$itemIds=[];
    foreach($items as $item){if(!is_array($item))throw new HttpError(422,'Elemento inválido.');$id=$item['id']??Support::uuid();if(!is_string($id)||!Support::isUuid($id)||isset($itemIds[$id]))throw new HttpError(422,'Identificador de elemento inválido.');$itemIds[$id]=true;
     $image=self::text($item['image']??'',2000);if($image!==''&&!Support::url($image))throw new HttpError(422,'Imagen de elemento inválida.');
     $rating=$item['rating']??null;if($rating!==null&&(!is_int($rating)||$rating<1||$rating>5))throw new HttpError(422,'La calificación debe estar entre 1 y 5.');
     $icon=$item['icon']??'check';if(!in_array($icon,['check','box','send','chat','arrow','link','grid'],true))throw new HttpError(422,'Ícono inválido.');$shown=$item['visible']??true;if(!is_bool($shown))throw new HttpError(422,'Visibilidad de elemento inválida.');
     $date=self::text($item['date']??'',10);if($date!==''&&(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)||!strtotime($date)))throw new HttpError(422,'Fecha inválida.');
     $description=self::text($item['description']??'',5000);
     $data['items'][]=['id'=>$id,'title'=>self::text($item['title']??'',500),'description'=>in_array($type,['faq','policies'],true)?self::rich($description):$description,'value'=>self::text($item['value']??'',1000),'quantity'=>self::text($item['quantity']??'',100),'image'=>$image,'icon'=>$icon,'rating'=>$rating,'date'=>$date,'visible'=>$shown];
    }
   }
   $out[]=['id'=>$b['id'],'type'=>$type,'visible'=>$visible,'variant'=>$variant,'style'=>$cleanStyle,'data'=>$data];
  }return $out;
 }
 public static function make(string $type,array $data=[]):array {$r=self::registry()[$type];return ['id'=>Support::uuid(),'type'=>$type,'visible'=>true,'variant'=>$r['variants'][0],'style'=>['tone'=>'paper','space'=>'normal','align'=>in_array($type,['cta','usage'],true)?'center':'left','ratio'=>'landscape'],'data'=>$data];}
 public static function legacy(array $c):array {
  $blocks=[self::make('hero',['title'=>'','text'=>''])];
  foreach(array_chunk($c['features']??[],20) as $chunk)$blocks[]=self::make('benefits',['title'=>'Características','items'=>array_map(fn($f)=>['id'=>Support::uuid(),'title'=>$f],$chunk)]);
  return self::validate($blocks);
 }
 public static function commerce(mixed $value):array {
  if(!is_array($value))throw new HttpError(422,'Configuración comercial inválida.');$out=[];
  foreach(['quantityEnabled'=>true,'stickyMobile'=>false,'showShipping'=>false,'showDelivery'=>false,'showPayment'=>false,'dropiShipping'=>false] as $key=>$default){$v=$value[$key]??$default;if(!is_bool($v))throw new HttpError(422,'Configuración comercial inválida.');$out[$key]=$v;}
  foreach(['shipping','delivery','payment'] as $key)$out[$key]=self::text($value[$key]??'',500);
  $max=$value['maxQuantity']??99;if(!is_int($max)||$max<1||$max>99)throw new HttpError(422,'La cantidad máxima debe estar entre 1 y 99.');$out['maxQuantity']=$max;
  $price=$value['previousPrice']??null;if($price!==null&&(!is_numeric($price)||!is_finite((float)$price)||(float)$price<0||(float)$price>999999999))throw new HttpError(422,'Precio anterior inválido.');$out['previousPrice']=$price===null?null:(float)$price;return $out;
 }
 public static function imageUrls(array $c):array {$urls=$c['images']??[];if(!empty($c['header']['logo']))$urls[]=$c['header']['logo'];foreach($c['blocks']??[] as $b){$d=$b['data'];if(!empty($d['image']))$urls[]=$d['image'];foreach($d['images']??[] as $url)$urls[]=$url;foreach($d['items']??[] as $item)if(!empty($item['image']))$urls[]=$item['image'];}return array_values(array_unique($urls));}
 public static function ownedProducts(array $blocks,string $owner):void {
  $ids=[];foreach($blocks as $block)foreach($block['data']['selectedProductIds']??[] as $id)$ids[$id]=true;
  if(!$ids)return;
  $found=Database::all('SELECT id FROM selected_products WHERE user_id=? AND id IN ('.implode(',',array_fill(0,count($ids),'?')).')',[$owner,...array_keys($ids)]);
  if(count($found)!==count($ids))throw new HttpError(422,'Selecciona únicamente productos guardados en tu cuenta.');
 }
 public static function publishable(array $c):void {
  $visible=array_filter($c['blocks'],fn($b)=>$b['visible']&&$b['type']!=='divider');if(!$visible)throw new HttpError(422,'Agrega al menos una sección visible antes de publicar.');
  foreach($visible as $b){if($b['type']==='productList'&&!$b['data']['selectedProductIds'])throw new HttpError(422,'Elige productos para la Lista de productos o esconde esa sección.');if(self::registry()[$b['type']]['items']&&in_array($b['type'],['benefits','list','includes','usage','specs','payment','faq','testimonials'],true)){
   $items=array_filter($b['data']['items'],fn($i)=>$i['visible']);if(!$items)throw new HttpError(422,'Completa u oculta la sección «'.self::registry()[$b['type']]['name'].'».');foreach($items as $item){
    if(trim($item['title'])==='')throw new HttpError(422,'Completa los títulos de «'.self::registry()[$b['type']]['name'].'».');
    if(in_array($b['type'],['faq','testimonials'],true)&&trim(strip_tags($item['description']))==='')throw new HttpError(422,'Completa las respuestas o comentarios de «'.self::registry()[$b['type']]['name'].'».');
    if($b['type']==='specs'&&trim($item['value']?:$item['description'])==='')throw new HttpError(422,'Completa los valores de la ficha técnica.');
   }
  }}
 }
}
