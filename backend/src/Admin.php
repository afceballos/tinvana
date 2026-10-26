<?php
declare(strict_types=1);
namespace App;

/**
 * Superadmin panel: accounts, plans, global defaults and the audit log.
 * Only role=superadmin reaches it (others get 404). It never reads or returns tokens, passwords or keys;
 * every change is written to admin_audit with the before/after of the fields it touched.
 */
final class Admin {
 private const PERIODS=['free','month','year','once'];

 public static function handle(array $actor,string $path,string $method): array {
  if($actor['role']!=='superadmin')throw new HttpError(404,'Ruta no encontrada.');
  if(!in_array($method,['GET','HEAD'],true))Auth::limit('admin-write:'.$actor['id'],120,600);
  if($path==='/api/admin/summary'&&$method==='GET')return self::summary();
  if($path==='/api/admin/users'&&$method==='GET')return self::users($_GET);
  if(preg_match('~^/api/admin/users/([^/]+)$~',$path,$m)){
   if($method==='GET')return self::user($m[1]);
   if($method==='PUT')return self::updateUser($actor,$m[1],Api::body());
  }
  if($path==='/api/admin/entitlements'){
   if($method==='GET')return self::catalog()+['defaults'=>Entitlements::defaults()];
   if($method==='PUT')return self::saveDefaults($actor,Api::body());
  }
  if($path==='/api/admin/plans'){
   if($method==='GET')return self::catalog()+['plans'=>self::plans()];
   if($method==='POST')return ['plan'=>self::savePlan($actor,null,Api::body())];
  }
  if(preg_match('~^/api/admin/plans/([^/]+)$~',$path,$m)){
   if($method==='PUT')return ['plan'=>self::savePlan($actor,$m[1],Api::body())];
   if($method==='DELETE')return self::deletePlan($actor,$m[1]);
  }
  if($path==='/api/admin/whatsapp-agent'){
   if($method==='GET')return ['defaults'=>WhatsAppAgentSettings::defaults(),'catalog'=>WhatsAppAgentSettings::catalog()];
   if($method==='PUT'){
    $before=WhatsAppAgentSettings::defaults();$after=WhatsAppAgentSettings::saveDefaults(Api::body());
    if($after!=$before)self::log($actor,null,'whatsapp_agent_defaults_updated',['before'=>$before,'after'=>$after]);
    return ['defaults'=>$after,'catalog'=>WhatsAppAgentSettings::catalog()];
   }
  }
  if($path==='/api/admin/audit'&&$method==='GET')return self::audit($_GET);
  throw new HttpError(404,'Ruta no encontrada.');
 }

 public static function catalog(): array {
  return ['features'=>Entitlements::FEATURES,'limits'=>Entitlements::LIMITS];
 }
 private static function log(array $actor,?string $target,string $action,array $data): void {
  Database::query('INSERT INTO admin_audit(id,actor_id,target_user_id,action,data) VALUES(?,?,?,?,?::jsonb)',[Support::uuid(),$actor['id'],$target,$action,Support::json($data)]);
 }
 private static function count(string $sql,array $args=[]): int {return (int)(Database::one($sql,$args)['total']??0);}

 private static function summary(): array {
  return ['users'=>self::count('SELECT count(*) AS total FROM users'),'suspended'=>self::count("SELECT count(*) AS total FROM users WHERE status='suspended'"),
   'new_30_days'=>self::count("SELECT count(*) AS total FROM users WHERE created_at>now()-interval '30 days'"),'unverified'=>self::count('SELECT count(*) AS total FROM users WHERE email_verified_at IS NULL'),
   'landings'=>self::count('SELECT count(*) AS total FROM landing_pages'),'published'=>self::count("SELECT count(*) AS total FROM landing_pages WHERE status='published'"),
   'orders'=>self::count('SELECT count(*) AS total FROM orders'),'plans'=>self::count('SELECT count(*) AS total FROM plans')];
 }

 private static function name(array $u): string {
  $p=json_decode((string)($u['profile']??'{}'),true)?:[];return trim(((string)($p['first_name']??'')).' '.((string)($p['last_name']??'')));
 }
 private static function users(array $q): array {
  $page=max(1,min(100000,(int)($q['page']??1)));$where=['1=1'];$args=[];
  $search=trim((string)($q['q']??''));if($search!==''){$where[]='u.email LIKE ?';$args[]='%'.addcslashes(mb_strtolower(mb_substr($search,0,120)),'%_\\').'%';}
  $status=(string)($q['status']??'');if(in_array($status,['active','suspended'],true)){$where[]='u.status=?';$args[]=$status;}
  $plan=(string)($q['plan']??'');if($plan==='none')$where[]='u.plan_id IS NULL';elseif(Support::isUuid($plan)){$where[]='u.plan_id=?';$args[]=$plan;}
  $rows=Database::all('SELECT u.id,u.email,u.role,u.status,u.profile,u.plan_id,u.plan_expires_at,u.created_at,u.last_login_at,u.email_verified_at,p.name AS plan_name,
   (SELECT count(*) FROM landing_pages l WHERE l.user_id=u.id) AS landings,(SELECT count(*) FROM landing_pages l WHERE l.user_id=u.id AND l.status=\'published\') AS published,
   (SELECT count(*) FROM orders o WHERE o.user_id=u.id) AS orders
   FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE '.implode(' AND ',$where).' ORDER BY u.created_at DESC LIMIT 31 OFFSET '.(($page-1)*30),$args);
  $next=count($rows)>30;$rows=array_slice($rows,0,30);
  $default=Database::one('SELECT name FROM plans WHERE is_default=1 ORDER BY sort_order LIMIT 1');
  return ['users'=>array_map(fn($u)=>['id'=>$u['id'],'email'=>$u['email'],'name'=>self::name($u),'role'=>$u['role'],'status'=>$u['status'],'plan'=>$u['plan_name'],'plan_expires_at'=>$u['plan_expires_at'],
   'created_at'=>$u['created_at'],'last_login_at'=>$u['last_login_at'],'verified'=>$u['email_verified_at']!==null,'landings'=>(int)$u['landings'],'published'=>(int)$u['published'],'orders'=>(int)$u['orders']],$rows),
   'hasNext'=>$next,'page'=>$page,'default_plan'=>$default['name']??null];
 }
 private static function target(string $id): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Cuenta no encontrada.');
  $u=Database::one('SELECT id,email,role,status,profile,plan_id,plan_expires_at,entitlement_overrides,admin_note,created_at,updated_at,last_login_at,email_verified_at FROM users WHERE id=?',[$id]);
  if(!$u)throw new HttpError(404,'Cuenta no encontrada.');return $u;
 }
 private static function user(string $id): array {
  $u=self::target($id);Entitlements::forget($id);$e=Entitlements::of($id);
  $audit=Database::all('SELECT a.action,a.data,a.created_at,x.email AS actor FROM admin_audit a LEFT JOIN users x ON x.id=a.actor_id WHERE a.target_user_id=? ORDER BY a.created_at DESC LIMIT 20',[$id]);
  return self::catalog()+['user'=>['id'=>$u['id'],'email'=>$u['email'],'name'=>self::name($u),'role'=>$u['role'],'status'=>$u['status'],'plan_id'=>$u['plan_id'],'plan_expires_at'=>$u['plan_expires_at'],
   'overrides'=>Entitlements::clean(json_decode((string)($u['entitlement_overrides']??''),true)),'note'=>(string)($u['admin_note']??''),'created_at'=>$u['created_at'],'last_login_at'=>$u['last_login_at'],'verified'=>$u['email_verified_at']!==null],
   'effective'=>['plan'=>$e['plan'],'features'=>$e['features'],'limits'=>$e['limits']],'usage'=>Entitlements::usage($id),'defaults'=>Entitlements::defaults(),'plans'=>self::plans(),
   'audit'=>array_map(fn($a)=>['action'=>$a['action'],'data'=>json_decode((string)$a['data'],true),'created_at'=>$a['created_at'],'actor'=>$a['actor']],$audit)];
 }
 private static function updateUser(array $actor,string $id,array $b): array {
  $u=self::target($id);$changes=[];$set=[];$args=[];
  if(array_key_exists('status',$b)){
   $status=$b['status'];if(!in_array($status,['active','suspended'],true))throw new HttpError(422,'Estado inválido.');
   if($status==='suspended'&&($u['id']===$actor['id']||$u['role']==='superadmin'))throw new HttpError(422,'No puedes suspender una cuenta de superusuario.');
   if($status!==$u['status']){$set[]='status=?';$args[]=$status;$changes['status']=[$u['status'],$status];
    // Suspending closes the account's open sessions right away.
    if($status==='suspended')$set[]='session_version=session_version+1';}
  }
  if(array_key_exists('plan_id',$b)){
   $plan=$b['plan_id'];if($plan!==null&&(!is_string($plan)||!Support::isUuid($plan)||!Database::one('SELECT id FROM plans WHERE id=?',[$plan])))throw new HttpError(422,'Plan inválido.');
   if($plan!==$u['plan_id']){$set[]='plan_id=?';$args[]=$plan;$changes['plan_id']=[$u['plan_id'],$plan];}
  }
  if(array_key_exists('plan_expires_at',$b)){
   $raw=$b['plan_expires_at'];$at=null;
   if($raw!==null&&$raw!==''){if(!is_string($raw)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$raw)||!checkdate((int)substr($raw,5,2),(int)substr($raw,8,2),(int)substr($raw,0,4)))throw new HttpError(422,'Fecha de vencimiento inválida.');$at=$raw.'T23:59:59-05:00';}
   $old=$u['plan_expires_at']?gmdate('Y-m-d',strtotime((string)$u['plan_expires_at'])-5*3600):null;$new=$at?substr($at,0,10):null;
   if($old!==$new){$set[]='plan_expires_at=?';$args[]=Database::timestamp($at);$changes['plan_expires_at']=[$old,$new];}
  }
  if(array_key_exists('overrides',$b)){
   $o=Entitlements::clean($b['overrides']);$before=Entitlements::clean(json_decode((string)($u['entitlement_overrides']??''),true));
   if($o!=$before){$set[]='entitlement_overrides=?::jsonb';$args[]=$o['features']||$o['limits']?Support::json(['features'=>(object)$o['features'],'limits'=>(object)$o['limits']]):null;$changes['overrides']=[$before,$o];}
  }
  if(array_key_exists('note',$b)){
   $note=is_string($b['note'])?mb_substr(trim($b['note']),0,2000):'';if($note!==(string)($u['admin_note']??'')){$set[]='admin_note=?';$args[]=$note===''?null:$note;$changes['note']=true;}
  }
  if($set){
   $db=Database::connection();$db->beginTransaction();
   try{Database::query('UPDATE users SET '.implode(',',$set).',updated_at=now() WHERE id=?',[...$args,$id]);self::log($actor,$id,'account_updated',$changes);$db->commit();}
   catch(\Throwable $e){$db->rollBack();throw $e;}
  }
  Entitlements::forget($id);return self::user($id);
 }

 private static function saveDefaults(array $actor,array $b): array {
  $before=Entitlements::defaults();$new=Entitlements::clean($b,true);
  if($new!=$before){
   $value=Support::json(['features'=>$new['features'],'limits'=>$new['limits']]);
   $db=Database::connection();$db->beginTransaction();
   try{
    if(Database::one("SELECT setting_key FROM app_settings WHERE setting_key='entitlements' FOR UPDATE"))Database::query("UPDATE app_settings SET value=?::jsonb,updated_at=now() WHERE setting_key='entitlements'",[$value]);
    else Database::query("INSERT INTO app_settings(setting_key,value) VALUES('entitlements',?::jsonb)",[$value]);
    self::log($actor,null,'defaults_updated',['before'=>$before,'after'=>$new]);$db->commit();
   }catch(\Throwable $e){$db->rollBack();throw $e;}
   Entitlements::forget();
  }
  return self::catalog()+['defaults'=>Entitlements::defaults()];
 }

 private static function planView(array $p): array {
  return ['id'=>$p['id'],'name'=>$p['name'],'description'=>$p['description'],'price'=>$p['price']===null?null:(int)$p['price'],'currency'=>$p['currency'],'period'=>$p['period'],
   'highlights'=>json_decode((string)$p['highlights'],true)?:[],'features'=>Entitlements::clean(['features'=>json_decode((string)$p['features'],true)])['features'],
   'limits'=>Entitlements::clean(['limits'=>json_decode((string)$p['limits'],true)])['limits'],'is_default'=>(int)$p['is_default']===1,'active'=>(int)$p['active']===1,'sort_order'=>(int)$p['sort_order'],
   'accounts'=>(int)($p['accounts']??0)];
 }
 private static function plans(): array {
  return array_map([self::class,'planView'],Database::all('SELECT p.*,(SELECT count(*) FROM users u WHERE u.plan_id=p.id) AS accounts FROM plans p ORDER BY p.sort_order,p.name'));
 }
 private static function savePlan(array $actor,?string $id,array $b): array {
  $name=trim((string)($b['name']??''));if($name===''||mb_strlen($name)>80)throw new HttpError(422,'El plan necesita un nombre de hasta 80 caracteres.');
  $description=mb_substr(trim((string)($b['description']??'')),0,1000);
  $price=$b['price']??null;if($price!==null&&(!is_int($price)||$price<0||$price>1000000000))throw new HttpError(422,'Precio inválido. Usa un valor entero en pesos, o déjalo vacío.');
  $currency=strtoupper((string)($b['currency']??'COP'));if(!preg_match('/^[A-Z]{3}$/D',$currency))throw new HttpError(422,'Moneda inválida.');
  $period=(string)($b['period']??'month');if(!in_array($period,self::PERIODS,true))throw new HttpError(422,'Periodo inválido.');
  $highlights=array_values(array_filter(array_map(fn($h)=>is_string($h)?mb_substr(trim($h),0,120):'',is_array($b['highlights']??null)?array_slice($b['highlights'],0,12):[]),fn($h)=>$h!==''));
  $rules=Entitlements::clean(['features'=>$b['features']??[],'limits'=>$b['limits']??[]]);
  $default=($b['is_default']??false)===true;$active=($b['active']??true)!==false;$sort=(int)($b['sort_order']??0);
  if($default&&!$active)throw new HttpError(422,'El plan predeterminado debe estar activo.');
  $values=[$name,$description,$price,$currency,$period,Support::json($highlights),Support::json((object)$rules['features']),Support::json((object)$rules['limits']),$default?1:0,$active?1:0,max(-1000,min(1000,$sort))];
  $db=Database::connection();$db->beginTransaction();
  try{
   $before=null;
   if($id!==null){if(!Support::isUuid($id)||!($before=Database::one('SELECT * FROM plans WHERE id=? FOR UPDATE',[$id])))throw new HttpError(404,'Plan no encontrado.');}
   // Only one default plan: it applies to every account without an assigned plan.
   if($default)Database::query('UPDATE plans SET is_default=0,updated_at=now() WHERE is_default=1'.($id?' AND id<>?':''),$id?[$id]:[]);
   if($id===null){$id=Support::uuid();Database::query('INSERT INTO plans(id,name,description,price,currency,period,highlights,features,limits,is_default,active,sort_order) VALUES(?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?,?)',[$id,...$values]);}
   else Database::query('UPDATE plans SET name=?,description=?,price=?,currency=?,period=?,highlights=?::jsonb,features=?::jsonb,limits=?::jsonb,is_default=?,active=?,sort_order=?,updated_at=now() WHERE id=?',[...$values,$id]);
   $after=Database::one('SELECT * FROM plans WHERE id=?',[$id]);
   self::log($actor,null,$before?'plan_updated':'plan_created',['plan_id'=>$id,'name'=>$name,'before'=>$before?self::planView($before):null,'after'=>self::planView($after)]);
   $db->commit();
  }catch(\Throwable $e){$db->rollBack();throw $e;}
  Entitlements::forget();
  return self::planView(Database::one('SELECT p.*,(SELECT count(*) FROM users u WHERE u.plan_id=p.id) AS accounts FROM plans p WHERE p.id=?',[$id]));
 }
 private static function deletePlan(array $actor,string $id): array {
  if(!Support::isUuid($id)||!($p=Database::one('SELECT * FROM plans WHERE id=?',[$id])))throw new HttpError(404,'Plan no encontrado.');
  $accounts=self::count('SELECT count(*) AS total FROM users WHERE plan_id=?',[$id]);
  if($accounts>0)throw new HttpError(409,'Este plan tiene '.$accounts.' cuenta(s) asignada(s). Cámbialas de plan o desactívalo en lugar de eliminarlo.');
  if((int)$p['is_default']===1)throw new HttpError(409,'Es el plan predeterminado. Marca otro como predeterminado antes de eliminarlo.');
  $db=Database::connection();$db->beginTransaction();
  try{Database::query('DELETE FROM plans WHERE id=?',[$id]);self::log($actor,null,'plan_deleted',['plan_id'=>$id,'name'=>$p['name']]);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}
  Entitlements::forget();return ['ok'=>true];
 }

 private static function audit(array $q): array {
  $page=max(1,min(100000,(int)($q['page']??1)));
  $rows=Database::all('SELECT a.id,a.action,a.data,a.created_at,x.email AS actor,t.email AS target FROM admin_audit a LEFT JOIN users x ON x.id=a.actor_id LEFT JOIN users t ON t.id=a.target_user_id ORDER BY a.created_at DESC LIMIT 41 OFFSET '.(($page-1)*40));
  $next=count($rows)>40;
  return ['entries'=>array_map(fn($a)=>['id'=>$a['id'],'action'=>$a['action'],'data'=>json_decode((string)$a['data'],true),'created_at'=>$a['created_at'],'actor'=>$a['actor'],'target'=>$a['target']],array_slice($rows,0,40)),'hasNext'=>$next,'page'=>$page];
 }
}
