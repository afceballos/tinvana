<?php
declare(strict_types=1);
namespace App;

/**
 * What each account may use. Three layers, the most specific wins:
 * global defaults (app_settings 'entitlements') <- the account's plan <- per-account overrides.
 * A missing key inherits from the layer below; a limit of null means unlimited. Superadmins always get everything.
 * Every check runs on the server; the panel only hides what the server would refuse anyway.
 */
final class Entitlements {
 public const FEATURES=[
  'catalog'=>'Explorar y seleccionar productos de Dropi',
  'landings'=>'Crear y editar landings',
  'publish'=>'Publicar landings',
  'ai'=>'Generar landings con IA',
  'orders'=>'Gestionar pedidos',
  'dropi_orders'=>'Enviar pedidos a Dropi y seguimiento',
  'dropi_shipping'=>'Calcular envío con Dropi en landings',
  'ghl'=>'Conexión GHL (webhooks)',
  'mail'=>'Correos de pedidos',
  'store'=>'Tienda con subdominio propio',
 ];
 public const LIMITS=[
  'landings'=>'Landings creadas',
  'published_landings'=>'Landings publicadas a la vez',
  'products'=>'Productos seleccionados',
  'integrations'=>'Integraciones Dropi',
 ];
 private static array $cache=[];

 /** Keeps only known keys: features as booleans, limits as non-negative integers or null (unlimited). */
 public static function clean(mixed $value,bool $complete=false): array {
  $v=is_array($value)?$value:[];$features=[];$limits=[];
  foreach(self::FEATURES as $k=>$_){$f=$v['features'][$k]??null;if(is_bool($f))$features[$k]=$f;elseif($complete)$features[$k]=true;}
  foreach(self::LIMITS as $k=>$_){
   if(!is_array($v['limits']??null)||!array_key_exists($k,$v['limits'])){if($complete)$limits[$k]=null;continue;}
   $l=$v['limits'][$k];if($l===null){$limits[$k]=null;continue;}
   if(!is_int($l)||$l<0||$l>100000)throw new HttpError(422,'Límite inválido para «'.self::LIMITS[$k].'». Usa un número entre 0 y 100000, o deja ilimitado.');
   $limits[$k]=$l;
  }
  return ['features'=>$features,'limits'=>$limits];
 }
 public static function defaults(): array {
  $row=Database::one("SELECT value FROM app_settings WHERE setting_key='entitlements'");
  return self::clean($row?json_decode((string)$row['value'],true):[],true);
 }
 /** The plan in force: the assigned one while not expired, otherwise the default plan (if any). */
 public static function planOf(array $user): ?array {
  $plan=null;
  if(!empty($user['plan_id'])&&(empty($user['plan_expires_at'])||strtotime((string)$user['plan_expires_at'])>time()))$plan=Database::one('SELECT * FROM plans WHERE id=?',[$user['plan_id']]);
  return $plan??Database::one('SELECT * FROM plans WHERE is_default=1 ORDER BY sort_order LIMIT 1');
 }
 /** @return array{features:array<string,bool>,limits:array<string,int|null>,plan:array|null,superadmin:bool} */
 public static function of(string $owner): array {
  if(isset(self::$cache[$owner]))return self::$cache[$owner];
  $u=Database::one('SELECT id,role,plan_id,plan_expires_at,entitlement_overrides FROM users WHERE id=?',[$owner]);
  if(!$u)throw new HttpError(404,'Cuenta no encontrada.');
  $all=self::defaults();$plan=null;
  if($u['role']==='superadmin'){$all['features']=array_fill_keys(array_keys(self::FEATURES),true);$all['limits']=array_fill_keys(array_keys(self::LIMITS),null);}
  else{
   $plan=self::planOf($u);
   foreach([$plan?['features'=>json_decode((string)$plan['features'],true),'limits'=>json_decode((string)$plan['limits'],true)]:[],json_decode((string)($u['entitlement_overrides']??''),true)] as $layer){
    $layer=self::clean($layer);$all['features']=array_replace($all['features'],$layer['features']);$all['limits']=array_replace($all['limits'],$layer['limits']);
   }
  }
  return self::$cache[$owner]=$all+['plan'=>$plan?['id'=>$plan['id'],'name'=>$plan['name']]:null,'superadmin'=>$u['role']==='superadmin'];
 }
 public static function forget(?string $owner=null): void {if($owner===null)self::$cache=[];else unset(self::$cache[$owner]);}
 public static function allows(string $owner,string $feature): bool {return (self::of($owner)['features'][$feature]??false)===true;}
 public static function require(string $owner,string $feature): void {
  if(!self::allows($owner,$feature))throw new HttpError(403,'Tu plan no incluye «'.(self::FEATURES[$feature]??$feature).'». Escríbenos si quieres activarlo.');
 }
 public static function usage(string $owner): array {
  $n=fn(string $sql)=>(int)(Database::one($sql,[$owner])['total']??0);
  return ['landings'=>$n('SELECT count(*) AS total FROM landing_pages WHERE user_id=?'),'published_landings'=>$n("SELECT count(*) AS total FROM landing_pages WHERE user_id=? AND status='published'"),
   'products'=>$n('SELECT count(*) AS total FROM selected_products WHERE user_id=?'),'integrations'=>$n('SELECT count(*) AS total FROM integrations WHERE user_id=?')];
 }
 /** Refuses one more unit of $limit when the account already reached it. */
 public static function ensureRoom(string $owner,string $limit): void {
  $max=self::of($owner)['limits'][$limit]??null;if($max===null)return;
  $used=self::usage($owner)[$limit];
  if($used>=$max)throw new HttpError(403,'Alcanzaste el límite de tu plan: '.$max.' '.mb_strtolower(self::LIMITS[$limit]).'. Escríbenos si necesitas más.');
 }
 /** Shape sent to the panel with the session. */
 public static function view(string $owner): array {
  $e=self::of($owner);return ['plan'=>$e['plan'],'features'=>$e['features'],'limits'=>$e['limits'],'usage'=>self::usage($owner)];
 }
}
