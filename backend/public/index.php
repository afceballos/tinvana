<?php
declare(strict_types=1);
use App\{Support,Auth,Api,Database,Landing,Leads,HttpError,Media,Blocks,Store,DropiShipping};
// Pages the server refuses are answered with the panel app plus the error in a meta tag, so visitors get the branded error page.
function tinvanaErrorPage(int $status,string $message): void {
 header('Content-Type: text/html; charset=utf-8');$file=__DIR__.'/app/index.html';$page=is_file($file)?(string)file_get_contents($file):'';
 $home='/';try{$app=App\Support::env('APP_URL');if(preg_match('~^https://[^/]+$~',rtrim($app,'/')))$home=rtrim($app,'/').'/';}catch(\Throwable){}
 $data=htmlspecialchars((string)json_encode(['status'=>$status,'message'=>$message,'home'=>$home],JSON_UNESCAPED_UNICODE),ENT_QUOTES,'UTF-8');
 if(str_contains($page,'</head>')){echo str_replace('</head>','<meta name="tinvana-error" content="'.$data.'"></head>',$page);return;}
 echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Error '.$status.'</title><h1>'.htmlspecialchars($message,ENT_QUOTES,'UTF-8').'</h1></html>';
}
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
   $main=rtrim((string)Support::env('APP_URL'),'/');if(preg_match('~^https?://[^/]+$~',$main))header("Content-Security-Policy: default-src 'self'; img-src 'self' https: http: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ".$main."; form-action 'self'; frame-ancestors 'self'; base-uri 'none'");
   $storeOwner=preg_match('/^[a-z0-9-]+$/',$label)?Store::owner($label):null;
   if($storeOwner===null)throw new HttpError(404,'Tienda no encontrada.');
   if(preg_match('~^/p/([a-z0-9]+(?:-[a-z0-9]+)*)(?:/lead|/shipping)?$~',$path,$mine)){
    if(!Database::one("SELECT id FROM landing_pages WHERE COALESCE(published_slug,slug)=? AND user_id=? AND status='published'",[$mine[1],$storeOwner]))throw new HttpError(404,'Producto no encontrado.');
   }elseif($path==='/')throw new HttpError(404,'Esta tienda aún no tiene página de inicio.');
  }
 }
 if(Support::env('APP_ENV')==='production')header('Strict-Transport-Security: max-age=31536000');
 if($path==='/sitemap.xml'){
  header('Content-Type: application/xml; charset=utf-8');$rows=Database::all("SELECT COALESCE(l.published_slug,l.slug) AS slug,u.store_subdomain,l.published_at AS updated_at FROM landing_pages l JOIN users u ON u.id=l.user_id WHERE l.status='published' AND u.status='active'");echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';foreach($rows as $r)echo '<url><loc>'.Support::escape(Store::landingUrl((string)$r['slug'],$r['store_subdomain']??null)).'</loc><lastmod>'.gmdate('c',strtotime($r['updated_at'])).'</lastmod></url>';echo '</urlset>';exit;
 }
 // Meta WhatsApp webhook: public, no session. Verify (GET) or store signed events and acknowledge before processing (POST).
 if($path==='/whatsapp/webhook'){
  header('Content-Type: text/plain; charset=utf-8');header('Cache-Control: no-store');
  if($method==='GET'){$r=App\WhatsAppWebhook::verify($_GET);http_response_code($r['status']);echo $r['body'];exit;}
  if($method!=='POST')throw new HttpError(405,'Método no permitido.');
  $raw=(string)file_get_contents('php://input',false,null,0,App\WhatsAppWebhook::MAX_BYTES+1);
  $r=App\WhatsAppWebhook::receive($raw,(string)($_SERVER['HTTP_X_HUB_SIGNATURE_256']??''));
  http_response_code($r['status']);echo $r['status']===200?'EVENT_RECEIVED':'';
  if($r['status']===200&&$r['stored']>0){
   // Hand the response back to Meta first; the worker (and the whatsapp:work cron as a fallback) processes afterwards.
   if(function_exists('fastcgi_finish_request'))fastcgi_finish_request();elseif(function_exists('litespeed_finish_request'))litespeed_finish_request();
   if(class_exists('App\WhatsAppInbox'))App\WhatsAppInbox::work(20);
  }
  exit;
 }
 // Public legal pages (privacy policy and terms), server-rendered without session.
 if($path==='/privacidad'||$path==='/terminos'){if(!in_array($method,['GET','HEAD'],true))throw new HttpError(405,'Use GET.');header('Content-Type: text/html; charset=utf-8');header('Cache-Control: public, max-age=3600');echo $path==='/privacidad'?App\LegalPages::privacy():App\LegalPages::terms();exit;}
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
 if(preg_match('~^/api/landings/([a-f0-9-]+)/owner$~',$path,$m)&&$method==='GET'){
  $origin=(string)($_SERVER['HTTP_ORIGIN']??'');$app=parse_url((string)Support::env('APP_URL'));$authority=($app['host']??'').(isset($app['port'])?':'.$app['port']:'');
  if($storeBase!==null&&preg_match('~^'.preg_quote((string)($app['scheme']??'https'),'~').'://([a-z0-9-]+)\.'.preg_quote($authority,'~').'$~',$origin,$o)&&!Store::isReserved($o[1])){header('Access-Control-Allow-Origin: '.$origin);header('Access-Control-Allow-Credentials: true');}
  header('Vary: Origin');header('Content-Type: application/json; charset=utf-8');$owner=false;
  if(!empty($_SESSION['user_id'])&&Support::isUuid($m[1])){try{$u=Auth::user();$owner=(bool)Database::one('SELECT id FROM landing_pages WHERE id=? AND user_id=?',[$m[1],$u['id']]);}catch(HttpError){}}
  echo Support::json(['owner'=>$owner,'edit'=>$owner?rtrim((string)Support::env('APP_URL'),'/').'/panel/landings/'.$m[1]:null]);exit;
 }
 if($api){header('Content-Type: application/json; charset=utf-8');echo Support::json(Api::handle($path,$method));exit;}
 if(preg_match('~^/p/([a-z0-9]+(?:-[a-z0-9]+)*)(/lead|/shipping)?$~',$path,$m)){
  // Landings of suspended accounts are offline (pages, lead form and freight quote).
  $r=Database::one("SELECT * FROM landing_pages WHERE COALESCE(published_slug,slug)=? AND status='published' AND user_id IN (SELECT id FROM users WHERE status='active')",[$m[1]]);if(!$r)throw new HttpError(404,'Producto no encontrado.');$r=Landing::published($r);
  if(($m[2]??'')==='/shipping'){
   // Buyer-city freight quote with the owner's token, server side only; limited per IP because it calls Dropi.
   if($method!=='POST')throw new HttpError(405,'Método no permitido.');Auth::csrf();Auth::limit('shipping-ip:'.($_SERVER['REMOTE_ADDR']??''),60,3600);
   $b=Api::body();$city=$b['city_code']??'';$qty=filter_var($b['quantity']??1,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>100]]);
   if(!is_string($city)||!preg_match('/^[0-9]{5}$/D',$city)||$qty===false)throw new HttpError(422,'Ciudad o cantidad inválida.');
   $q=DropiShipping::forLanding($r,$city,$qty);header('Content-Type: application/json; charset=utf-8');
   echo Support::json(['amount'=>$q['amount']??null,'message'=>$q?null:'El envío a tu ciudad se confirmará al procesar el pedido.']);exit;
  }
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
 if(!preg_match('~^/(?:login|registro|verificar-correo|reenviar-verificacion|recuperar-contrasena|restablecer-contrasena|panel(?:/(?:catalogo|integraciones|webhooks|ia|perfil|seguridad|productos(?:/[a-f0-9-]+/ofertas)?|archivos|plantilla|leads|correos|notificaciones|whatsapp(?:/(?:conexion|plantillas|anuncios|agente|seguimientos|operacion|[a-f0-9-]+))?|pedidos(?:/[a-f0-9-]+)?|admin(?:/(?:planes|globales|auditoria|cuentas/[a-f0-9-]+))?|landings/[a-f0-9-]+))?)?/?$~',$path))throw new HttpError(404,'Página no encontrada.');
 $file=__DIR__.'/app/index.html';if(!is_file($file))throw new HttpError(503,'Compila el frontend con npm run build.');readfile($file);
}catch(HttpError $e){http_response_code($e->status);if($api||str_contains($_SERVER['CONTENT_TYPE']??'','application/json')){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$e->getMessage()]+$e->details,JSON_UNESCAPED_UNICODE);}else tinvanaErrorPage($e->status,$e->getMessage());
}catch(\PDOException $e){
 $driver='pgsql';try{$driver=Database::driver();}catch(\Throwable){}
 $state=(string)$e->getCode();error_log('Tinvana database driver='.$driver.' sqlstate='.$state);
 $mysqlDuplicate=$driver==='mysql'&&isset($e->errorInfo[1])&&(int)$e->errorInfo[1]===1062;
 $conflict=$state==='23505'||$mysqlDuplicate;http_response_code($conflict?409:503);
 $engine=$driver==='mysql'?'MySQL':'PostgreSQL';$message=$conflict?'El slug o registro ya existe. Elige un valor único.':$engine.' no está disponible. Revisa la conexión y las migraciones.';
 if($api||str_contains($_SERVER['CONTENT_TYPE']??'','application/json')){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$message]);}else tinvanaErrorPage($conflict?409:503,$message);
}catch(\Throwable $e){
 // Log classes/codes only: exception messages may include credentials, request data or DSNs.
 error_log('Zenzales error: '.get_class($e).' code='.(string)$e->getCode());http_response_code(503);$message='El servicio no está disponible. Revisa la configuración del servidor.';
 if($api){header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$message]);}else tinvanaErrorPage(503,$message);
}
