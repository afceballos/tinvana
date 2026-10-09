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
 public static function path(string $id):string {return dirname(__DIR__).'/storage/media/'.$id.'.webp';}
 public static function validateReferences(array $images,string $owner,string $landing):void {
  foreach($images as $url){$path=parse_url($url,PHP_URL_PATH);if(is_string($path)&&preg_match('~^/media/([a-f0-9-]+)\.webp$~',$path,$m)){
   $asset=Database::one('SELECT id FROM media_assets WHERE id=? AND user_id=? AND landing_page_id=?',[$m[1],$owner,$landing]);
   if(!$asset)throw new HttpError(422,'La imagen subida no pertenece a esta landing.');
  }}
 }
 public static function upload(array $landing,string $owner):array {
  Auth::limit('media:'.$owner,60,3600);
  if((int)($_SERVER['CONTENT_LENGTH']??0)>self::MAX_INPUT+65536)throw new HttpError(413,'Máximo 8 MB por imagen.');
  $f=$_FILES['image']??null;
  if(!$f||is_array($f['error']??null)||($f['error']??1)!==UPLOAD_ERR_OK)throw new HttpError(422,'No se recibió la imagen. Revisa los límites de carga de PHP.');
  if($f['size']>self::MAX_INPUT||!is_uploaded_file($f['tmp_name']))throw new HttpError(413,'Máximo 8 MB por imagen.');
  $count=Database::one('SELECT count(*) AS n FROM media_assets WHERE landing_page_id=?',[$landing['id']]);
  if((int)$count['n']>=60)throw new HttpError(422,'Se alcanzó el límite de 60 archivos subidos para esta landing.');
  $id=Support::uuid();$path=self::path($id);$dir=dirname($path);
  if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new HttpError(503,'No se pudo crear el almacenamiento de imágenes.');
  try{$meta=self::optimize($f['tmp_name'],$path);Database::query('INSERT INTO media_assets(id,user_id,landing_page_id,bytes,width,height) VALUES(?,?,?,?,?,?)',[$id,$owner,$landing['id'],$meta['bytes'],$meta['width'],$meta['height']]);}
  catch(\Throwable $e){if(is_file($path))unlink($path);throw $e;}
  return ['url'=>rtrim(Support::env('APP_URL'),'/').'/media/'.$id.'.webp']+$meta;
 }
}
