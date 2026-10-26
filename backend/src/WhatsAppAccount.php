<?php
declare(strict_types=1);
namespace App;

/**
 * The store's WhatsApp number (pilot: pasted credentials). One number per user and one user per phone_number_id.
 * The permanent token is encrypted with the account id + owner as context and never returned to the browser.
 * A future Embedded Signup fills the same row with source='embedded_signup'.
 * A number that lives in the store's own Meta app also stores that app's secret (to validate its webhook signatures)
 * and gets its own webhook verify token, so its deliveries are accepted only for this account.
 */
final class WhatsAppAccount {
 public static function ofUser(string $owner): ?array {return Database::one('SELECT * FROM whatsapp_accounts WHERE user_id=?',[$owner]);}
 public static function byPhoneNumberId(string $id): ?array {return Database::one('SELECT * FROM whatsapp_accounts WHERE phone_number_id=?',[$id]);}
 public static function token(array $a): string {return Crypto::decrypt((string)$a['token_ciphertext'],$a['id'].':'.$a['user_id']);}
 public static function appSecret(array $a): string {return empty($a['app_secret_ciphertext'])?'':Crypto::decrypt((string)$a['app_secret_ciphertext'],$a['id'].':'.$a['user_id'].':app-secret');}
 /** The account whose own webhook verify token is this one (GET verification of a store's own Meta app). */
 public static function byVerifyToken(string $token): ?array {return $token===''?null:Database::one('SELECT * FROM whatsapp_accounts WHERE verify_token_hash=?',[hash('sha256',$token)]);}

 /** Platform settings that live in the server .env; only whether they are present is shown. */
 public static function platform(): array {
  $app=rtrim(Support::env('APP_URL'),'/');
  return ['webhook_url'=>$app.'/whatsapp/webhook','verify_token_configured'=>Support::env('WHATSAPP_VERIFY_TOKEN')!=='','app_secret_configured'=>Support::env('WHATSAPP_APP_SECRET')!=='','graph_version'=>Support::env('WHATSAPP_GRAPH_VERSION',WhatsAppGraph::DEFAULT_VERSION)];
 }
 public static function view(string $owner): array {
  $a=self::ofUser($owner);
  return ['account'=>$a?['id'=>$a['id'],'phone_number_id'=>$a['phone_number_id'],'waba_id'=>$a['waba_id'],'display_phone'=>$a['display_phone'],'verified_name'=>$a['verified_name'],'quality_rating'=>$a['quality_rating'],
   'status'=>$a['status'],'last_error'=>$a['last_error'],'last_tested_at'=>$a['last_tested_at'],'source'=>$a['source'],'token_configured'=>true,
   'own_app'=>!empty($a['app_secret_ciphertext']),'verify_token'=>!empty($a['app_secret_ciphertext'])&&!empty($a['verify_token_ciphertext'])?Crypto::decrypt((string)$a['verify_token_ciphertext'],$a['id'].':'.$a['user_id'].':verify'):null]:null,'platform'=>self::platform(),'diagnostics'=>$a?self::diagnostics($owner):null];
 }
 /** What reached this store from Meta, to explain an empty inbox. Counts and dates only, no message contents. */
 private static function diagnostics(string $owner): array {
  $e=Database::one("SELECT MAX(received_at) AS last_event_at,SUM(CASE WHEN status IN ('pending','processing') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM whatsapp_events WHERE user_id=?",[$owner]);
  $err=Database::one("SELECT error FROM whatsapp_events WHERE user_id=? AND status='failed' ORDER BY received_at DESC LIMIT 1",[$owner]);
  $rejected=WhatsAppWebhook::lastRejectedAt();
  return ['last_event_at'=>$e['last_event_at']??null,'pending'=>(int)($e['pending']??0),'failed'=>(int)($e['failed']??0),'last_failure'=>$err['error']??null,
   'signature_rejected_at'=>$rejected!==null&&strtotime($rejected)>time()-7*86400?$rejected:null];
 }
 private static function digits(mixed $v,string $label): string {
  $v=is_string($v)?trim($v):'';if(!preg_match('/^[0-9]{5,32}$/D',$v))throw new HttpError(422,'El '.$label.' debe tener solo números, como aparece en Meta.');return $v;
 }
 private static function tokenInput(mixed $v): string {
  $v=is_string($v)?trim($v):'';if(!preg_match('/^[A-Za-z0-9_\-.|]{40,4096}$/D',$v))throw new HttpError(422,'Pega el token de acceso completo, sin espacios.');return $v;
 }
 private static function secretInput(mixed $v): string {
  $v=is_string($v)?trim($v):'';if(!preg_match('/^[A-Za-z0-9]{16,128}$/D',$v))throw new HttpError(422,'La clave secreta de la app debe ser el texto que muestra Meta en Configuración de la app → Básica, sin espacios.');return $v;
 }
 /** Own-app columns: encrypted app secret plus a verify token generated once (kept while the app secret stays). */
 private static function ownApp(string $id,string $owner,?string $secret,?array $current): array {
  if($secret===null)return [null,null,null];
  $token=!empty($current['verify_token_ciphertext'])?Crypto::decrypt((string)$current['verify_token_ciphertext'],$id.':'.$owner.':verify'):'tv'.bin2hex(random_bytes(20));
  return [Crypto::encrypt($secret,$id.':'.$owner.':app-secret'),hash('sha256',$token),Crypto::encrypt($token,$id.':'.$owner.':verify')];
 }
 /** Save or update the credentials. The token and the app secret are optional on update (keep the stored ones); own_app=false drops the app secret. */
 public static function save(string $owner,array $b): array {
  $phone=self::digits($b['phone_number_id']??null,'Phone Number ID');$waba=self::digits($b['waba_id']??null,'WhatsApp Business Account ID');
  $db=Database::connection();$db->beginTransaction();
  try{
   $current=Database::one('SELECT * FROM whatsapp_accounts WHERE user_id=? FOR UPDATE',[$owner]);
   $other=Database::one('SELECT user_id FROM whatsapp_accounts WHERE phone_number_id=?',[$phone]);
   if($other&&$other['user_id']!==$owner)throw new HttpError(409,'Ese número ya está conectado a otra cuenta de Tinvana.');
   $token=array_key_exists('token',$b)&&$b['token']!==''&&$b['token']!==null?self::tokenInput($b['token']):null;
   $secret=isset($b['app_secret'])&&$b['app_secret']!==''?self::secretInput($b['app_secret']):null;
   if(!$current){
    if($token===null)throw new HttpError(422,'Pega el token de acceso permanente.');
    $id=Support::uuid();
    [$sc,$vh,$vc]=self::ownApp($id,$owner,$secret,null);
    Database::query("INSERT INTO whatsapp_accounts(id,user_id,phone_number_id,waba_id,token_ciphertext,status,app_secret_ciphertext,verify_token_hash,verify_token_ciphertext) VALUES(?,?,?,?,?,'pending',?,?,?)",[$id,$owner,$phone,$waba,Crypto::encrypt($token,$id.':'.$owner),$sc,$vh,$vc]);
   }else{
    $changed=$token!==null||$phone!==$current['phone_number_id']||$waba!==$current['waba_id'];
    Database::query('UPDATE whatsapp_accounts SET phone_number_id=?,waba_id=?,token_ciphertext=?,status=?,last_error=?,updated_at=now() WHERE id=?',
     [$phone,$waba,$token!==null?Crypto::encrypt($token,$current['id'].':'.$owner):$current['token_ciphertext'],$changed?'pending':$current['status'],$changed?null:$current['last_error'],$current['id']]);
    if($secret!==null){[$sc,$vh,$vc]=self::ownApp($current['id'],$owner,$secret,$current);Database::query('UPDATE whatsapp_accounts SET app_secret_ciphertext=?,verify_token_hash=?,verify_token_ciphertext=? WHERE id=?',[$sc,$vh,$vc,$current['id']]);}
    elseif(($b['own_app']??null)===false)Database::query('UPDATE whatsapp_accounts SET app_secret_ciphertext=NULL,verify_token_hash=NULL,verify_token_ciphertext=NULL WHERE id=?',[$current['id']]);
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
