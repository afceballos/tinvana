<?php
declare(strict_types=1);
namespace App;

/**
 * The store's WhatsApp number (pilot: pasted credentials). One number per user and one user per phone_number_id.
 * The permanent token is encrypted with the account id + owner as context and never returned to the browser.
 * A future Embedded Signup fills the same row with source='embedded_signup'.
 */
final class WhatsAppAccount {
 public static function ofUser(string $owner): ?array {return Database::one('SELECT * FROM whatsapp_accounts WHERE user_id=?',[$owner]);}
 public static function byPhoneNumberId(string $id): ?array {return Database::one('SELECT * FROM whatsapp_accounts WHERE phone_number_id=?',[$id]);}
 public static function token(array $a): string {return Crypto::decrypt((string)$a['token_ciphertext'],$a['id'].':'.$a['user_id']);}

 /** Platform settings that live in the server .env; only whether they are present is shown. */
 public static function platform(): array {
  $app=rtrim(Support::env('APP_URL'),'/');
  return ['webhook_url'=>$app.'/whatsapp/webhook','verify_token_configured'=>Support::env('WHATSAPP_VERIFY_TOKEN')!=='','app_secret_configured'=>Support::env('WHATSAPP_APP_SECRET')!=='','graph_version'=>Support::env('WHATSAPP_GRAPH_VERSION',WhatsAppGraph::DEFAULT_VERSION)];
 }
 public static function view(string $owner): array {
  $a=self::ofUser($owner);
  return ['account'=>$a?['id'=>$a['id'],'phone_number_id'=>$a['phone_number_id'],'waba_id'=>$a['waba_id'],'display_phone'=>$a['display_phone'],'verified_name'=>$a['verified_name'],'quality_rating'=>$a['quality_rating'],
   'status'=>$a['status'],'last_error'=>$a['last_error'],'last_tested_at'=>$a['last_tested_at'],'source'=>$a['source'],'token_configured'=>true]:null,'platform'=>self::platform()];
 }
 private static function digits(mixed $v,string $label): string {
  $v=is_string($v)?trim($v):'';if(!preg_match('/^[0-9]{5,32}$/D',$v))throw new HttpError(422,'El '.$label.' debe tener solo números, como aparece en Meta.');return $v;
 }
 private static function tokenInput(mixed $v): string {
  $v=is_string($v)?trim($v):'';if(!preg_match('/^[A-Za-z0-9_\-.|]{40,4096}$/D',$v))throw new HttpError(422,'Pega el token de acceso completo, sin espacios.');return $v;
 }
 /** Save or update the credentials. The token is optional on update (keeps the stored one). */
 public static function save(string $owner,array $b): array {
  $phone=self::digits($b['phone_number_id']??null,'Phone Number ID');$waba=self::digits($b['waba_id']??null,'WhatsApp Business Account ID');
  $db=Database::connection();$db->beginTransaction();
  try{
   $current=Database::one('SELECT * FROM whatsapp_accounts WHERE user_id=? FOR UPDATE',[$owner]);
   $other=Database::one('SELECT user_id FROM whatsapp_accounts WHERE phone_number_id=?',[$phone]);
   if($other&&$other['user_id']!==$owner)throw new HttpError(409,'Ese número ya está conectado a otra cuenta de Tinvana.');
   $token=array_key_exists('token',$b)&&$b['token']!==''&&$b['token']!==null?self::tokenInput($b['token']):null;
   if(!$current){
    if($token===null)throw new HttpError(422,'Pega el token de acceso permanente.');
    $id=Support::uuid();
    Database::query("INSERT INTO whatsapp_accounts(id,user_id,phone_number_id,waba_id,token_ciphertext,status) VALUES(?,?,?,?,?,'pending')",[$id,$owner,$phone,$waba,Crypto::encrypt($token,$id.':'.$owner)]);
   }else{
    $changed=$token!==null||$phone!==$current['phone_number_id']||$waba!==$current['waba_id'];
    Database::query('UPDATE whatsapp_accounts SET phone_number_id=?,waba_id=?,token_ciphertext=?,status=?,last_error=?,updated_at=now() WHERE id=?',
     [$phone,$waba,$token!==null?Crypto::encrypt($token,$current['id'].':'.$owner):$current['token_ciphertext'],$changed?'pending':$current['status'],$changed?null:$current['last_error'],$current['id']]);
   }
   $db->commit();
  }catch(\Throwable $e){$db->rollBack();throw $e;}
  return self::view($owner);
 }
 /** Read-only check against Meta: the number, its verified name and quality. Sends no message. */
 public static function test(string $owner): array {
  $a=self::ofUser($owner);if(!$a)throw new HttpError(404,'Primero guarda las credenciales del número.');
  try{$info=WhatsAppGraph::phone($a['phone_number_id'],self::token($a));}
  catch(HttpError $e){Database::query("UPDATE whatsapp_accounts SET status='error',last_error=?,last_tested_at=now(),updated_at=now() WHERE id=?",[$e->getMessage(),$a['id']]);throw $e;}
  Database::query("UPDATE whatsapp_accounts SET status='connected',display_phone=?,verified_name=?,quality_rating=?,last_error=NULL,last_tested_at=now(),updated_at=now() WHERE id=?",
   [$info['display_phone'],$info['verified_name'],$info['quality_rating'],$a['id']]);
  return self::view($owner)+['message'=>'Meta respondió correctamente: '.$info['display_phone'].($info['verified_name']!==''?' · '.$info['verified_name']:'').'.'];
 }
 /** Removes the number and, through the foreign keys, its conversations and messages. */
 public static function remove(string $owner): array {
  Database::query('DELETE FROM whatsapp_accounts WHERE user_id=?',[$owner]);return self::view($owner);
 }
}
