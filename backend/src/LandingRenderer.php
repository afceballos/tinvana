<?php
declare(strict_types=1);
namespace App;
final class LandingRenderer {
 public static function money(?float $value):string {return $value===null?'Consulta el precio':'$ '.number_format($value,round($value,2)===floor($value)?0:2,',','.').' COP';}
 public static function icon(string $name):string {$paths=['check'=>'m5 12 4 4L19 6','box'=>'m3 7 9-4 9 4-9 4-9-4v10l9 4 9-4V7 M12 11v10','send'=>'m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2','chat'=>'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z','arrow'=>'M5 12h14 m-6-6 6 6-6 6','link'=>'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2','grid'=>'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z','share'=>'M18 8a3 3 0 1 0-3-3 M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4 M15 5a3 3 0 0 0 3 3','copy'=>'M9 9h11v11H9z M5 15H4V4h11v1','facebook'=>'M15 3h-3a4 4 0 0 0-4 4v3H5v4h3v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h3z','star'=>'m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z','edit'=>'M4 20h4L19 9l-4-4L4 16v4Z M13 7l4 4'];return '<svg aria-hidden="true" class="block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'.($paths[$name]??$paths['check']).'"/></svg>';}
 public static function image(string $url,string $alt='',bool $hero=false):string {return $url!==''?'<img src="'.Support::escape($url).'" alt="'.Support::escape($alt).'" '.($hero?'fetchpriority="high"':'loading="lazy"').' decoding="async">':'<div class="block-image-empty">Sin imagen disponible</div>';}
 public static function cta(array $c,string $text=''):string {return '<button type="button" class="primary buy-trigger" data-buy>'.Support::escape($text?:$c['visual']['buttonText']).self::icon('arrow').'</button>';}
 public static function purchase(array $c,string $text='',bool $hero=false):string {
  $e=fn($v)=>Support::escape($v);$o=$c['commerce'];$price=self::money($c['publicPrice']);
  // Savings are shown only when the previous price is real and higher (the server already rejects a lower one).
  $save=$o['previousPrice']!==null&&$c['publicPrice']!==null&&$o['previousPrice']>$c['publicPrice']?(int)round((1-$c['publicPrice']/$o['previousPrice'])*100):0;
  $html='<div class="purchase-box"'.($hero?' data-hero-buy':'').'><div class="purchase-price"><strong>'.$e($price).'</strong>'.($o['previousPrice']!==null?'<del>'.self::money($o['previousPrice']).'</del>':'').($save>0?'<span class="price-save">Ahorras '.$save.'%</span>':'').'</div>';
  if($o['quantityEnabled'])$html.='<div class="buy-row">'.self::quantityControl($o).self::cta($c,$text).'</div>';
  else $html.=self::cta($c,$text);
  $messages='';foreach(['Shipping'=>'shipping','Delivery'=>'delivery','Payment'=>'payment'] as $flag=>$key)if($o['show'.$flag]&&$o[$key]!=='')$messages.='<p>'.self::icon($key==='shipping'?'send':'check').$e($o[$key]).'</p>';
  return $html.($messages?'<div class="purchase-messages">'.$messages.'</div>':'').'</div>';
 }
 public static function quantityControl(array $o):string {return '<div class="quantity-control"><button type="button" data-quantity-step="-1" aria-label="Disminuir cantidad">−</button><label><span class="sr-only">Cantidad</span><input type="number" data-quantity min="1" max="'.$o['maxQuantity'].'" value="1" inputmode="numeric"></label><button type="button" data-quantity-step="1" aria-label="Aumentar cantidad">+</button></div>';}
 /**
  * Shortcut back to the editor, rendered only for the landing owner with a valid panel session (visitors never
  * receive it). The session cookie belongs to the main domain, so store subdomains do not show it.
  */
 /** On a store subdomain, where the panel session cookie is not sent, the page asks the main domain whether the viewer owns it. */
 public static function ownerCheck(array $r):string {
  $main=rtrim((string)Support::env('APP_URL'),'/');$mainHost=strtolower((string)parse_url($main,PHP_URL_HOST));$host=strtolower(explode(':',(string)($_SERVER['HTTP_HOST']??''))[0]);
  if($mainHost===''||$host===''||$host===$mainHost||!str_ends_with($host,'.'.$mainHost))return '';
  return ' data-owner-check="'.Support::escape($main.'/api/landings/'.$r['id'].'/owner').'"';
 }
 public static function ownerTools(array $r):string {
  if(empty($_SESSION['user_id'])||(string)$_SESSION['user_id']!==(string)($r['user_id']??''))return '';
  try{$u=Auth::user();}catch(HttpError){return '';}
  if($u['id']!==$r['user_id'])return '';
  return '<a class="owner-edit" href="/panel/landings/'.Support::escape($r['id']).'" aria-label="Editar esta landing en el panel">'.self::icon('edit').'<span>Editar landing</span></a>';
 }
 /** Call-to-action block: title and text come first, then the price (with real savings) and the button that opens the form. */
 public static function ctaActions(array $c,string $text=''):string {
  $o=$c['commerce'];$price=$c['publicPrice'];
  $save=$o['previousPrice']!==null&&$price!==null&&$o['previousPrice']>$price?(int)round((1-$price/$o['previousPrice'])*100):0;
  $line=$price!==null?'<p class="cta-price"><strong>'.Support::escape(self::money($price)).'</strong>'.($o['previousPrice']!==null?'<del>'.self::money($o['previousPrice']).'</del>':'').($save>0?'<span class="price-save">Ahorras '.$save.'%</span>':'').'</p>':'';
  return '<div class="cta-actions">'.$line.self::cta($c,$text).'</div>';
 }
 public static function gallery(array $images,string $title,string $variant,bool $hero=false):string {
  if(!$images)return self::image('',$title);
  if($hero||$variant==='thumbnails'){
   $html='<div class="block-gallery" data-gallery-group><button type="button" class="block-gallery-main" data-zoom aria-label="Ampliar imagen">'.self::image($images[0],$title,$hero).'</button><div class="block-thumbnails">';
   foreach($images as $i=>$url)$html.='<button type="button" data-gallery="'.Support::escape($url).'" aria-pressed="'.($i===0?'true':'false').'" aria-label="Ver imagen '.($i+1).'">'.self::image($url,'').'</button>';return $html.'</div></div>';
  }
  $html='<div class="block-gallery-images">';foreach($images as $i=>$url)$html.='<button type="button" data-zoom aria-label="Ampliar imagen '.($i+1).'">'.self::image($url,$title).'</button>';return $html.'</div>'.($variant==='carousel'?'<div class="carousel-controls"><button type="button" data-carousel="-1" aria-label="Imágenes anteriores">←</button><button type="button" data-carousel="1" aria-label="Más imágenes">→</button></div>':'');
 }
 public static function items(array $b):string {
  $e=fn($v)=>Support::escape($v);$type=$b['type'];$variant=$b['variant'];$items=array_values(array_filter($b['data']['items']??[],fn($i)=>$i['visible']));$html='';
  if(!$items)return '';
  foreach($items as $i=>$item){
   $title=$e($item['title']);$description=in_array($type,['faq','policies'],true)?$item['description']:nl2br($e($item['description']));$image=$item['image']?self::image($item['image'],$item['title']):'';
   if(in_array($type,['faq','policies'],true)&&in_array($variant,['accordion','compact','columns'],true)){$html.='<details class="block-accordion"><summary>'.$title.'<span aria-hidden="true">+</span></summary><div class="accordion-content rich-content">'.$description.'</div></details>';continue;}
   if($type==='specs'){$html.='<div class="spec-row"><dt>'.$title.'</dt><dd>'.$e($item['value']?:$item['description']).'</dd></div>';continue;}
   $lead=$image?'<div class="item-image">'.$image.'</div>':(in_array($type,['usage'],true)||in_array($variant,['numbered','steps'],true)?'<span class="item-number">'.($i+1).'</span>':(in_array($variant,['checks','icons','cards','grid','horizontal','list'],true)?'<span class="item-icon">'.self::icon($variant==='checks'?'check':$item['icon']).'</span>':''));
   $rating=$type==='testimonials'&&$item['rating']!==null?'<span class="testimonial-rating" role="img" aria-label="'.$item['rating'].' de 5 estrellas">'.str_repeat(self::icon('star'),$item['rating']).'<span class="rating-off">'.str_repeat(self::icon('star'),5-$item['rating']).'</span></span>':'';
   $html.='<li class="block-item" style="--i:'.$i.'">'.$lead.'<div>'.$rating.'<h3>'.$title.($type==='includes'&&$item['quantity']!==''?' <small>'.$e($item['quantity']).'</small>':'').'</h3>'.($description!==''?'<div class="item-description rich-content">'.$description.'</div>':'').($item['date']!==''?'<time datetime="'.$e($item['date']).'">'.$e($item['date']).'</time>':'').'</div></li>';
  }
  if($type==='specs')return $variant==='accordion'?'<details class="block-accordion"><summary>Ver especificaciones <span aria-hidden="true">+</span></summary><dl class="block-specs">'.$html.'</dl></details>':'<dl class="block-specs">'.$html.'</dl>';
  if(in_array($type,['faq','policies'],true)&&in_array($variant,['accordion','compact','columns'],true))return '<div class="block-faq">'.$html.'</div>';
  return '<'.(in_array($variant,['numbered','steps'],true)||$type==='usage'?'ol':'ul').' class="block-items">'.$html.'</'.(in_array($variant,['numbered','steps'],true)||$type==='usage'?'ol':'ul').'>'.($variant==='carousel'?'<div class="carousel-controls"><button type="button" data-carousel="-1" aria-label="Anteriores">←</button><button type="button" data-carousel="1" aria-label="Siguientes">→</button></div>':'');
 }
 public static function related(array $ids,string $owner):array {
  $out=[];foreach($ids as $id){$r=Database::one("SELECT * FROM landing_pages WHERE id=? AND user_id=? AND status='published'",[$id,$owner]);if($r){$r=Landing::published($r);$out[]=['url'=>'/p/'.$r['slug'],'title'=>$r['content']['title'],'image'=>$r['content']['images'][0]??'','price'=>$r['content']['publicPrice']];}}return $out;
 }
 public static function excerpt(string $text):string {
  $text=preg_replace('~<(?:script|style)\b[^>]*>.*?</(?:script|style)>~is','',$text);
  $text=preg_replace('~</?(?:p|div|li|br|h[1-6])\b[^>]*>~i',' ',$text);
  $text=trim(preg_replace('/\s+/u',' ',html_entity_decode(strip_tags($text),ENT_QUOTES|ENT_HTML5,'UTF-8')));
  return mb_strlen($text)>180?rtrim(mb_substr($text,0,179)).'…':$text;
 }
 public static function selectedCards(array $ids,string $owner):array {
  if(!$ids)return [];
  $rows=Database::all('SELECT p.id,p.mapped_data,l.status,l.published_content,l.published_slug FROM selected_products p LEFT JOIN landing_pages l ON l.selected_product_id=p.id AND l.user_id=p.user_id WHERE p.user_id=? AND p.id IN ('.implode(',',array_fill(0,count($ids),'?')).')',[$owner,...$ids]);
  $lookup=[];foreach($rows as $row){$original=json_decode($row['mapped_data'],true);$published=$row['status']==='published'&&!empty($row['published_content'])&&!empty($row['published_slug']);$c=$published?Media::rebase(json_decode($row['published_content'],true)):null;
   $image=$c!==null?($c['images'][0]??''):($original['images'][0]??'');if(!Support::url($image))$image='';
   $lookup[$row['id']]=['title'=>$c!==null?$c['title']:$original['name'],'description'=>self::excerpt($c!==null?$c['description']:($original['description']??'')),'image'=>$image,'url'=>$published?'/p/'.$row['published_slug']:null];
  }
  $out=[];foreach($ids as $id)if(isset($lookup[$id]))$out[]=$lookup[$id];return $out;
 }
 public static function dropiData(array $fields,array $product):string {
  $e=fn($v)=>Support::escape((string)$v);$labels=['id'=>'ID del producto','sku'=>'SKU','categories'=>'Categoría','stock'=>'Stock total por bodegas','supplier'=>'Proveedor','supplierStatus'=>'Estado del proveedor','type'=>'Tipo'];$rows='';
  foreach($labels as $key=>$label){if(!in_array($key,$fields,true))continue;$value=$key==='categories'?implode(', ',array_filter(array_column($product['categories']??[],'name'))):($product[$key]??null);if($value===null||$value==='')continue;$rows.='<div class="spec-row"><dt>'.$label.'</dt><dd>'.$e($value).'</dd></div>';}
  $html=$rows?'<dl class="block-specs dropi-facts">'.$rows.'</dl>':'';
  if(in_array('warehouses',$fields,true)&&!empty($product['warehouses'])){$html.='<div class="dropi-warehouses"><h3>Disponibilidad por bodega</h3><ul>';foreach($product['warehouses'] as $warehouse){$place=implode(' · ',array_filter([$warehouse['name']??null,$warehouse['city']??null]));$stock=$warehouse['stock']??null;$html.='<li>'.self::icon('box').'<div><strong>'.$e($place?:'Bodega sin nombre').'</strong><span>'.($stock===null?'Stock no disponible':$e($stock).' unidades').'</span></div></li>';}$html.='</ul></div>';}
  return $html;
 }
 public static function block(array $b,array $c,string $owner,array $product=[]):string {
  if(!$b['visible'])return '';$e=fn($v)=>Support::escape($v);$d=$b['data'];$type=$b['type'];$variant=$b['variant'];$heading=($d['title']??'')!==''?'<h2>'.$e($d['title']).'</h2>':'';$subtitle=($d['subtitle']??'')!==''?'<p class="block-subtitle">'.$e($d['subtitle']).'</p>':'';$text=$d['text']??'';$html='';
  if($type==='hero'){
   $images=$d['images']?:$c['images'];if($d['image'])$images=[$d['image'],...array_filter($images,fn($url)=>$url!==$d['image'])];
   $html='<div class="hero-media">'.self::gallery($images,$c['title'],'thumbnails',true).'</div><div class="hero-copy">'.($d['label']?'<p class="hero-label">'.$e($d['label']).'</p>':'').'<h1>'.$e($d['title']?:$c['title']).'</h1>'.$subtitle.'<div class="rich-content hero-description">'.($text?:nl2br($e($c['description']))).'</div>'.self::items($b).self::purchase($c,$d['ctaText'],true).'</div>';
  }elseif($type==='gallery'){
   $gallery=self::gallery($d['images']?:$c['images'],$c['title'],$variant==='image-text'?'thumbnails':$variant);
   $html=$variant==='image-text'?'<div>'.$gallery.'</div><div>'.$heading.$subtitle.'<div class="rich-content">'.$text.'</div></div>':$heading.$subtitle.$gallery.($text?'<div class="rich-content">'.$text.'</div>':'');
  }elseif($type==='imageText'){$html='<div class="editorial-image">'.self::image($d['image']?:($c['images'][0]??''),$d['title']).'</div><div>'.$heading.$subtitle.'<div class="rich-content">'.$text.'</div>'.self::items($b).($d['ctaText']?self::cta($c,$d['ctaText']):'').'</div>';
  }elseif($type==='includes'&&$variant==='image-text'){$html='<div class="editorial-image">'.self::image($d['image']?:($c['images'][0]??''),$d['title']).'</div><div>'.$heading.$subtitle.self::items($b).'</div>';
  }elseif($type==='cta'){$html=($d['image']?'<div class="cta-image">'.self::image($d['image'],$d['title']).'</div>':'').'<div class="cta-copy">'.$heading.$subtitle.($text?'<div class="rich-content">'.$text.'</div>':'').self::ctaActions($c,$d['ctaText']).'</div>';
  }elseif($type==='shipping'){
   $rows='';foreach(['coverage'=>'Cobertura','cost'=>'Costo de envío','delivery'=>'Tiempo de entrega','carrier'=>'Transportadora','conditions'=>'Condiciones'] as $key=>$label)if($d[$key]!=='')$rows.='<li class="shipping-item">'.self::icon('send').'<div><h3>'.$label.'</h3><p>'.$e($d[$key]).'</p></div></li>';
   $inside=($text?'<div class="rich-content">'.$text.'</div>':'').'<ul class="shipping-items">'.$rows.'</ul>';$html=$heading.($variant==='accordion'?'<details class="block-accordion"><summary>Ver condiciones de entrega <span aria-hidden="true">+</span></summary>'.$inside.'</details>':$inside);
  }elseif($type==='related'){
   $html=$heading.$subtitle.'<div class="related-products">';foreach(self::related($d['relatedIds'],$owner) as $product)$html.='<a class="related-card" href="'.$e($product['url']).'">'.self::image($product['image'],$product['title']).'<h3>'.$e($product['title']).'</h3><p>'.self::money($product['price']).'</p></a>';$html.='</div>';if($variant==='carousel')$html.='<div class="carousel-controls"><button type="button" data-carousel="-1" aria-label="Productos anteriores">←</button><button type="button" data-carousel="1" aria-label="Más productos">→</button></div>';
  }elseif($type==='productList'){
   $html=$heading.$subtitle.'<div class="selected-product-cards">';foreach(self::selectedCards($d['selectedProductIds'],$owner) as $card){
    $tag=$card['url']!==null?'a':'article';$html.='<'.$tag.' class="selected-product-card"'.($card['url']!==null?' href="'.$e($card['url']).'"':'').'><div class="selected-product-image">'.self::image($card['image'],$card['title']).'</div><div class="selected-product-copy"><h3>'.$e($card['title']).'</h3>'.($card['description']!==''?'<p>'.$e($card['description']).'</p>':'').($card['url']!==null?'<span class="selected-product-link">Ver producto '.self::icon('arrow').'</span>':'').'</div></'.$tag.'>';
   }$html.='</div>';
  }elseif($type==='dropiData'){$inside=self::dropiData($d['dropiFields'],$product);if($inside==='')return '';$html=$heading.$subtitle.($variant==='accordion'?'<details class="block-accordion"><summary>Ver datos del producto <span aria-hidden="true">+</span></summary><div class="accordion-content">'.$inside.'</div></details>':$inside);
  }elseif($type==='divider'){$html='<div class="page-divider" aria-hidden="true"></div>';
  }else{$html=$heading.$subtitle.($text?'<div class="rich-content">'.$text.'</div>':'').(isset($d['items'])?self::items($b):'');}
  $classes='landing-block type-'.$type.' variant-'.$variant;foreach($b['style'] as $key=>$value)$classes.=' '.$key.'-'.$value;
  return '<section id="section-'.$e($b['id']).'" class="'.$classes.'" data-block-id="'.$e($b['id']).'"><div class="block-inner">'.$html.'</div></section>';
 }
 /** Text color for a fill: white when it reaches 4.5:1, otherwise near-black (WCAG relative luminance). */
 public static function onColor(string $hex):string {
  $l=function(string $hex):float{$n=hexdec(ltrim($hex,'#'));$c=fn(int $v)=>($v/=255)<=.03928?$v/12.92:(($v+.055)/1.055)**2.4;return .2126*$c($n>>16&255)+.7152*$c($n>>8&255)+.0722*$c($n&255);};
  return (1.05/($l($hex)+.05))>=4.5?'#ffffff':'#151311';
 }
 /** Static asset URL with its modification time, so a deploy is never hidden behind a cached old file. */
 public static function asset(string $path):string {
  // The web root (public_html on cPanel) holds the served copy; the repository layout keeps it in backend/public.
  foreach([rtrim((string)($_SERVER['DOCUMENT_ROOT']??''),'/\\'),dirname(__DIR__).'/public'] as $root)if($root!==''&&is_file($root.$path))return $path.'?v='.filemtime($root.$path);
  return $path;
 }
 public static function fontHead(string $font):string {
  $file='/landing-fonts/'.$font.'.woff2';
  return '<link rel="preload" href="'.$file.'" as="font" type="font/woff2" crossorigin><style>@font-face{font-family:"Landing";src:url('.$file.') format("woff2");font-weight:400 800;font-style:normal;font-display:swap}</style>';
 }
 /** Floating actions: share (optional channels) above WhatsApp, bottom-right. Works without JavaScript (details/links). */
 public static function floats(array $v,string $title,string $url):string {
  $e=fn($x)=>Support::escape($x);$share=$v['share']??[];$channels=array_keys(array_filter($share));$html='';
  if($channels){
   $text=rawurlencode($title.' '.$url);$options='';
   if(!empty($share['whatsapp']))$options.='<a class="share-option" href="https://wa.me/?text='.$e($text).'" target="_blank" rel="noopener noreferrer">'.self::icon('chat').'WhatsApp</a>';
   if(!empty($share['facebook']))$options.='<a class="share-option" href="https://www.facebook.com/sharer/sharer.php?u='.$e(rawurlencode($url)).'" target="_blank" rel="noopener noreferrer">'.self::icon('facebook').'Facebook</a>';
   if(!empty($share['copy']))$options.='<button type="button" class="share-option" data-share-copy>'.self::icon('copy').'<span>Copiar enlace</span></button>';
   if(!empty($share['native']))$options.='<button type="button" class="share-option" data-share-native hidden>'.self::icon('share').'Más opciones</button>';
   $html.='<details class="share-menu" data-share data-url="'.$e($url).'" data-title="'.$e($title).'" data-native="'.(!empty($share['native'])?'true':'false').'"><summary class="float-btn share-toggle" aria-label="Compartir este producto">'.self::icon('share').'</summary><div class="share-panel" role="group" aria-label="Compartir"><p>Compartir este producto</p>'.$options.'<p class="share-status" role="status" aria-live="polite"></p></div></details>';
  }
  if(($v['whatsapp']??'')!=='')$html.='<a class="float-btn float-wa whatsapp" target="_blank" rel="noopener noreferrer" href="https://wa.me/'.$e($v['whatsapp']).'?text='.rawurlencode('Hola, quiero información sobre '.$title).'" aria-label="Escríbenos por WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg><span class="float-wa-label">¿Dudas? Escríbenos</span></a>';
  return $html!==''?'<div class="float-actions">'.$html.'</div>':'';
 }
 public static function render(array $row,bool $preview=false,string $notice=''):string {
  $r=$preview?Landing::decode($row):Landing::published($row);$c=$r['content'];$v=$c['visual'];$e=fn($s)=>Support::escape($s);$url=$preview?rtrim(Support::env('APP_URL'),'/').'/p/'.$r['slug']:Store::landingUrl((string)$r['slug'],Store::subdomainOf((string)$r['user_id']));
  if($preview&&isset($_GET['expires'],$_GET['signature'])){
   $sign=function(string $image)use($r){return str_starts_with($image,rtrim(Support::env('APP_URL'),'/').'/media/')?$image.'?'.http_build_query(['landing'=>$r['id'],'expires'=>$_GET['expires'],'signature'=>$_GET['signature']]):$image;};$c['images']=array_map($sign,$c['images']);$c['header']['logo']=$sign($c['header']['logo']);foreach($c['blocks'] as &$block){if(isset($block['data']['image']))$block['data']['image']=$sign($block['data']['image']);if(isset($block['data']['images']))$block['data']['images']=array_map($sign,$block['data']['images']);foreach($block['data']['items']??[] as $key=>$item)$block['data']['items'][$key]['image']=$sign($item['image']);}unset($block);
  }
  $title=$c['seoTitle']?:$c['title'];$description=$c['seoDescription']?:mb_substr($c['description'],0,300);$html='';$hasHero=false;
  foreach($c['blocks'] as $b){$section=self::block($b,$c,$r['user_id']??'',$r['product_snapshot']);if($b['visible']&&$b['type']==='hero'){if($hasHero)$section=str_replace(['<h1>','</h1>'],['<h2>','</h2>'],$section);$hasHero=true;}$html.=$section;}
  $image=$c['images'][0]??'';$price=self::money($c['publicPrice']);
  $form=$preview?'<p class="notice">Previsualización privada. El formulario está desactivado.</p>':'<form id="lead-form" method="post" action="/p/'.$e($r['slug']).'/lead"><input type="hidden" name="csrf" value="'.$e($_SESSION['csrf']??'').'"><input type="hidden" name="idempotency_key" value="'.Support::uuid().'"><input type="hidden" name="quantity" value="1" data-lead-quantity><label class="trap" aria-hidden="true">Sitio web<input name="website" tabindex="-1" autocomplete="off"></label><div class="form-grid"><label>Nombre<input name="first_name" maxlength="100" required autocomplete="given-name"></label><label>Apellido<input name="last_name" maxlength="100" required autocomplete="family-name"></label><label>Email<input name="email" type="email" maxlength="254" required autocomplete="email"></label>'.DeliveryAddress::phoneField().'</div>'.DeliveryAddress::fields().'<p>Al enviar autorizas que usemos tus datos de contacto y dirección para atender esta solicitud.</p>'.(($c['commerce']['dropiShipping']??false)===true&&$c['publicPrice']!==null?'<p class="order-shipping-inline" aria-live="polite">Envío: <strong data-summary-shipping>Elige tu ciudad</strong> · Total: <strong data-summary-grand>'.$e($price).'</strong></p>':'').'<button class="primary" type="submit">Enviar solicitud</button><p id="lead-status" role="status"></p></form>';
  $dropiShipping=($c['commerce']['dropiShipping']??false)===true&&$c['publicPrice']!==null;
  $modal='<dialog id="purchase-dialog" aria-labelledby="purchase-title"><div class="purchase-modal-top"><h2 id="purchase-title">Solicita tu pedido</h2><button type="button" data-close-purchase aria-label="Cerrar formulario">×</button></div><div class="purchase-modal-content"><div class="order-summary">'.($image?self::image($image,$c['title']):'').'<div><h3>'.$e($c['title']).'</h3><p>Precio unitario: '.$e($price).'</p>'.($c['commerce']['quantityEnabled']?'</div></div><div class="order-quantity"><span id="order-quantity-label">¿Cuántas unidades quieres?<span class="sr-only">: <span data-summary-quantity>1</span></span></span>'.str_replace('<div class="quantity-control">','<div class="quantity-control" role="group" aria-labelledby="order-quantity-label">',self::quantityControl($c['commerce'])).'</div>':'<p>Cantidad: <strong data-summary-quantity>1</strong></p></div></div>').'<div class="order-total"><span>Total del producto</span><strong data-summary-total>'.$e($price).'</strong></div>'.($dropiShipping?'<dl class="order-shipping"><div><dt>Envío</dt><dd data-summary-shipping>Elige tu ciudad</dd></div><div class="is-total"><dt>Total</dt><dd data-summary-grand>'.$e($price).'</dd></div></dl><p class="order-shipping-note">Envío calculado con Dropi según tu ciudad.</p>':'').'<p class="order-note">El equipo confirmará disponibilidad y condiciones. Esto es una solicitud, no un pago ni una compra confirmada.</p>'.$form.'</div></dialog>';
  if(!$preview)$modal='<noscript><p class="native-form-link"><a href="#purchase-dialog">Abrir formulario de solicitud</a></p><style>#purchase-dialog:not([open]){display:block;position:static;max-height:none;width:min(560px,calc(100% - 24px));margin:32px auto}#purchase-dialog [data-close-purchase],[data-buy]{display:none}</style></noscript>'.$modal;
  $sticky=$c['commerce']['stickyMobile']?'<div class="mobile-purchase" data-sticky-buy><div class="mp-info">'.($image?self::image($image,''):'').'<div><span>'.$e($c['title']).'</span><strong>'.$e($price).'</strong></div></div>'.self::cta($c).'</div>':'';
  $floats=self::floats($v,$c['title'],$url);
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$e($title).'</title><meta name="description" content="'.$e($description).'"><meta name="robots" content="'.($preview?'noindex,nofollow':'index,follow').'"><link rel="canonical" href="'.$e($url).'"><meta property="og:title" content="'.$e($title).'"><meta property="og:description" content="'.$e($description).'"><meta property="og:url" content="'.$e($url).'"><meta property="og:type" content="product">'.($image?'<meta property="og:image" content="'.$e($image).'">':'').'<link rel="icon" type="image/svg+xml" href="/brand/tinvana-origami.svg">'.self::fontHead($v['font']).'<link rel="stylesheet" href="'.self::asset('/blocks.css').'"><link rel="stylesheet" href="'.self::asset('/landing-header.css').'"><link rel="stylesheet" href="'.self::asset('/landing-assets/landing-form.css').'"></head><body class="block-page'.($sticky?' has-sticky-buy':'').'" data-preview="'.($preview?'true':'false').'" data-price="'.$e($c['publicPrice']===null?'':(string)$c['publicPrice']).'" data-max-quantity="'.($c['commerce']['quantityEnabled']?$c['commerce']['maxQuantity']:1).'" data-shipping="'.($dropiShipping?'dropi':'').'" data-theme="'.$e($v['theme']).'"'.($preview?'':self::ownerCheck($r)).' data-paper="'.(self::onColor($v['backgroundColor'])==='#ffffff'?'dark':'light').'" data-font="'.$e($v['font']).'" style="--primary:'.$e($v['primaryColor']).';--on-primary:'.self::onColor($v['primaryColor']).';--paper:'.$e($v['backgroundColor']).';--ink-on-paper:'.self::onColor($v['backgroundColor']).'">'.LandingHeader::render($c,$preview).'<main>'.(!$hasHero?'<h1 class="sr-only">'.$e($c['title']).'</h1>':'').($notice?'<p class="notice" role="status">'.$e($notice).'</p>':'').$html.'</main><footer class="landing-footer"><span>'.$e($c['title']).'</span><span>Página creada con Tinvana</span></footer>'.$modal.$sticky.$floats.($preview?'':self::ownerTools($r)).'<dialog id="image-zoom" aria-label="Imagen ampliada"><button type="button" data-close-zoom aria-label="Cerrar imagen">×</button><img alt="Imagen ampliada del producto"></dialog><script src="'.self::asset('/landing-assets/landing-runtime.js').'" defer></script></body></html>';
 }
}
