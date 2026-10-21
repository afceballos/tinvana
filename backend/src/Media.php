<?php
declare(strict_types=1);
namespace App;
final class Media {
 const MAX_INPUT=8388608;
 const MAX_OUTPUT=409600;
 public static function optimize(string $source,string $target):array {
  if(!extension_loaded('gd')||!function_exists('imagewebp'))throw new HttpError(503,'El servidor necesita GD con soporte WebP.');
  $info=@getimagesize($source);
  if(!$info||!in_array($info[2],[IMAGETYPE_JPEG,IMAGETYPE_PNG,IMAGETYPE_WEBP],true))throw new HttpError(422,'Sube una imagen JPEG, PNG o WebP válida.');
  [$w,$h]=$info;
  if($w<1||$h<1||$w*$h>16000000||$w>8000||$h>8000)throw new HttpError(422,'La imagen supera 16 megapíxeles o 8000 píxeles por lado.');
  $image=match($info[2]){IMAGETYPE_JPEG=>@imagecreatefromjpeg($source),IMAGETYPE_PNG=>@imagecreatefrompng($source),default=>@imagecreatefromwebp($source)};
  if(!$image)throw new HttpError(422,'No se pudo leer la imagen.');
  try {
   $ratio=min(1,1600/max($w,$h));$width=max(1,(int)round($w*$ratio));$height=max(1,(int)round($h*$ratio));
   for($round=0;$round<5;$round++){
    $canvas=imagecreatetruecolor($width,$height);imagealphablending($canvas,false);imagesavealpha($canvas,true);
    imagefill($canvas,0,0,imagecolorallocatealpha($canvas,0,0,0,127));imagecopyresampled($canvas,$image,0,0,0,0,$width,$height,$w,$h);
    try{foreach([82,72,62,52] as $quality){if(!imagewebp($canvas,$target,$quality))throw new HttpError(503,'No se pudo convertir la imagen a WebP.');clearstatcache(true,$target);$bytes=filesize($target);if($bytes>0&&$bytes<=self::MAX_OUTPUT)return ['bytes'=>$bytes,'width'=>$width,'height'=>$height];}}
    finally{imagedestroy($canvas);}
    $width=max(1,(int)floor($width*.8));$height=max(1,(int)floor($height*.8));
   }
   throw new HttpError(422,'No fue posible optimizar esta imagen a 400 KB.');
  }finally{imagedestroy($image);}
 }
 public static function path(string $id):string {
  if(!Support::isUuid($id))throw new HttpError(404,'Imagen no encontrada.');
  $asset=Database::one('SELECT storage_path FROM media_assets WHERE id=?',[$id]);$relative=$asset['storage_path']??$id.'.webp';
  if(!preg_match('~^(?:[a-f0-9-]{36}/[0-9]{4}/[0-9]{2}/)?[a-f0-9-]{36}\.webp$~D',$relative))throw new HttpError(404,'Imagen no encontrada.');
  return dirname(__DIR__).'/storage/media/'.$relative;
 }
 public static function item(array $asset):array {
  return ['id'=>$asset['id'],'name'=>$asset['original_name']?:'Imagen '.substr($asset['id'],0,8).'.webp','url'=>rtrim(Support::env('APP_URL'),'/').'/media/'.$asset['id'].'.webp','download_url'=>'/api/media/'.$asset['id'].'/download','bytes'=>(int)$asset['bytes'],'width'=>(int)$asset['width'],'height'=>(int)$asset['height'],'created_at'=>$asset['created_at'],'month'=>substr($asset['created_at'],0,7)];
 }
 public static function listing(string $owner,array $query):array {
  $page=filter_var($query['page']??1,FILTER_VALIDATE_INT);$month=$query['month']??'';$search=$query['search']??'';
  if(!$page||$page<1||$page>10000||!is_string($month)||($month!==''&&(!preg_match('/^[0-9]{4}-(0[1-9]|1[0-2])$/D',$month)||(int)substr($month,0,4)<1))||!is_string($search)||mb_strlen($search)>100)throw new HttpError(422,'Filtros de archivos inválidos.');
  $where='user_id=?';$args=[$owner];if($month!==''){$where.=" AND created_at>=?::date AND created_at<(?::date + interval '1 month')";$args[]=$month.'-01';$args[]=$month.'-01';}
  if($search!==''){$where.=' AND original_name ILIKE ?';$args[]='%'.str_replace(['!','%','_'],['!!','!%','!_'],$search).'%';$where.=" ESCAPE '!'";}
  $rows=Database::all('SELECT * FROM media_assets WHERE '.$where.' ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET '.(($page-1)*24),$args);
  $months=Database::all("SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM') AS month,count(*) AS count FROM media_assets WHERE user_id=? GROUP BY 1 ORDER BY 1 DESC",[$owner]);
  return ['assets'=>array_map([self::class,'item'],array_slice($rows,0,24)),'hasNext'=>count($rows)>24,'months'=>$months,'page'=>$page];
 }
 public static function isPublished(array $asset,string $path):bool {
  $rows=Database::all("SELECT published_content FROM landing_pages WHERE user_id=? AND status='published' AND published_content::text LIKE ?",[$asset['user_id'],'%'.$path.'%']);
  foreach($rows as $row)foreach(Blocks::imageUrls(self::rebase(json_decode($row['published_content'],true))) as $url)if(parse_url($url,PHP_URL_PATH)===$path)return true;
  return false;
 }

 public static function rebase(mixed $value):mixed {
  if(is_array($value)){foreach($value as &$item)$item=self::rebase($item);unset($item);return $value;}
  if(is_string($value)&&preg_match('~^https?://(?:127\.0\.0\.1|localhost|[a-z0-9-]+\.trycloudflare\.com)(?::[0-9]+)?(/media/[a-f0-9-]{36}\.webp)$~i',$value,$m))return rtrim(Support::env('APP_URL'),'/').$m[1];
  return $value;
 }
 public static function validateReferences(array $images,string $owner,string $landing):void {
  // Serialize stored references with bulk deletion; previews do not mutate data.
  if(Database::connection()->inTransaction())self::lockLibrary($owner);
  foreach($images as $url){$path=parse_url($url,PHP_URL_PATH);if(is_string($path)&&preg_match('~^/media/([a-f0-9-]+)\.webp$~',$path,$m)){
   $asset=Database::one('SELECT id FROM media_assets WHERE id=? AND user_id=?',[$m[1],$owner]);
   if(!$asset)throw new HttpError(422,'La imagen subida no pertenece a tu cuenta.');
  }}
 }
 private static function lockLibrary(string $owner):void {
  Database::query('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',['media-library:'.$owner]);
 }
 public static function remove(string $owner,array $body):array {
  $ids=$body['ids']??null;
  if(!is_array($ids)||!array_is_list($ids)||count($ids)<1||count($ids)>100)throw new HttpError(422,'Selecciona entre 1 y 100 archivos.');
  foreach($ids as $id)if(!is_string($id)||!Support::isUuid($id))throw new HttpError(422,'Selección de archivos inválida.');
  $ids=array_values(array_unique(array_map('strtolower',$ids)));sort($ids);Auth::limit('media-delete:'.$owner,30,3600);
  $db=Database::connection();$db->beginTransaction();$staged=[];
  try{
   self::lockLibrary($owner);$placeholders=implode(',',array_fill(0,count($ids),'?'));
   $assets=Database::all('SELECT * FROM media_assets WHERE user_id=? AND id IN ('.$placeholders.') ORDER BY id FOR UPDATE',[$owner,...$ids]);
   if(count($assets)!==count($ids))throw new HttpError(404,'Uno de los archivos no existe o no pertenece a tu cuenta.');
   $pattern='/media/('.implode('|',$ids).')\\.webp';$used=[];
   $mark=function(string $json,string $reason)use(&$used,$ids){preg_match_all('~/media/([a-f0-9-]{36})\.webp~i',$json,$matches);foreach($matches[1] as $id)if(in_array($id,$ids,true))$used[$id]=$reason;};
   $rows=Database::all('SELECT content,published_content FROM landing_pages WHERE user_id=? AND (content::text ~ ? OR published_content::text ~ ?)',[$owner,$pattern,$pattern]);
   foreach($rows as $row)$mark($row['content'].' '.$row['published_content'],'En uso en una landing guardada o su versión publicada.');
   foreach(Database::all('SELECT product_data FROM leads WHERE user_id=? AND product_data::text ~ ?',[$owner,$pattern]) as $row)$mark($row['product_data'],'Conservada en una consulta recibida.');
   $settings=Database::one('SELECT settings FROM template_settings WHERE user_id=?',[$owner]);if($settings)$mark($settings['settings'],'En uso en una plantilla guardada.');
   $deleted=[];$blocked=[];
   foreach($assets as $asset){
    if(isset($used[$asset['id']])){$blocked[]=['id'=>$asset['id'],'name'=>self::item($asset)['name'],'reason'=>$used[$asset['id']]];continue;}
    $path=self::path($asset['id']);if(is_file($path)){$temporary=$path.'.deleting-'.Support::uuid();if(!rename($path,$temporary))throw new HttpError(503,'No se pudo eliminar el archivo. Inténtalo de nuevo.');$staged[]=['original'=>$path,'temporary'=>$temporary];}
    Database::query('DELETE FROM media_assets WHERE id=? AND user_id=?',[$asset['id'],$owner]);$deleted[]=$asset['id'];
   }
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();foreach(array_reverse($staged) as $file)if(is_file($file['temporary']))rename($file['temporary'],$file['original']);throw $e;}
  foreach($staged as $file)if(is_file($file['temporary'])&&!unlink($file['temporary']))error_log('Media deletion: private temporary file could not be purged.');
  return ['deleted'=>$deleted,'blocked'=>$blocked];
 }
 public static function upload(?array $landing,string $owner):array {
  Auth::limit('media:'.$owner,60,3600);
  if((int)($_SERVER['CONTENT_LENGTH']??0)>self::MAX_INPUT+65536)throw new HttpError(413,'Máximo 8 MB por imagen.');
  $f=$_FILES['image']??null;
  if(!$f||is_array($f['error']??null)||($f['error']??1)!==UPLOAD_ERR_OK)throw new HttpError(422,'No se recibió la imagen. Revisa los límites de carga de PHP.');
  if($f['size']>self::MAX_INPUT||!is_uploaded_file($f['tmp_name']))throw new HttpError(413,'Máximo 8 MB por imagen.');
  $count=Database::one('SELECT count(*) AS n FROM media_assets WHERE user_id=?',[$owner]);
  if((int)$count['n']>=2000)throw new HttpError(422,'Se alcanzó el límite de 2000 archivos en tu biblioteca.');
  $id=Support::uuid();$relative=$owner.'/'.gmdate('Y/m').'/'.$id.'.webp';$path=dirname(__DIR__).'/storage/media/'.$relative;$dir=dirname($path);$name=preg_replace('/[<>\x00-\x1f\x7f]/u','',basename(str_replace('\\','/',(string)($f['name']??'imagen'))))??'imagen';$name=mb_strcut($name,0,180,'UTF-8');
  if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new HttpError(503,'No se pudo crear el almacenamiento de imágenes.');
  try{$meta=self::optimize($f['tmp_name'],$path);Database::query('INSERT INTO media_assets(id,user_id,landing_page_id,bytes,width,height,original_name,storage_path) VALUES(?,?,?,?,?,?,?,?)',[$id,$owner,$landing['id']??null,$meta['bytes'],$meta['width'],$meta['height'],$name,$relative]);}
  catch(\Throwable $e){if(is_file($path))unlink($path);throw $e;}
  return self::item(Database::one('SELECT * FROM media_assets WHERE id=?',[$id]));
 }
}
