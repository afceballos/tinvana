<?php
declare(strict_types=1);
namespace App;
final class Landing {
 public const THEMES=['modern','warm','bold'];
 public const FONTS=['rubik','montserrat','fraunces','grotesk'];
 public const THEME_FONTS=['modern'=>'rubik','warm'=>'fraunces','bold'=>'grotesk'];
 public const SHARE=['native','whatsapp','facebook','copy'];
 public static function defaults(): array { return ['primaryColor'=>'#ff6a00','backgroundColor'=>'#fff8f1','buttonText'=>'Pedir ahora','whatsapp'=>'','theme'=>'modern','font'=>'rubik','share'=>array_fill_keys(self::SHARE,false)]; }
 public static function visual(array $s): array {
  // Palettes that were only the old platform defaults count as "no colors chosen" and take the current defaults.
  foreach([['#193e35','#fafbf7'],['#06444a','#f4faf7']] as [$p,$bg])if(strtolower((string)($s['primaryColor']??''))===$p&&strtolower((string)($s['backgroundColor']??''))===$bg)unset($s['primaryColor'],$s['backgroundColor']);
  $r=self::defaults();
  $theme=$s['theme']??'modern';if(!is_string($theme)||!in_array($theme,self::THEMES,true))throw new HttpError(422,'Estilo de landing inválido.');$r['theme']=$theme;
  $font=$s['font']??self::THEME_FONTS[$theme];if(!is_string($font)||!in_array($font,self::FONTS,true))throw new HttpError(422,'Tipografía inválida.');$r['font']=$font;
  $share=$s['share']??[];if(!is_array($share))throw new HttpError(422,'Opciones de compartir inválidas.');foreach(self::SHARE as $k){$v=$share[$k]??false;if(!is_bool($v))throw new HttpError(422,'Opciones de compartir inválidas.');$r['share'][$k]=$v;}
  foreach(['primaryColor','backgroundColor'] as $k){$v=$s[$k]??$r[$k];if(!is_string($v)||!preg_match('/^#[a-f0-9]{6}$/i',$v))throw new HttpError(422,'Color inválido.');$r[$k]=$v;}
  $r['buttonText']=Support::text($s['buttonText']??$r['buttonText'],100);
  $r['whatsapp']=Support::text($s['whatsapp']??'',20,false);if($r['whatsapp']!==''&&!preg_match('/^[1-9][0-9]{7,14}$/',$r['whatsapp']))throw new HttpError(422,'WhatsApp requiere código de país y números, sin +.');return $r;
 }
 public static function content(array $c): array {
  $title=Support::text($c['title']??null,200);$desc=Support::text($c['description']??'',20000,false);$price=$c['publicPrice']??null;
  if($price!==null&&($price===''||!is_numeric($price)||!is_finite((float)$price)||(float)$price<0||(float)$price>999999999))throw new HttpError(422,'Precio público inválido.');
  $images=$c['images']??[];if(!is_array($images)||count($images)>60)throw new HttpError(422,'Galería inválida.');$images=array_values(array_filter($images,fn($i)=>!is_string($i)||trim($i)!==''));if(count($images)>30)throw new HttpError(422,'Máximo 30 imágenes.');foreach($images as &$i){if(!is_string($i)||strlen($i)>2000||!Support::url(trim($i)))throw new HttpError(422,'Solo se permiten URLs HTTP o HTTPS para imágenes.');$i=trim($i);}unset($i);
  $features=$c['features']??[];if(!is_array($features)||count($features)>60)throw new HttpError(422,'Características inválidas.');$features=array_values(array_filter($features,fn($f)=>!is_string($f)||trim($f)!==''));if(count($features)>30)throw new HttpError(422,'Máximo 30 características.');$features=array_map(fn($f)=>Support::text($f,300),$features);
  $out=['title'=>$title,'description'=>$desc,'publicPrice'=>$price===null?null:(float)$price,'images'=>array_values($images),'features'=>$features,'seoTitle'=>Support::text($c['seoTitle']??$title,200,false),'seoDescription'=>Support::text($c['seoDescription']??'',320,false),'visual'=>self::visual($c['visual']??[])];
  $out['schemaVersion']=2;$out['blocks']=array_key_exists('blocks',$c)?Blocks::validate($c['blocks']):Blocks::legacy($out);$out['commerce']=Blocks::commerce($c['commerce']??[]);
  $out['header']=LandingHeader::validate($c['header']??[],$out['blocks']);$out['variants']=LandingVariants::validate($c['variants']??null);
  if($out['commerce']['previousPrice']!==null&&$out['publicPrice']!==null&&$out['commerce']['previousPrice']<$out['publicPrice'])throw new HttpError(422,'El precio anterior no puede ser menor que el precio actual.');
  return $out;
 }
 public static function slug(mixed $v): string { $v=Support::text($v,180);if(!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/',$v))throw new HttpError(422,'El slug admite minúsculas, números y guiones.');return $v; }
 public static function create(array $p,string $owner): array {
  $m=json_decode($p['mapped_data'],true);$settings=Database::one('SELECT settings FROM template_settings WHERE user_id=?',[$owner]);$visual=$settings?json_decode($settings['settings'],true):self::defaults();
  $name=iconv('UTF-8','ASCII//TRANSLIT//IGNORE',$m['name']);$slug=trim(strtolower(preg_replace('/[^a-zA-Z0-9]+/','-',$name?:'producto')),'-');$slug=substr($slug,0,120).'-'.$m['id'].'-'.substr(str_replace('-','',Support::uuid()),0,8);
  $images=array_values(array_filter(array_map([Product::class,'image'],$m['images']??[])));
  $content=self::content(['title'=>$m['name'],'description'=>$m['description'],'publicPrice'=>null,'images'=>array_slice($images,0,30),'features'=>[],'seoTitle'=>$m['name'],'seoDescription'=>'','visual'=>$visual]);
  return Database::one('INSERT INTO landing_pages(id,user_id,selected_product_id,slug,product_snapshot,content) VALUES(?,?,?,?,?::jsonb,?::jsonb) RETURNING *',[Support::uuid(),$owner,$p['id'],$slug,$p['mapped_data'],Support::json($content)]);
 }
 public static function decode(array $r): array {unset($r['ai_brief']);foreach(['content','product_snapshot','published_content','published_product_snapshot'] as $key)if(isset($r[$key])&&is_string($r[$key]))$r[$key]=json_decode($r[$key],true);if(isset($r['content']))$r['content']=self::content(Media::rebase($r['content']));return $r;}
 public static function published(array $r):array {if(!empty($r['published_content']))$r['content']=$r['published_content'];if(!empty($r['published_product_snapshot']))$r['product_snapshot']=$r['published_product_snapshot'];if(!empty($r['published_slug']))$r['slug']=$r['published_slug'];return self::decode($r);}
 public static function checkSlug(string $slug,string $id):void {if(Database::one('SELECT id FROM landing_pages WHERE id<>? AND (slug=? OR published_slug=?)',[$id,$slug,$slug]))throw new HttpError(409,'Esta dirección ya pertenece a otra landing.');}
 public static function publish(array $r):void {
  $db=Database::connection();$db->beginTransaction();try{Database::one('SELECT id FROM users WHERE id=? FOR UPDATE',[$r['user_id']]);$r=Database::one('SELECT * FROM landing_pages WHERE id=? AND user_id=? FOR UPDATE',[$r['id'],$r['user_id']]);$c=self::decode($r)['content'];Blocks::publishable($c);Blocks::ownedProducts($c['blocks'],$r['user_id']);Media::validateReferences(Blocks::imageUrls($c),$r['user_id'],$r['id']);self::checkSlug($r['slug'],$r['id']);Database::query("UPDATE landing_pages SET status='published',published_content=?::jsonb,published_product_snapshot=product_snapshot,published_slug=slug,published_at=now(),updated_at=now() WHERE id=?",[Support::json($c),$r['id']]);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}
 }
 public static function render(array $row,bool $preview=false,string $notice=''): string {
  return LandingRenderer::render($row,$preview,$notice);
 }
}
