<?php
declare(strict_types=1);
namespace App;
final class AccountRecovery {
 const MESSAGE='Si el correo permite esta operación, recibirás un enlace. Revisa también la carpeta de spam.';
 public static function email(array $b):string {$email=strtolower(Support::text($b['email']??null,254));if(!filter_var($email,FILTER_VALIDATE_EMAIL))throw new HttpError(422,'Escribe un correo válido.');return $email;}
 public static function password(array $b):string {$p=$b['password']??null;if(!is_string($p)||mb_strlen($p)<12||strlen($p)>72||$p!==($b['confirm_password']??null))throw new HttpError(422,'Confirma una contraseña de al menos 12 caracteres y máximo 72 bytes.');return $p;}
 public static function request(string $purpose,array $b,bool $register=false):array {
  AccountMail::ready();$email=self::email($b);Auth::limit('account-mail-ip:'.($_SERVER['REMOTE_ADDR']??''),15,3600);Auth::limit('account-mail:'.$purpose.':'.$email,3,3600);
  $profile=null;if($register){$first=Support::text($b['first_name']??null,100);$last=Support::text($b['last_name']??null,100);if(preg_match('/[<>\x00-\x1f]/u',$first.$last))throw new HttpError(422,'Revisa tu nombre y apellido.');$company=Support::text($b['company_name']??'',100,false);if(preg_match('/[<>\x00-\x1f\x7f]/u',$company))throw new HttpError(422,'Revisa el nombre de la empresa.');$profile=['first_name'=>$first,'last_name'=>$last,'company_name'=>$company];}
  $db=Database::connection();$db->beginTransaction();try{
   if($register)Database::query("INSERT INTO users(id,email,password_hash,role,profile) VALUES(?,?,?,'user',?::jsonb) ON CONFLICT(email) DO NOTHING",[Support::uuid(),$email,password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT),Support::json($profile)]);
   $u=Database::one('SELECT id,email_verified_at FROM users WHERE email=? FOR UPDATE',[$email]);
   if($u&&(($purpose==='verify'&&!$u['email_verified_at'])||($purpose==='reset'&&$u['email_verified_at']))){
    Database::query("UPDATE account_tokens SET used_at=now() WHERE user_id=? AND purpose=? AND used_at IS NULL",[$u['id'],$purpose]);Database::query("UPDATE account_mail SET status='cancelled',payload_ciphertext=null,updated_at=now() WHERE token_id IN (SELECT id FROM account_tokens WHERE user_id=? AND purpose=?) AND status IN ('pending','failed')",[$u['id'],$purpose]);
    $token=bin2hex(random_bytes(32));$id=Support::uuid();$mail=Support::uuid();$seconds=$purpose==='verify'?86400:1800;$base=rtrim(Support::env('APP_URL'),'/');if(!Support::url($base)||(Support::env('APP_ENV')==='production'&&parse_url($base,PHP_URL_SCHEME)!=='https'))throw new HttpError(503,'Configura un dominio HTTPS para los enlaces de cuenta.');$url=$base.($purpose==='verify'?'/verificar-correo':'/restablecer-contrasena').'#token='.$token;
    Database::query("INSERT INTO account_tokens(id,user_id,purpose,token_hash,expires_at) VALUES(?,?,?,?,now()+(? * interval '1 second'))",[$id,$u['id'],$purpose,hash('sha256',$token),$seconds]);Database::query('INSERT INTO account_mail(id,token_id,payload_ciphertext) VALUES(?,?,?)',[$mail,$id,Crypto::encrypt(Support::json(['url'=>$url]),'account-mail:'.$mail)]);
   }$db->commit();
  }catch(\Throwable $e){$db->rollBack();throw $e;}
  return ['message'=>self::MESSAGE];
 }
 public static function complete(string $purpose,array $b):array {
  Auth::limit('account-token-ip:'.($_SERVER['REMOTE_ADDR']??''),30,900);$token=$b['token']??'';if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))throw new HttpError(422,'El enlace no es válido o ha vencido. Solicita uno nuevo.');$password=self::password($b);$db=Database::connection();$db->beginTransaction();try{
   // Always lock user before token, matching link requests to avoid deadlocks.
   $found=Database::one('SELECT user_id FROM account_tokens WHERE token_hash=? AND purpose=?',[hash('sha256',$token),$purpose]);if(!$found)throw new HttpError(422,'El enlace no es válido o ha vencido. Solicita uno nuevo.');
   $user=Database::one('SELECT id,email_verified_at FROM users WHERE id=? FOR UPDATE',[$found['user_id']]);$r=Database::one('SELECT * FROM account_tokens WHERE token_hash=? AND purpose=? FOR UPDATE',[hash('sha256',$token),$purpose]);
   if(!$r||$r['used_at']||strtotime($r['expires_at'])<=time()||($purpose==='verify'&&$user['email_verified_at'])||($purpose==='reset'&&!$user['email_verified_at']))throw new HttpError(422,'El enlace no es válido o ha vencido. Solicita uno nuevo.');
   Database::query('UPDATE users SET password_hash=?,email_verified_at=COALESCE(email_verified_at,now()),session_version=session_version+1,updated_at=now() WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$user['id']]);Database::query('UPDATE account_tokens SET used_at=now() WHERE user_id=? AND used_at IS NULL',[$user['id']]);Database::query("UPDATE account_mail SET status='cancelled',payload_ciphertext=null,updated_at=now() WHERE token_id IN (SELECT id FROM account_tokens WHERE user_id=?) AND status IN ('pending','failed')",[$user['id']]);$db->commit();
  }catch(\Throwable $e){$db->rollBack();throw $e;}
  return ['ok'=>true,'message'=>$purpose==='verify'?'Correo verificado. Ya puedes iniciar sesión.':'Contraseña restablecida. Inicia sesión con tu nueva contraseña.'];
 }
}
