<?php
declare(strict_types=1);
namespace App;
final class LandingHeader {
 public static function validate(mixed $value,array $blocks):array {
  if(!is_array($value))throw new HttpError(422,'Configuración de encabezado inválida.');
  $out=[];foreach(['menuEnabled'=>true,'sticky'=>true] as $key=>$default){$v=$value[$key]??$default;if(!is_bool($v))throw new HttpError(422,'Configuración de encabezado inválida.');$out[$key]=$v;}
  $mode=$value['mode']??'auto';if(!in_array($mode,['auto','custom'],true))throw new HttpError(422,'Modo del menú inválido.');$out['mode']=$mode;
  $logo=Support::text($value['logo']??'',2000,false);if($logo!==''&&!Support::url($logo))throw new HttpError(422,'El logo requiere una URL HTTP o HTTPS.');$out['logo']=$logo;$out['logoAlt']=Support::text($value['logoAlt']??'ZenZales',100,false);
  $color=$value['backgroundColor']??'#06444a';if(!is_string($color)||!preg_match('/^#[0-9a-f]{6}$/i',$color))throw new HttpError(422,'Color del encabezado inválido.');
  $rgb=array_map(fn($offset)=>hexdec(substr($color,$offset,2))/255,[1,3,5]);$rgb=array_map(fn($v)=>$v<=.04045?$v/12.92:(($v+.055)/1.055)**2.4,$rgb);$lum=.2126*$rgb[0]+.7152*$rgb[1]+.0722*$rgb[2];if(1.05/($lum+.05)<4.5)throw new HttpError(422,'Elige un fondo oscuro para mantener legibles el menú blanco y el logo.');$out['backgroundColor']=$color;
  $items=$value['items']??[];if(!is_array($items)||!array_is_list($items)||count($items)>50)throw new HttpError(422,'Máximo 50 enlaces en el menú.');$seen=[];$known=array_column($blocks,'id');$out['items']=[];
  foreach($items as $item){if(!is_array($item)||!is_string($item['id']??null)||!Support::isUuid($item['id'])||isset($seen[$item['id']]))throw new HttpError(422,'Enlace de menú inválido o duplicado.');$seen[$item['id']]=true;$enabled=$item['enabled']??true;if(!is_bool($enabled))throw new HttpError(422,'Visibilidad de enlace inválida.');$label=Support::text($item['label']??'',60,false);if(in_array($item['id'],$known,true))$out['items'][]=['id'=>$item['id'],'label'=>$label,'enabled'=>$enabled];}
  return $out;
 }
 public static function label(array $block):string {return $block['type']==='hero'?'Inicio':mb_substr(trim(strip_tags($block['data']['title']??''))?:Blocks::registry()[$block['type']]['name'],0,60);}
 public static function entries(array $header,array $blocks):array {
  if(!$header['menuEnabled'])return [];$visible=[];foreach($blocks as $block)if($block['visible']&&$block['type']!=='divider')$visible[$block['id']]=$block;
  $items=$header['mode']==='auto'?array_map(fn($b)=>['id'=>$b['id'],'label'=>self::label($b),'enabled'=>true],array_values($visible)):$header['items'];$out=[];
  foreach($items as $item)if($item['enabled']&&isset($visible[$item['id']]))$out[]=['id'=>$item['id'],'label'=>$item['label']?:self::label($visible[$item['id']])];return $out;
 }
 public static function render(array $content,bool $preview=false):string {
  $h=$content['header'];$entries=self::entries($h,$content['blocks']);$e=fn($v)=>Support::escape($v);$links='';foreach($entries as $entry)$links.='<li><a href="#section-'.$e($entry['id']).'" data-section-link>'.$e($entry['label']).'</a></li>';
  $logo=$h['logo']?:'/brand/tinvana-light.svg';$alt=$h['logo']?($h['logoAlt']?:'Logo de la tienda'):'Tinvana';$home='#landing-top';foreach($content['blocks'] as $block)if($block['visible']&&$block['type']!=='divider'){$home='#section-'.$block['id'];break;}
  $menu=$links?'<nav class="landing-desktop-nav" aria-label="Secciones de la página"><ul>'.$links.'</ul></nav><details class="landing-menu"><summary>Menú<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></summary><nav aria-label="Secciones de la página"><ul>'.$links.'</ul></nav></details>':'';
  return '<header id="landing-top" class="landing-header'.($h['sticky']?' is-sticky':'').(count($entries)>6?' dense-menu':'').'" style="--header-bg:'.$e($h['backgroundColor']).'"><div class="landing-header-inner"><a class="landing-header-logo" href="'.$e($home).'" aria-label="Volver al inicio"><img src="'.$e($logo).'" alt="'.$e($alt).'" width="160" height="80"></a>'.$menu.($preview?'<span class="landing-preview-badge">Vista privada</span>':'').'</div></header>';
 }
}
