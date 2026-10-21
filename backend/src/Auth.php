<?php
declare(strict_types=1);
namespace App;
final class Auth {
 public static function start(): void {
  ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.use_trans_sid','0');
  $secure=Support::env('SESSION_SECURE','false')==='true';if(Support::env('APP_ENV')==='production'&&!$secure)throw new \RuntimeException('Las cookies de producción requieren Secure.');
  $same=Support::env('SESSION_SAMESITE','Lax');if(!in_array($same,['Lax','Strict','None'],true)||($same==='None'&&!$secure))throw new \RuntimeException('SameSite inválido.');
  session_name('zenzales_session');session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$secure,'httponly'=>true,'samesite'=>$same]);
  if(!is_dir(dirname(__DIR__).'/storage/sessions'))mkdir(dirname(__DIR__).'/storage/sessions',0700,true);session_save_path(dirname(__DIR__).'/storage/sessions');session_start();
  if(isset($_SESSION['last_active'])&&time()-$_SESSION['last_active']>(int)Support::env('SESSION_LIFETIME','7200')){$_SESSION=[];session_regenerate_id(true);}
  $_SESSION['last_active']=time();$_SESSION['csrf']??=bin2hex(random_bytes(32));
 }
 public static function user(): array { if(empty($_SESSION['user_id']))throw new HttpError(401,'Inicia sesión para continuar.');$u=Database::one('SELECT id,email,role,profile,avatar_id,session_version,email_verified_at FROM users WHERE id=?',[$_SESSION['user_id']]);if(!$u||!$u['email_verified_at'])throw new HttpError(401,'Sesión inválida.');if((int)($_SESSION['session_version']??0)!==(int)$u['session_version']){unset($_SESSION['user_id']);throw new HttpError(401,'La sesion ha terminado.');}$profile=json_decode($u['profile'],true);$u['first_name']=$profile['first_name']??'';$u['last_name']=$profile['last_name']??'';$u['avatar']=$u['avatar_id']?'/api/profile/avatar?v='.$u['avatar_id']:null;unset($u['profile'],$u['avatar_id'],$u['session_version'],$u['email_verified_at']);return $u; }
 public static function csrf(): void { $token=$_SERVER['HTTP_X_CSRF_TOKEN']??$_POST['csrf']??'';if(!is_string($token)||!hash_equals($_SESSION['csrf']??'', $token))throw new HttpError(419,'La sesión del formulario venció. Recarga e intenta nuevamente.'); }
 public static function limit(string $bucket,int $max,int $seconds): void {
  $key=hash('sha256',$bucket);
  $r=Database::one("INSERT INTO rate_limits(bucket,attempts,expires_at) VALUES(?,1,now()+(? * interval '1 second')) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.attempts+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN excluded.expires_at ELSE rate_limits.expires_at END,updated_at=now() RETURNING attempts",[$key,$seconds]);
  if((int)$r['attempts']>$max)throw new HttpError(429,'Demasiados intentos. Espera antes de volver a intentar.');
 }
 public static function login(array $b): array {
  $email=strtolower(Support::text($b['email']??null,254));$pass=$b['password']??null;if(!is_string($pass)||$pass===''||strlen($pass)>72)throw new HttpError(422,'Contraseña inválida (máximo 72 bytes).');
  self::limit('login-ip:'.($_SERVER['REMOTE_ADDR']??''),30,900);self::limit('login-email:'.$email,8,900);
  $u=Database::one('SELECT * FROM users WHERE email=?',[$email]);
  $hash=$u['password_hash']??password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT);
  if(!password_verify($pass,$hash)||!$u||!$u['email_verified_at'])throw new HttpError(401,'Email o contraseña incorrectos.');
  session_regenerate_id(true);$_SESSION['user_id']=$u['id'];$_SESSION['session_version']=(int)$u['session_version'];$_SESSION['csrf']=bin2hex(random_bytes(32));
  if(password_needs_rehash($hash,PASSWORD_DEFAULT))Database::query('UPDATE users SET password_hash=?,updated_at=now() WHERE id=?',[password_hash($pass,PASSWORD_DEFAULT),$u['id']]);
  return ['user'=>self::user(),'csrf'=>$_SESSION['csrf']];
 }
 public static function logout(): void { $_SESSION=[];session_destroy();setcookie(session_name(),'', ['expires'=>time()-3600,'path'=>'/','secure'=>Support::env('SESSION_SECURE')==='true','httponly'=>true,'samesite'=>Support::env('SESSION_SAMESITE','Lax')]); }
}
