<?php
declare(strict_types=1);
namespace App;
final class Landing {
 public static function defaults(): array { return ['primaryColor'=>'#193e35','backgroundColor'=>'#fafbf7','buttonText'=>'Pedir ahora','whatsapp'=>'']; }
 public static function visual(array $s): array {
  $r=self::defaults();foreach(['primaryColor','backgroundColor'] as $k){$v=$s[$k]??$r[$k];if(!is_string($v)||!preg_match('/^#[a-f0-9]{6}$/i',$v))throw new HttpError(422,'Color inválido.');$r[$k]=$v;}
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
  $out['header']=LandingHeader::validate($c['header']??[],$out['blocks']);
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
 public static function decode(array $r): array {foreach(['content','product_snapshot','published_content','published_product_snapshot'] as $key)if(isset($r[$key])&&is_string($r[$key]))$r[$key]=json_decode($r[$key],true);$r['subdomain_base']=self::subdomainBase();if(isset($r['content']))$r['content']=self::content(Media::rebase($r['content']));return $r;}
 public static function published(array $r):array {if(!empty($r['published_content']))$r['content']=$r['published_content'];if(!empty($r['published_product_snapshot']))$r['product_snapshot']=$r['published_product_snapshot'];if(!empty($r['published_slug'])){$r['slug']=$r['published_slug'];$r['subdomain']=$r['published_subdomain']??null;}return self::decode($r);}
 private const RESERVED_SUBDOMAINS=['www','mail','smtp','imap','pop','pop3','ftp','cpanel','webmail','webdisk','whm','cpcalendars','cpcontacts','autodiscover','autoconfig','ns','ns1','ns2','api','app','admin','panel','login','static','cdn','assets','media','p','tinvana','tinbana','soporte','ayuda','blog','tienda'];
 public static function isReservedSubdomain(string $label): bool { return in_array($label,self::RESERVED_SUBDOMAINS,true); }
 /** Normalizes the draft subdomain: empty means "use the normal /p/ link". */
 public static function subdomain(mixed $v): ?string {
  if($v===null)return null;if(!is_string($v))throw new HttpError(422,'Subdominio inválido.');$v=trim($v);if($v==='')return null;
  if(!preg_match('/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/',$v)||str_contains($v,'--'))throw new HttpError(422,'El subdominio debe tener de 3 a 40 caracteres: minúsculas, números y guiones, sin espacios, y sin empezar ni terminar en guion.');
  if(self::isReservedSubdomain($v))throw new HttpError(422,'Ese subdominio está reservado. Elige otro nombre.');return $v;
 }
 /** Host used for landing subdomains, or null when APP_URL is an IP/localhost (no wildcard DNS there). */
 public static function subdomainBase(): ?string {
  $host=strtolower((string)parse_url((string)Support::env('APP_URL'),PHP_URL_HOST));
  if($host===''||!str_contains($host,'.')||filter_var($host,FILTER_VALIDATE_IP)!==false)return null;return $host;
 }
 public static function checkSubdomain(?string $subdomain,string $id): void {
  if($subdomain===null)return;
  if(Database::one('SELECT id FROM landing_pages WHERE id<>? AND (subdomain=? OR published_subdomain=?)',[$id,$subdomain,$subdomain]))throw new HttpError(409,'Ese subdominio ya está en uso. Elige otro nombre.');
 }
 /** Public address of a published landing: its subdomain when it has one, otherwise /p/<slug>. */
 public static function publicUrl(string $slug,?string $subdomain): string {
  $app=rtrim((string)Support::env('APP_URL'),'/');$base=self::subdomainBase();
  if($subdomain!==null&&$subdomain!==''&&$base!==null){$scheme=(string)parse_url($app,PHP_URL_SCHEME)?:'https';return $scheme.'://'.$subdomain.'.'.$base;}
  return $app.'/p/'.$slug;
 }
 public static function checkSlug(string $slug,string $id):void {if(Database::one('SELECT id FROM landing_pages WHERE id<>? AND (slug=? OR published_slug=?)',[$id,$slug,$slug]))throw new HttpError(409,'Esta dirección ya pertenece a otra landing.');}
 public static function publish(array $r):void {
  $db=Database::connection();$db->beginTransaction();try{Database::one('SELECT id FROM users WHERE id=? FOR UPDATE',[$r['user_id']]);$r=Database::one('SELECT * FROM landing_pages WHERE id=? AND user_id=? FOR UPDATE',[$r['id'],$r['user_id']]);$c=self::decode($r)['content'];Blocks::publishable($c);Blocks::ownedProducts($c['blocks'],$r['user_id']);Media::validateReferences(Blocks::imageUrls($c),$r['user_id'],$r['id']);self::checkSlug($r['slug'],$r['id']);self::checkSubdomain($r['subdomain']??null,$r['id']);Database::query("UPDATE landing_pages SET status='published',published_content=?::jsonb,published_product_snapshot=product_snapshot,published_slug=slug,published_subdomain=subdomain,published_at=now(),updated_at=now() WHERE id=?",[Support::json($c),$r['id']]);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}
 }
 public static function render(array $row,bool $preview=false,string $notice=''): string {
  return LandingRenderer::render($row,$preview,$notice);
 }
}
