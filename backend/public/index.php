<?php
declare(strict_types=1);
use App\{Support,Auth,Api,Database,Landing,Leads,HttpError,Media,Blocks,Store};
header('X-Content-Type-Options: nosniff');header('Referrer-Policy: strict-origin-when-cross-origin');header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: default-src 'self'; img-src 'self' https: http: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'");
$path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/';$method=$_SERVER['REQUEST_METHOD']??'GET';
$api=str_starts_with($path,'/api/');
$root=is_file(dirname(__DIR__).'/bootstrap.php')?dirname(__DIR__):dirname(__DIR__).'/tinvana';
try {
 require $root.'/bootstrap.php';
 // <tienda>.<dominio de APP_URL>: cada usuario es una tienda y solo sirve sus propias landings publicadas bajo /p/<slug>.
 $storeBase=Store::base();$host=strtolower(explode(':',(string)($_SERVER['HTTP_HOST']??''))[0]);
 if($storeBase!==null&&str_ends_with($host,'.'.$storeBase)){
  $label=substr($host,0,-strlen('.'.$storeBase));
  if(!Store::isReserved($label)){
   $storeOwner=preg_match('/^[a-z0-9-]+$/',$label)?Store::owner($label):null;
   if($storeOwner===null)throw new HttpError(404,'Tienda no encontrada.');
   if(preg_match('~^/p/([a-z0-9]+(?:-[a-z0-9]+)*)(?:/lead)?$~',$path,$mine)){
    if(!Database::one("SELECT id FROM landing_pages WHERE COALESCE(published_slug,slug)=? AND user_id=? AND status='published'",[$mine[1],$storeOwner]))throw new HttpError(404,'Producto no encontrado.');
   }elseif($path==='/')throw new HttpError(404,'Esta tienda aún no tiene página de inicio.');
  }
 }
 if(Support::env('APP_ENV')==='production')header('Strict-Transport-Security: max-age=31536000');
 if($path==='/sitemap.xml'){
  header('Content-Type: application/xml; charset=utf-8');$rows=Database::all("SELECT COALESCE(l.published_slug,l.slug) AS slug,u.store_subdomain,l.published_at AS updated_at FROM landing_pages l JOIN users u ON u.id=l.user_id WHERE l.status='published'");echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';foreach($rows as $r)echo '<url><loc>'.Support::escape(Store::landingUrl((string)$r['slug'],$r['store_subdomain']??null)).'</loc><lastmod>'.gmdate('c',strtotime($r['updated_at'])).'</lastmod></url>';echo '</urlset>';exit;
 }
 if($path==='/datos-geograficos'){if($method!=='GET')throw new HttpError(405,'Use GET.');header('Content-Type: text/html; charset=utf-8');echo App\GeographyAttribution::html();exit;}
 if(in_array($path,['/geography-data/world.zip','/geography-data/colombia.json'],true)){if($method!=='GET')throw new HttpError(405,'Use GET.');$world=$path==='/geography-data/world.zip';$file=$root.'/resources/geo/'.($world?'world/world.zip':'colombia.json');header('Content-Type: '.($world?'application/zip':'application/json; charset=utf-8'));header('Cache-Control: public, max-age=86400');header('Content-Disposition: attachment; filename="'.($world?'zenzales-world-geography.zip':'zenzales-colombia-divipola.json').'"');readfile($file);exit;}
 if(preg_match('~^/api/geography/(countries|states|cities)$~',$path,$geo)){if($method!=='GET')throw new HttpError(405,'Use GET.');header('Content-Type: application/json; charset=utf-8');header('Cache-Control: public, max-age=3600');echo Support::json(App\Geography::listing($geo[1],$_GET));exit;}
 Auth::start();header('Cache-Control: no-store');if(preg_match('~^/(registro|verificar-correo|reenviar-verificacion|recuperar-contrasena|restablecer-contrasena)$~',$path)){header('Referrer-Policy: no-referrer');header('X-Robots-Tag: noindex, nofollow');}
 if(preg_match('~^/media/([a-f0-9-]+)\.webp$~',$path,$m)){
  if(!in_array($method,['GET','HEAD'],true)||!Support::isUuid($m[1]))throw new HttpError(404,'Imagen no encontrada.');
  $asset=Database::one('SELECT * FROM media_assets WHERE id=?',[$m[1]]);
  if(!$asset)throw new HttpError(404,'Imagen no encontrada.');
  $owner=false;if(isset($_SESSION['user_id'])&&$_SESSION['user_id']===$asset['user_id']){try{$owner=Auth::user()['id']===$asset['user_id'];}catch(HttpError $e){if($e->status!==401)throw $e;}}
  $published=Media::isPublished($asset,$path);
  if(!$owner&&!$published){$expires=(string)($_GET['expires']??'');$signature=(string)($_GET['signature']??'');$preview=(string)($_GET['landing']??$asset['landing_page_id']??'');$key=base64_decode(Support::env('TOKEN_ENCRYPTION_KEY'),true);
   if(!$key||!Support::isUuid($preview)||!ctype_digit($expires)||(int)$expires<time()||(int)$expires>time()+900||!hash_equals(hash_hmac('sha256',$preview.':'.$expires,$key),$signature)||!Database::one('SELECT id FROM landing_pages WHERE id=? AND user_id=?',[$preview,$asset['user_id']]))throw new HttpError(404,'Imagen no encontrada.');
  }
  $file=Media::path($m[1]);if(!is_file($file))throw new HttpError(404,'Imagen no encontrada.');
  header('Content-Type: image/webp');header('Content-Length: '.filesize($file));if($published)header('Cache-Control: public, max-age=300');if($method==='GET')readfile($file);exit;
 }
 if(preg_match('~^/api/media/([a-f0-9-]{36})/download$~',$path,$download)&&in_array($method,['GET','HEAD'],true)){
  $user=Auth::user();$asset=Database::one('SELECT * FROM media_assets WHERE id=? AND user_id=?',[$download[1],$user['id']]);if(!$asset)throw new HttpError(404,'Archivo no encontrado.');$file=Media::path($asset['id']);if(!is_file($file))throw new HttpError(404,'Archivo no encontrado.');
  $name=pathinfo($asset['original_name']?:'imagen',PATHINFO_FILENAME).'.webp';header('Content-Type: image/webp');header('Content-Length: '.filesize($file));header("Content-Disposition: attachment; filename=imagen.webp; filename*=UTF-8''".rawurlencode($name));if($method==='GET')readfile($file);exit;
 }
 if($path==='/api/profile/avatar'&&in_array($method,['GET','HEAD'],true)){$user=Auth::user();$r=Database::one('SELECT avatar_id FROM users WHERE id=?',[$user['id']]);$file=$r['avatar_id']?App\Profile::avatarPath($r['avatar_id']):'';if(!$file||!is_file($file))throw new HttpError(404,'Foto no disponible.');header('Content-Type: image/webp');header('Content-Length: '.filesize($file));if($method==='GET')readfile($file);exit;}
 if($api){header('Content-Type: application/json; charset=utf-8');echo Support::json(Api::handle($path,$method));exit;}
 if(preg_match('~^/p/([a-z0-9]+(?:-[a-z0-9]+)*)(/lead)?$~',$path,$m)){
  $r=Database::one("SELECT * FROM landing_pages WHERE COALESCE(published_slug,slug)=? AND status='published'",[$m[1]]);if(!$r)throw new HttpError(404,'Producto no encontrado.');$r=Landing::published($r);
  if(isset($m[2])){
   if($method!=='POST')throw new HttpError(405,'Método no permitido.');Auth::csrf();Auth::limit('lead-ip:'.($_SERVER['REMOTE_ADDR']??''),15,3600);
   $json=str_contains($_SERVER['CONTENT_TYPE']??'','application/json');$b=$json?Api::body():$_POST;$result=Leads::save($r,$b);
   if($json){header('Content-Type: application/json; charset=utf-8');http_response_code(202);echo Support::json($result);}else {echo Landing::render($r,false,$result['message']);}exit;
  }
  if($method!=='GET'&&$method!=='HEAD')throw new HttpError(405,'Método no permitido.');header('Content-Type: text/html; charset=utf-8');echo Landing::render($r);exit;
 }
 if(preg_match('~^/preview/([^/]+)$~',$path,$m)){
  if(!Support::isUuid($m[1]))throw new HttpError(404,'Vista previa no encontrada.');
  $authorized=false;if(isset($_SESSION['user_id'])){$user=Auth::user();$r=Database::one('SELECT * FROM landing_pages WHERE id=? AND user_id=?',[$m[1],$user['id']]);$authorized=(bool)$r;}
  if(!$authorized){$expires=(string)($_GET['expires']??'');$signature=(string)($_GET['signature']??'');$key=base64_decode(Support::env('TOKEN_ENCRYPTION_KEY'),true);if(!$key||!ctype_digit($expires)||(int)$expires<time()||(int)$expires>time()+900||!hash_equals(hash_hmac('sha256',$m[1].':'.$expires,$key),$signature))throw new HttpError(404,'Vista previa no disponible o enlace vencido.');$r=Database::one('SELECT * FROM landing_pages WHERE id=?',[$m[1]]);}
  if(empty($r))throw new HttpError(404,'Vista previa no encontrada.');header('X-Robots-Tag: noindex, nofollow');header('Referrer-Policy: no-referrer');echo Landing::render($r,true);exit;
 }
 if(!preg_match('~^/(?:login|registro|verificar-correo|reenviar-verificacion|recuperar-contrasena|restablecer-contrasena|panel(?:/(?:catalogo|integraciones|webhooks|ia|perfil|seguridad|productos(?:/[a-f0-9-]+/ofertas)?|archivos|plantilla|leads|pedidos(?:/[a-f0-9-]+)?|landings/[a-f0-9-]+))?)?/?$~',$path))throw new HttpError(404,'Página no encontrada.');
 $file=__DIR__.'/app/index.html';if(!is_file($file))throw new HttpError(503,'Compila el frontend con npm run build.');readfile($file);
}catch(HttpError $e){http_response_code($e->status);if($api||str_contains($_SERVER['CONTENT_TYPE']??'','application/json')){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$e->getMessage()]+$e->details,JSON_UNESCAPED_UNICODE);}else {header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Error '.$e->status.'</title><link rel="stylesheet" href="/landing.css"><main><h1>'.htmlspecialchars($e->getMessage(),ENT_QUOTES,'UTF-8').'</h1><p>Vuelve atrás para revisar el formulario o la dirección.</p></main></html>';}
}catch(\PDOException $e){
 $driver='pgsql';try{$driver=Database::driver();}catch(\Throwable){}
 $state=(string)$e->getCode();error_log('Tinvana database driver='.$driver.' sqlstate='.$state);
 $mysqlDuplicate=$driver==='mysql'&&isset($e->errorInfo[1])&&(int)$e->errorInfo[1]===1062;
 $conflict=$state==='23505'||$mysqlDuplicate;http_response_code($conflict?409:503);
 $engine=$driver==='mysql'?'MySQL':'PostgreSQL';$message=$conflict?'El slug o registro ya existe. Elige un valor único.':$engine.' no está disponible. Revisa la conexión y las migraciones.';
 if($api||str_contains($_SERVER['CONTENT_TYPE']??'','application/json')){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$message]);}else{echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Servicio no disponible</title><h1>'.$message.'</h1></html>';}
}catch(\Throwable $e){
 // Log classes/codes only: exception messages may include credentials, request data or DSNs.
 error_log('Zenzales error: '.get_class($e).' code='.(string)$e->getCode());http_response_code(503);$message='El servicio no está disponible. Revisa la configuración del servidor.';
 if($api){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$message]);}else {header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Servicio no disponible</title><h1>'.$message.'</h1></html>';}
}
