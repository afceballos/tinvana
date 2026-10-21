<?php
declare(strict_types=1);
namespace App;
final class Profile {
 public static function view(string $owner):array {
  $r=Database::one('SELECT id,email,profile,avatar_id,updated_at FROM users WHERE id=?',[$owner]);
  return ['id'=>$r['id'],'email'=>$r['email'],'username'=>$r['email'],'countries'=>array_column(Geography::countries(),'id'),'fields'=>json_decode($r['profile'],true),'avatar'=>$r['avatar_id']?'/api/profile/avatar?v='.$r['avatar_id']:null];
 }
 public static function save(string $owner,array $b):array {
  $allowed=['company_name','first_name','last_name','phone','country','state','city','address','address_details','postal_code','state_code','city_code'];
  if(array_diff(array_keys($b),$allowed))throw new HttpError(422,'Solo puedes modificar los datos de tu perfil. El correo y el acceso son de solo lectura.');
  $fields=[];foreach($allowed as $key){$value=Support::text($b[$key]??'',in_array($key,['state','city'],true)?300:(in_array($key,['address','address_details'],true)?200:100),false);if(preg_match('/[<>\x00-\x1f\x7f]/u',$value))throw new HttpError(422,'Revisa los datos del perfil.');$fields[$key]=$value;}
  if(!$fields['first_name']||!$fields['last_name'])throw new HttpError(422,'Escribe tu nombre y apellido.');
  if($fields['country']!=='')Geography::country($fields['country']);
  if($fields['state_code']!=='')$fields['state']=Geography::region($fields['country'],$fields['state_code'])['name'];
  if($fields['city_code']!=='')$fields['city']=Geography::city($fields['country'],$fields['state_code'],$fields['city_code'])['name'];
  if($fields['phone']!==''){$region=in_array($fields['country'],\libphonenumber\PhoneNumberUtil::getInstance()->getSupportedRegions(),true)?$fields['country']:'CO';$fields['phone']=DeliveryAddress::phone($fields['phone'],$region)['phone'];}
  Database::query('UPDATE users SET profile=?::jsonb,updated_at=now() WHERE id=?',[Support::json($fields),$owner]);return self::view($owner);
 }
 public static function password(string $owner,array $b):array {
  Auth::limit('password-change:'.$owner,5,900);$current=$b['current_password']??null;$next=$b['new_password']??null;$confirm=$b['confirm_password']??null;
  if(!is_string($current)||strlen($current)>72||!is_string($next)||mb_strlen($next)<12||strlen($next)>72||$next!==$confirm)throw new HttpError(422,'Confirma la nueva contraseña: debe tener entre 12 y 72 bytes.');
  $r=Database::one('SELECT password_hash FROM users WHERE id=?',[$owner]);
  if(!password_verify($current,$r['password_hash']))throw new HttpError(422,'La contraseña actual no es correcta.');
  if(password_verify($next,$r['password_hash']))throw new HttpError(422,'Elige una contraseña diferente a la actual.');
  $db=Database::connection();$db->beginTransaction();try{
  $r=Database::one('UPDATE users SET password_hash=?,session_version=session_version+1,updated_at=now() WHERE id=? AND password_hash=? RETURNING session_version',[password_hash($next,PASSWORD_DEFAULT),$owner,$r['password_hash']]);
  if(!$r)throw new HttpError(409,'La contraseña cambió en otra sesión. Inicia sesión nuevamente.');
  Database::query('UPDATE account_tokens SET used_at=now() WHERE user_id=? AND used_at IS NULL',[$owner]);Database::query("UPDATE account_mail SET status='cancelled',payload_ciphertext=null,updated_at=now() WHERE token_id IN (SELECT id FROM account_tokens WHERE user_id=?) AND status IN ('pending','failed')",[$owner]);$db->commit();
  }catch(\Throwable $e){$db->rollBack();throw $e;}
  session_regenerate_id(true);$_SESSION['session_version']=(int)$r['session_version'];$_SESSION['csrf']=bin2hex(random_bytes(32));return ['ok'=>true,'csrf'=>$_SESSION['csrf']];
 }
 public static function avatarPath(string $id):string {return dirname(__DIR__).'/storage/avatars/'.$id.'.webp';}
 public static function photo(string $owner,bool $remove=false):array {
  Auth::limit('avatar:'.$owner,20,3600);$id=null;
  if(!$remove){$f=$_FILES['image']??null;if(!$f||is_array($f['error']??null)||$f['error']!==UPLOAD_ERR_OK||$f['size']>Media::MAX_INPUT||!is_uploaded_file($f['tmp_name']))throw new HttpError(422,'Sube una foto JPEG, PNG o WebP de hasta 8 MB.');
   $id=Support::uuid();$path=self::avatarPath($id);if(!is_dir(dirname($path)))mkdir(dirname($path),0700,true);
   try{Media::optimize($f['tmp_name'],$path);}catch(\Throwable $e){if(is_file($path))unlink($path);throw $e;}
  }
  $db=Database::connection();$db->beginTransaction();try{$old=Database::one('SELECT avatar_id FROM users WHERE id=? FOR UPDATE',[$owner]);Database::query('UPDATE users SET avatar_id=?,updated_at=now() WHERE id=?',[$id,$owner]);$db->commit();}catch(\Throwable $e){$db->rollBack();if($id&&is_file(self::avatarPath($id)))unlink(self::avatarPath($id));throw $e;}
  if($old['avatar_id']&&is_file(self::avatarPath($old['avatar_id'])))unlink(self::avatarPath($old['avatar_id']));return self::view($owner);
 }
}
