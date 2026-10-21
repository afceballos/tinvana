<?php
declare(strict_types=1);
namespace App;
final class AiConnections {
 public const PROVIDERS=['openai'=>'ChatGPT · OpenAI','anthropic'=>'Claude · Anthropic'];
 public static function provider(mixed $provider):string {if(!is_string($provider)||!isset(self::PROVIDERS[$provider]))throw new HttpError(422,'Proveedor de IA no permitido.');return $provider;}
 public static function key(mixed $key):string {$key=Support::text($key,4096);if(!preg_match('/^[\x21-\x7e]{20,4096}$/D',$key))throw new HttpError(422,'Introduce una clave de API válida, sin espacios ni saltos de línea.');return $key;}
 public static function activeProvider(string $owner):?string {$row=Database::one('SELECT settings FROM template_settings WHERE user_id=?',[$owner]);$settings=$row?json_decode($row['settings'],true):[];$provider=$settings['aiProvider']??null;return is_string($provider)&&isset(self::PROVIDERS[$provider])?$provider:null;}
 private static function setActive(string $owner,?string $provider):void {Database::query('INSERT INTO template_settings(user_id,settings) VALUES(?,?::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=template_settings.settings||excluded.settings,updated_at=now()',[$owner,Support::json(['aiProvider'=>$provider])]);}
 public static function view(string $owner):array {
  $rows=Database::all('SELECT provider,verified_at,created_at,updated_at FROM ai_connections WHERE user_id=?',[$owner]);$by=[];foreach($rows as $r)$by[$r['provider']]=$r;$active=self::activeProvider($owner);$connections=[];
  foreach(self::PROVIDERS as $id=>$name){$row=$by[$id]??null;$connections[]=['provider'=>$id,'name'=>$name,'configured'=>$row!==null,'active'=>$row!==null&&$active===$id,'model'=>AiClient::model($id),'verified_at'=>$row['verified_at']??null,'updated_at'=>$row['updated_at']??null];}
  return ['connections'=>$connections,'activeProvider'=>isset($by[$active??''])?$active:null];
 }
 public static function credentials(string $owner):array {
  $provider=self::activeProvider($owner);$row=$provider?Database::one('SELECT key_ciphertext FROM ai_connections WHERE user_id=? AND provider=?',[$owner,$provider]):null;
  if(!$row)throw new HttpError(422,'Configura y selecciona tu conexión de IA en Integraciones de IA antes de generar.');
  return ['provider'=>$provider,'key'=>Crypto::decrypt($row['key_ciphertext'],'ai-key:'.$provider.':'.$owner)];
 }
 public static function save(string $owner,string $provider,array $body):array {
  self::provider($provider);$key=self::key($body['key']??null);$cipher=Crypto::encrypt($key,'ai-key:'.$provider.':'.$owner);$db=Database::connection();$db->beginTransaction();
  try{Database::query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]);Database::query('INSERT INTO ai_connections(user_id,provider,key_ciphertext) VALUES(?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET key_ciphertext=excluded.key_ciphertext,verified_at=null,updated_at=now()',[$owner,$provider,$cipher]);if(!self::activeProvider($owner))self::setActive($owner,$provider);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}
  return self::view($owner);
 }
 public static function activate(string $owner,string $provider):array {
  self::provider($provider);$db=Database::connection();$db->beginTransaction();try{Database::query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]);if(!Database::one('SELECT provider FROM ai_connections WHERE user_id=? AND provider=?',[$owner,$provider]))throw new HttpError(422,'Guarda tu clave de ese proveedor antes de seleccionarlo.');self::setActive($owner,$provider);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}return self::view($owner);
 }
 public static function remove(string $owner,string $provider):array {
  self::provider($provider);$db=Database::connection();$db->beginTransaction();try{Database::query('SELECT id FROM users WHERE id=? FOR UPDATE',[$owner]);Database::query('DELETE FROM ai_connections WHERE user_id=? AND provider=?',[$owner,$provider]);if(self::activeProvider($owner)===$provider)self::setActive($owner,null);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}return self::view($owner);
 }
 public static function test(string $owner,string $provider):array {
  self::provider($provider);$row=Database::one('SELECT key_ciphertext FROM ai_connections WHERE user_id=? AND provider=?',[$owner,$provider]);if(!$row)throw new HttpError(422,'Guarda tu clave antes de probar la conexión.');Auth::limit('ai-test:'.$owner,6,300);
  $key=Crypto::decrypt($row['key_ciphertext'],'ai-key:'.$provider.':'.$owner);AiClient::test($provider,$key);
  $updated=Database::query('UPDATE ai_connections SET verified_at=now() WHERE user_id=? AND provider=? AND key_ciphertext=?',[$owner,$provider,$row['key_ciphertext']]);if($updated->rowCount()!==1)throw new HttpError(409,'La clave cambió durante la prueba. Comprueba nuevamente la conexión actual.');
  return self::view($owner)+['message'=>'El proveedor aceptó la clave y permite consultar el modelo. La generación consume uso de tu cuenta de API.'];
 }
}
