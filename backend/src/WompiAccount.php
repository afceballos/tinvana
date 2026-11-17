<?php
declare(strict_types=1);
namespace App;

/**
 * Wompi payments, phase 1: the store's own Wompi account (one per store) and its signed events.
 * The private key and the events and integrity secrets are encrypted with the account id + owner as context and never
 * return to the browser. Each store gets its own events URL (/wompi/events/<token>), so an event is checked only
 * against that store's events secret. Events are stored once per transaction and status; phase 2 acts on them.
 */
final class WompiAccount {
 public const MAX_EVENT_BYTES=65536;
 private const FIELDS=['public_key'=>0,'private_key'=>1,'events_secret'=>2,'integrity_secret'=>3];
 private const LABELS=['public_key'=>'llave pública','private_key'=>'llave privada','events_secret'=>'secreto de eventos','integrity_secret'=>'secreto de integridad'];
 private const TEST_AMOUNT=1000000;

 public static function ofUser(string $owner): ?array {return Database::one('SELECT * FROM wompi_accounts WHERE user_id=?',[$owner]);}
 private static function secret(array $a,string $field): string {return Crypto::decrypt((string)$a[$field.'_ciphertext'],$a['id'].':'.$a['user_id'].':'.$field);}
 public static function privateKey(array $a): string {return self::secret($a,'private_key');}
 public static function eventsSecret(array $a): string {return self::secret($a,'events_secret');}
 public static function integritySecret(array $a): string {return self::secret($a,'integrity_secret');}
 private static function eventsToken(array $a): string {return self::secret($a,'events_token');}
 public static function eventsUrl(array $a): string {return rtrim(Support::env('APP_URL'),'/').'/wompi/events/'.self::eventsToken($a);}

 public static function view(string $owner): array {
  $a=self::ofUser($owner);if(!$a)return ['account'=>null,'events'=>[]];
  // The integrity secret is proven by any event of a checkout Tinbana signed (references start with «tb-»).
  $signed=Database::one("SELECT received_at FROM wompi_events WHERE user_id=? AND reference LIKE 'tb-%' ORDER BY received_at DESC LIMIT 1",[$owner]);
  $events=Database::all('SELECT event_type,transaction_id,reference,status,amount_in_cents,payment_method,received_at FROM wompi_events WHERE user_id=? ORDER BY received_at DESC LIMIT 5',[$owner]);
  return ['account'=>['environment'=>$a['environment'],'public_key'=>$a['public_key'],'merchant_name'=>$a['merchant_name'],'payment_methods'=>json_decode((string)($a['payment_methods']??'[]'),true)?:[],
   'status'=>$a['status'],'last_error'=>$a['last_error'],'last_tested_at'=>$a['last_tested_at'],'last_event_at'=>$a['last_event_at'],'last_rejected_at'=>$a['last_rejected_at'],
   'integrity_checked_at'=>$signed['received_at']??null,'events_url'=>self::eventsUrl($a)],
   'events'=>array_map(fn($e)=>['type'=>$e['event_type'],'transaction_id'=>$e['transaction_id'],'reference'=>$e['reference'],'status'=>$e['status'],'amount'=>$e['amount_in_cents']===null?null:(int)$e['amount_in_cents']/100,'payment_method'=>$e['payment_method'],'received_at'=>$e['received_at']],$events)];
 }

 private static function key(mixed $v,string $field): string {
  $v=is_string($v)?trim($v):'';$prefix=['public_key'=>'pub_(test|prod)_','private_key'=>'prv_(test|prod)_','events_secret'=>'(test|prod)_events_','integrity_secret'=>'(test|prod)_integrity_'][$field];
  if(!preg_match('/^'.$prefix.'[A-Za-z0-9_-]{8,120}$/D',$v))throw new HttpError(422,'La '.self::LABELS[$field].' no tiene el formato de Wompi. Cópiala completa desde Desarrolladores, sin espacios.');
  return $v;
 }

 /** Saves the four keys (the three secret ones may stay empty on update to keep the stored ones) and tests them. */
 public static function save(string $owner,array $b): array {
  if(array_diff(array_keys($b),array_keys(self::FIELDS)))throw new HttpError(422,'Campo de Wompi desconocido.');
  $current=self::ofUser($owner);$keys=[];
  foreach(self::FIELDS as $field=>$_){
   $given=is_string($b[$field]??null)?trim($b[$field]):'';
   if($given===''&&$current&&$field!=='public_key'){$keys[$field]=self::secret($current,$field);continue;}
   if($given==='')throw new HttpError(422,'Falta la '.self::LABELS[$field].'.');
   $keys[$field]=self::key($given,$field);
  }
  $env=Wompi::environment($keys['public_key'],$keys['private_key'],$keys['events_secret'],$keys['integrity_secret']);
  if($env===null)throw new HttpError(422,'Las cuatro llaves deben ser del mismo ambiente: todas de prueba (test) o todas de producción (prod). Si cambias de ambiente, pega de nuevo las cuatro.');
  $id=$current['id']??Support::uuid();
  $token=$current?self::eventsToken($current):'we'.bin2hex(random_bytes(20));
  $enc=fn(string $field,string $value)=>Crypto::encrypt($value,$id.':'.$owner.':'.$field);
  $values=[$env,$keys['public_key'],$enc('private_key',$keys['private_key']),$enc('events_secret',$keys['events_secret']),$enc('integrity_secret',$keys['integrity_secret'])];
  if($current)Database::query("UPDATE wompi_accounts SET environment=?,public_key=?,private_key_ciphertext=?,events_secret_ciphertext=?,integrity_secret_ciphertext=?,status='pending',last_error=NULL,updated_at=now() WHERE id=?",[...$values,$id]);
  else Database::query('INSERT INTO wompi_accounts(id,user_id,environment,public_key,private_key_ciphertext,events_secret_ciphertext,integrity_secret_ciphertext,events_token_hash,events_token_ciphertext) VALUES(?,?,?,?,?,?,?,?,?)',[$id,$owner,...$values,hash('sha256',$token),$enc('events_token',$token)]);
  return self::test($owner);
 }

 /**
  * Read-only checks: the merchant behind the public key (name and payment methods) and a transaction search with the
  * private key (200 with a valid key, 401 otherwise). The events and integrity secrets are proven by the first event.
  */
 public static function test(string $owner): array {
  $a=self::ofUser($owner);if(!$a)throw new HttpError(404,'Primero conecta tu cuenta de Wompi.');$base=Wompi::base((string)$a['environment']);$error=null;$name=null;$methods=[];
  [$s,$m]=Wompi::request($base,'GET','/merchants/'.rawurlencode((string)$a['public_key']));
  if($s===200&&is_array($m['data']??null)){$name=is_string($m['data']['name']??null)?mb_substr($m['data']['name'],0,200):null;foreach((array)($m['data']['accepted_payment_methods']??[]) as $x)if(is_string($x))$methods[]=$x;}
  elseif($s===0)$error='Wompi no respondió. Intenta de nuevo en unos minutos.';
  else $error='Wompi no reconoce la llave pública en el ambiente de '.($a['environment']==='prod'?'producción':'pruebas').'.';
  if($error===null){
   [$s]=Wompi::request($base,'GET','/transactions?reference='.rawurlencode('tb-check-'.bin2hex(random_bytes(6))),self::privateKey($a));
   if($s===401||$s===403)$error='Wompi rechazó la llave privada. Revisa que sea la de la misma cuenta y del mismo ambiente.';
   elseif($s!==200)$error='Wompi no respondió al comprobar la llave privada (HTTP '.$s.'). Intenta de nuevo.';
  }
  Database::query('UPDATE wompi_accounts SET status=?,last_error=?,merchant_name=COALESCE(?,merchant_name),payment_methods=?,last_tested_at=now(),updated_at=now() WHERE id=?',[$error===null?'connected':'error',$error,$name,Support::json($methods),$a['id']]);
  return self::view($owner)+['message'=>$error===null?'Conexión con Wompi comprobada'.($name?' · '.$name:'').'.':$error];
 }

 public static function delete(string $owner): array {
  Database::query('DELETE FROM wompi_accounts WHERE user_id=?',[$owner]);return self::view($owner)+['message'=>'Cuenta de Wompi desconectada de Tinbana. En Wompi tu cuenta sigue igual.'];
 }

 /** Test environment only: a signed Web Checkout of $10.000 that proves the integrity secret and, once paid, the events URL. */
 public static function testPayment(string $owner): array {
  $a=self::ofUser($owner);if(!$a)throw new HttpError(404,'Primero conecta tu cuenta de Wompi.');
  if($a['environment']!=='test')throw new HttpError(409,'El pago de prueba solo existe con las llaves de prueba (sandbox). En producción sería un cobro real.');
  if($a['status']!=='connected')throw new HttpError(409,'Prueba la conexión antes de hacer un pago de prueba.');
  $reference='tb-test-'.bin2hex(random_bytes(8));
  $back=Wompi::redirectUrl('/panel/wompi?pago=prueba');
  return ['url'=>Wompi::checkoutUrl((string)$a['public_key'],$reference,self::TEST_AMOUNT,self::integritySecret($a),$back?['redirect-url'=>$back]:[]),'reference'=>$reference,'amount'=>self::TEST_AMOUNT/100];
 }

 /**
  * Signed event from Wompi to this store's URL. 404 for an unknown URL, 401 for a wrong checksum (Wompi retries, so a
  * corrected secret still receives it), 200 once stored or already stored. Only valid events are kept.
  */
 public static function receive(string $token,string $raw,string $header): array {
  $a=preg_match('/^we[a-f0-9]{40}$/D',$token)?Database::one('SELECT * FROM wompi_accounts WHERE events_token_hash=?',[hash('sha256',$token)]):null;
  if(!$a)return ['status'=>404];
  if(strlen($raw)>self::MAX_EVENT_BYTES)return ['status'=>413];
  $event=json_decode($raw,true);if(!is_array($event)||!is_string($event['event']??null))return ['status'=>400];
  if(!Wompi::eventValid($event,self::eventsSecret($a),$header!==''?$header:null)){Database::query('UPDATE wompi_accounts SET last_rejected_at=now() WHERE id=?',[$a['id']]);return ['status'=>401];}
  $env=($event['environment']??'')==='prod'?'prod':'test';
  // A valid event of the other environment (keys changed meanwhile) is acknowledged and not kept.
  if($env!==$a['environment'])return ['status'=>200,'stored'=>false];
  $t=is_array($event['data']['transaction']??null)?$event['data']['transaction']:[];$str=fn($v,int $max)=>is_scalar($v)?mb_substr((string)$v,0,$max):null;
  Database::query('INSERT INTO wompi_events(id,user_id,event_type,environment,transaction_id,reference,status,amount_in_cents,payment_method,payload) VALUES(?,?,?,?,?,?,?,?,?,?::jsonb) ON CONFLICT(user_id,transaction_id,status) DO NOTHING',
   [Support::uuid(),$a['user_id'],mb_substr($event['event'],0,60),$env,$str($t['id']??null,80),$str($t['reference']??null,120),$str($t['status']??null,20),is_numeric($t['amount_in_cents']??null)?(int)$t['amount_in_cents']:null,$str($t['payment_method_type']??null,40),Support::json($event)]);
  Database::query('UPDATE wompi_accounts SET last_event_at=now() WHERE id=?',[$a['id']]);
  return ['status'=>200,'stored'=>true];
 }
}
