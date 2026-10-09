<?php
declare(strict_types=1);
use App\{Support,Auth,Api,Database,Landing,Leads,HttpError,Media};
header('X-Content-Type-Options: nosniff');header('Referrer-Policy: strict-origin-when-cross-origin');header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: default-src 'self'; img-src 'self' https: http: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'");
$path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/';$method=$_SERVER['REQUEST_METHOD']??'GET';
$api=str_starts_with($path,'/api/');
try {
 require dirname(__DIR__).'/bootstrap.php';
 if(Support::env('APP_ENV')==='production')header('Strict-Transport-Security: max-age=31536000');
 if($path==='/sitemap.xml'){
  header('Content-Type: application/xml; charset=utf-8');$rows=Database::all("SELECT slug,updated_at FROM landing_pages WHERE status='published'");echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';foreach($rows as $r)echo '<url><loc>'.Support::escape(rtrim(Support::env('APP_URL'),'/').'/p/'.$r['slug']).'</loc><lastmod>'.gmdate('c',strtotime($r['updated_at'])).'</lastmod></url>';echo '</urlset>';exit;
 }
 Auth::start();header('Cache-Control: no-store');
 if(preg_match('~^/media/([a-f0-9-]+)\.webp$~',$path,$m)){
  if(!in_array($method,['GET','HEAD'],true)||!Support::isUuid($m[1]))throw new HttpError(404,'Imagen no encontrada.');
  $asset=Database::one('SELECT a.*,l.content,l.status FROM media_assets a JOIN landing_pages l ON l.id=a.landing_page_id WHERE a.id=?',[$m[1]]);
  if(!$asset)throw new HttpError(404,'Imagen no encontrada.');
  $owner=isset($_SESSION['user_id'])&&$_SESSION['user_id']===$asset['user_id'];
  $images=json_decode($asset['content'],true)['images']??[];
  $published=$asset['status']==='published'&&in_array(rtrim(Support::env('APP_URL'),'/').$path,$images,true);
  if(!$owner&&!$published){$expires=(string)($_GET['expires']??'');$signature=(string)($_GET['signature']??'');$key=base64_decode(Support::env('TOKEN_ENCRYPTION_KEY'),true);if(!$key||!ctype_digit($expires)||(int)$expires<time()||(int)$expires>time()+900||!hash_equals(hash_hmac('sha256',$asset['landing_page_id'].':'.$expires,$key),$signature))throw new HttpError(404,'Imagen no encontrada.');}
  $file=Media::path($m[1]);if(!is_file($file))throw new HttpError(404,'Imagen no encontrada.');
  header('Content-Type: image/webp');header('Content-Length: '.filesize($file));if($published)header('Cache-Control: public, max-age=300');if($method==='GET')readfile($file);exit;
 }
 if($api){header('Content-Type: application/json; charset=utf-8');echo Support::json(Api::handle($path,$method));exit;}
 if(preg_match('~^/p/([a-z0-9]+(?:-[a-z0-9]+)*)(/lead)?$~',$path,$m)){
  $r=Database::one("SELECT * FROM landing_pages WHERE slug=? AND status='published'",[$m[1]]);if(!$r)throw new HttpError(404,'Producto no encontrado.');
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
 if(!preg_match('~^/(?:login|panel(?:/(?:catalogo|integraciones|webhooks|productos|plantilla|leads|landings/[a-f0-9-]+))?)?/?$~',$path))throw new HttpError(404,'Página no encontrada.');
 $file=__DIR__.'/app/index.html';if(!is_file($file))throw new HttpError(503,'Compila el frontend con npm run build.');readfile($file);
}catch(HttpError $e){http_response_code($e->status);if($api||str_contains($_SERVER['CONTENT_TYPE']??'','application/json')){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$e->getMessage()]+$e->details,JSON_UNESCAPED_UNICODE);}else {header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Error '.$e->status.'</title><link rel="stylesheet" href="/landing.css"><main><h1>'.htmlspecialchars($e->getMessage(),ENT_QUOTES,'UTF-8').'</h1><p>Vuelve atrás para revisar el formulario o la dirección.</p></main></html>';}
}catch(\PDOException $e){
 error_log('Zenzales PostgreSQL code='.(string)$e->getCode());$conflict=$e->getCode()==='23505';http_response_code($conflict?409:503);$message=$conflict?'El slug o registro ya existe. Elige un valor único.':'PostgreSQL no está disponible. Revisa la conexión y las migraciones.';
 if($api||str_contains($_SERVER['CONTENT_TYPE']??'','application/json')){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$message]);}else{echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Servicio no disponible</title><h1>'.$message.'</h1></html>';}
}catch(\Throwable $e){
 // Log classes/codes only: exception messages may include credentials, request data or DSNs.
 error_log('Zenzales error: '.get_class($e).' code='.(string)$e->getCode());http_response_code(503);$message='El servicio no está disponible. Revisa la configuración del servidor.';
 if($api){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$message]);}else {header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Servicio no disponible</title><h1>'.$message.'</h1></html>';}
}
