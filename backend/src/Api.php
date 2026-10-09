<?php
declare(strict_types=1);
namespace App;
final class Api {
 public static function body(): array { if((int)($_SERVER['CONTENT_LENGTH']??0)>1000000)throw new HttpError(413,'Solicitud demasiado grande.');$raw=file_get_contents('php://input',false,null,0,1000001);if(strlen($raw)>1000000)throw new HttpError(413,'Solicitud demasiado grande.');try{$b=json_decode($raw,true,64,JSON_THROW_ON_ERROR);}catch(\JsonException){throw new HttpError(400,'JSON inválido.');}if(!is_array($b))throw new HttpError(400,'Se requiere un objeto JSON.');return $b; }
 public static function owned(string $table,string $id,string $owner): array { if(!in_array($table,['integrations','selected_products','landing_pages','leads'],true)||!Support::isUuid($id))throw new HttpError(404,'Registro no encontrado.');$r=Database::one("SELECT * FROM $table WHERE id=? AND user_id=?",[$id,$owner]);if(!$r)throw new HttpError(404,'Registro no encontrado.');return $r; }
 public static function integrationView(array $r): array {return ['id'=>$r['id'],'name'=>$r['name'],'configured'=>true,'created_at'=>$r['created_at'],'updated_at'=>$r['updated_at']];}
 public static function handle(string $path,string $method): array {
  if($path==='/api/auth/session'&&$method==='GET'){return ['user'=>isset($_SESSION['user_id'])?Auth::user():null,'csrf'=>$_SESSION['csrf']];}
  if(!in_array($method,['GET','HEAD'],true))Auth::csrf();
  if($path==='/api/auth/login'&&$method==='POST')return Auth::login(self::body());
  $u=Auth::user();$owner=$u['id'];
  if($path==='/api/webhook-settings'){
   if($method==='GET')return ['settings'=>Webhooks::view($owner)];
   if($method==='PUT')return ['settings'=>Webhooks::save($owner,self::body())];
   if($method==='DELETE')return ['settings'=>Webhooks::remove($owner)];
  }
  if($path==='/api/auth/logout'&&$method==='POST'){Auth::logout();return ['ok'=>true];}
  if($path==='/api/integrations'){
   if($method==='GET')return ['integrations'=>array_map([self::class,'integrationView'],Database::all('SELECT id,name,created_at,updated_at FROM integrations WHERE user_id=? ORDER BY created_at',[$owner]))];
   if($method==='POST'){$b=self::body();$id=Support::uuid();$name=Support::text($b['name']??null,120);$token=Support::text($b['token']??null,4096);if(preg_match('/[\r\n]/',$token))throw new HttpError(422,'Token inválido.');$cipher=Crypto::encrypt($token,$id.':'.$owner);$r=Database::one('INSERT INTO integrations(id,user_id,name,token_ciphertext) VALUES(?,?,?,?) RETURNING id,name,created_at,updated_at',[$id,$owner,$name,$cipher]);return ['integration'=>self::integrationView($r)];}
  }
  if(preg_match('~^/api/integrations/([^/]+)(?:/(test|products|categories))?$~',$path,$m)){
   $r=self::owned('integrations',$m[1],$owner);$action=$m[2]??'';
   if($method==='PATCH'&&$action===''){$b=self::body();$token=Support::text($b['token']??null,4096);if(preg_match('/[\r\n]/',$token))throw new HttpError(422,'Token inválido.');Database::query('UPDATE integrations SET token_ciphertext=?,updated_at=now() WHERE id=?',[Crypto::encrypt($token,$r['id'].':'.$owner),$r['id']]);unset($_SESSION['catalog_pages'][$r['id']]);return ['ok'=>true];}
   if($method==='POST'&&$action==='test'){Dropi::request($r,['pageSize'=>1,'startData'=>0,'no_count'=>true,'order_by'=>'id','order_type'=>'asc','keywords'=>'','favorite'=>false]);return ['ok'=>true,'message'=>'Dropi respondió correctamente desde este servidor.'];}
   if($method==='GET'&&$action==='categories')return Dropi::request($r,[],true);
   if($method==='GET'&&$action==='products'){
    $params=Dropi::parameters($_GET);$result=Dropi::catalog($r,$params);$objects=array_slice($result['objects'],0,$params['pageSize']);
    // Bounded, server-side cache for selecting exact products without undocumented Dropi filters.
    $_SESSION['catalog_pages'][$r['id']]??=[];$_SESSION['catalog_pages'][$r['id']][]=['at'=>time(),'objects'=>$objects];$_SESSION['catalog_pages'][$r['id']]=array_slice($_SESSION['catalog_pages'][$r['id']],-3);
    $selected=Database::all('SELECT id,dropi_id FROM selected_products WHERE user_id=? AND integration_id=?',[$owner,$r['id']]);$lookup=[];foreach($selected as $s)$lookup[(string)$s['dropi_id']]=$s['id'];
    return ['products'=>array_map(function($p)use($lookup){$p=Product::map($p);$p['selectedId']=$lookup[$p['id']]??null;return $p;},$objects),'hasNext'=>count($result['objects'])>=$params['pageSize'],'page'=>(int)($_GET['page']??1)];
   }
  }
  if($path==='/api/products'){
   if($method==='GET'){$rows=Database::all('SELECT p.*,l.id AS landing_id,COALESCE(l.published_slug,l.slug) AS slug,l.status AS publication_status FROM selected_products p LEFT JOIN landing_pages l ON l.selected_product_id=p.id WHERE p.user_id=? ORDER BY p.created_at DESC',[$owner]);foreach($rows as &$p){$p['product']=json_decode($p['mapped_data'],true);unset($p['original_data'],$p['mapped_data']);}return ['products'=>$rows];}
   if($method==='POST'){
    $b=self::body();$integration=self::owned('integrations',(string)($b['integration_id']??''),$owner);$id=(string)($b['dropi_id']??'');if(!preg_match('/^[1-9][0-9]{0,17}$/',$id))throw new HttpError(422,'ID de producto inválido.');
    $raw=null;foreach($_SESSION['catalog_pages'][$integration['id']]??[] as $page)if($page['at']>time()-900)foreach($page['objects'] as $p)if((string)$p['id']===$id)$raw=$p;
    if(!$raw)$raw=Dropi::find($integration,$id);
    $r=Database::one('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb) ON CONFLICT(integration_id,dropi_id) DO UPDATE SET updated_at=selected_products.updated_at RETURNING id',[Support::uuid(),$owner,$integration['id'],$id,Support::json($raw),Support::json(Product::map($raw))]);return ['id'=>$r['id']];
   }
  }
  if(preg_match('~^/api/products/([^/]+)(?:/(landing|refresh))?$~',$path,$m)){
   $p=self::owned('selected_products',$m[1],$owner);$action=$m[2]??'';
   if($method==='DELETE'&&$action===''){if(Database::one('SELECT id FROM landing_pages WHERE selected_product_id=?',[$p['id']]))throw new HttpError(409,'El producto tiene una landing. Conserva su selección para mantener el historial.');Database::query('DELETE FROM selected_products WHERE id=? AND user_id=?',[$p['id'],$owner]);return ['ok'=>true];}
   if($method==='POST'&&$action==='landing'){$r=Database::one('SELECT * FROM landing_pages WHERE selected_product_id=? AND user_id=?',[$p['id'],$owner])??Landing::create($p,$owner);return ['landing'=>Landing::decode($r)];}
   if($method==='POST'&&$action==='refresh'){
    $integration=self::owned('integrations',$p['integration_id'],$owner);$raw=Dropi::find($integration,(string)$p['dropi_id']);$mapped=Support::json(Product::map($raw));$db=Database::connection();$db->beginTransaction();try{Database::query('UPDATE selected_products SET original_data=?::jsonb,mapped_data=?::jsonb,updated_at=now() WHERE id=?',[Support::json($raw),$mapped,$p['id']]);Database::query('UPDATE landing_pages SET product_snapshot=?::jsonb,updated_at=now() WHERE selected_product_id=? AND user_id=?',[$mapped,$p['id'],$owner]);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}return ['ok'=>true,'message'=>'Datos originales actualizados; contenido comercial conservado.'];
   }
  }
  if($path==='/api/template-settings'){
   if($method==='GET'){$r=Database::one('SELECT settings FROM template_settings WHERE user_id=?',[$owner]);return ['settings'=>$r?json_decode($r['settings'],true):Landing::defaults()];}
   if($method==='PUT'){$s=Landing::visual(self::body());Database::query('INSERT INTO template_settings(user_id,settings) VALUES(?,?::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=template_settings.settings||excluded.settings,updated_at=now()',[$owner,Support::json($s)]);return ['settings'=>$s];}
  }
  if($path==='/api/builder-templates'){
   $stored=Database::one('SELECT settings FROM template_settings WHERE user_id=?',[$owner]);$settings=$stored?json_decode($stored['settings'],true):Landing::defaults();$templates=$settings['layouts']??[];
   if($method==='GET')return ['templates'=>$templates];
   if($method==='POST'){$b=self::body();if(count($templates)>=10)throw new HttpError(422,'Máximo 10 plantillas guardadas.');$blocks=Blocks::validate($b['blocks']??[]);foreach($blocks as &$block){$d=&$block['data'];if(isset($d['image'])&&preg_match('~/media/[a-f0-9-]+\.webp~',$d['image']))$d['image']='';if(isset($d['images']))$d['images']=array_values(array_filter($d['images'],fn($url)=>!preg_match('~/media/[a-f0-9-]+\.webp~',$url)));foreach($d['items']??[] as $i=>$item)if(preg_match('~/media/[a-f0-9-]+\.webp~',$item['image']))$d['items'][$i]['image']='';if(isset($d['relatedIds']))$d['relatedIds']=[];}unset($block,$d);$templates[]=['id'=>Support::uuid(),'name'=>Support::text($b['name']??null,100),'blocks'=>$blocks];}
   elseif($method==='DELETE'){$b=self::body();$templates=array_values(array_filter($templates,fn($template)=>$template['id']!==($b['id']??'')));}
   else throw new HttpError(405,'Método no permitido.');
   $settings['layouts']=$templates;Database::query('INSERT INTO template_settings(user_id,settings) VALUES(?,?::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,updated_at=now()',[$owner,Support::json($settings)]);return ['templates'=>$templates];
  }
  if(preg_match('~^/api/landings/([^/]+)(?:/(publish|unpublish|preview-link|images|render))?$~',$path,$m)){
   $r=self::owned('landing_pages',$m[1],$owner);$action=$m[2]??'';
   if($method==='POST'&&$action==='images')return ['image'=>Media::upload($r,$owner)];
   if($method==='GET'&&$action==='')return ['landing'=>Landing::decode($r)];
   if($method==='PUT'&&$action===''){$b=self::body();$c=Landing::content($b['content']??[]);Media::validateReferences(Blocks::imageUrls($c),$owner,$r['id']);$slug=Landing::slug($b['slug']??'');Landing::checkSlug($slug,$r['id']);Database::query('UPDATE landing_pages SET slug=?,content=?::jsonb,updated_at=now() WHERE id=? AND user_id=?',[$slug,Support::json($c),$r['id'],$owner]);return ['landing'=>Landing::decode(self::owned('landing_pages',$r['id'],$owner))];}
   if($method==='POST'&&$action==='render'){$b=self::body();$c=Landing::content($b['content']??[]);Media::validateReferences(Blocks::imageUrls($c),$owner,$r['id']);$r['content']=$c;$r['slug']=Landing::slug($b['slug']??$r['slug']);$_GET['expires']=time()+900;$_GET['signature']=hash_hmac('sha256',$r['id'].':'.$_GET['expires'],base64_decode(Support::env('TOKEN_ENCRYPTION_KEY'),true));return ['html'=>Landing::render($r,true)];}
   if($method==='POST'&&$action==='publish'){Landing::publish($r);return ['ok'=>true];}
   if($method==='POST'&&$action==='unpublish'){Database::query("UPDATE landing_pages SET status='draft',published_at=null,updated_at=now() WHERE id=? AND user_id=?",[$r['id'],$owner]);return ['ok'=>true];}
   if($method==='POST'&&$action==='preview-link'){
    $expires=time()+900;$payload=$r['id'].':'.$expires;$key=base64_decode(Support::env('TOKEN_ENCRYPTION_KEY'),true);if(!$key)throw new \RuntimeException('Falta clave de cifrado.');$signature=hash_hmac('sha256',$payload,$key);return ['url'=>'/preview/'.$r['id'].'?expires='.$expires.'&signature='.$signature,'expires_at'=>gmdate('c',$expires)];
   }
  }
  if($path==='/api/leads'&&$method==='GET'){
   $page=max(1,min(100000,(int)($_GET['page']??1)));$rows=Database::all('SELECT l.*,d.attempts,d.last_http_status,d.last_error,d.history,d.next_attempt_at FROM leads l LEFT JOIN webhook_deliveries d ON d.lead_id=l.id WHERE l.user_id=? ORDER BY l.created_at DESC LIMIT 26 OFFSET '.(($page-1)*25),[$owner]);$next=count($rows)>25;$rows=array_slice($rows,0,25);foreach($rows as &$r){$r['product_data']=json_decode($r['product_data'],true);$r['history']=json_decode($r['history']??'[]',true);}return ['leads'=>$rows,'hasNext'=>$next];
  }
  if(preg_match('~^/api/leads/([^/]+)/retry$~',$path,$m)&&$method==='POST'){
   $l=self::owned('leads',$m[1],$owner);if($l['status']!=='failed')throw new HttpError(409,'Solo se reintentan manualmente envíos fallidos.');
   $db=Database::connection();$db->beginTransaction();try{
    $delivery=Database::one("UPDATE webhook_deliveries SET status='pending',attempts=0,next_attempt_at=now(),updated_at=now() WHERE lead_id=? AND status='failed' RETURNING id",[$l['id']]);
    if(!$delivery)throw new HttpError(409,'El estado del envío ya cambió. Actualiza la lista.');
    Database::query("UPDATE leads SET status='pending',updated_at=now() WHERE id=?",[$l['id']]);$db->commit();
   }catch(\Throwable $e){$db->rollBack();throw $e;}return ['ok'=>true];
  }
  throw new HttpError(404,'Ruta no encontrada.');
 }
}
