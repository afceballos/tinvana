<?php
declare(strict_types=1);
namespace App;

/**
 * Public Meta webhook (official docs, 2026-10-26):
 * - GET: hub.mode=subscribe + hub.verify_token -> 200 with hub.challenge; otherwise 403. The token is the platform's
 *   WHATSAPP_VERIFY_TOKEN or the verify token of a store that uses its own Meta app.
 * - POST: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret); no valid signature -> 401, nothing stored.
 *   The signer may be the platform app (WHATSAPP_APP_SECRET) or a store's own app. A change is accepted only for an
 *   account the signer may speak for: the platform app for any connected number, a store's app only for that store's
 *   number. Nobody can inject events into another store's number with a valid secret of their own.
 * Each message or status is stored once (dedupe by wamid / wamid+status) and acknowledged before any processing.
 * Meta retries for up to 7 days and warns about duplicates, so storing is idempotent.
 */
final class WhatsAppWebhook {
 public const MAX_BYTES=3145728; // Meta: payloads up to 3 MB.
 private const MAX_NUMBERS=50;

 /** @return array{status:int,body:string} */
 public static function verify(array $q): array {
  // PHP turns the dots of "hub.mode" into underscores in $_GET; accept both spellings.
  $get=fn(string $k)=>is_string($q[$k]??null)?$q[$k]:(is_string($q[str_replace('.','_',$k)]??null)?$q[str_replace('.','_',$k)]:'');
  $token=$get('hub.verify_token');$challenge=$get('hub.challenge');
  if($get('hub.mode')!=='subscribe'||$token===''||strlen($token)>200||!preg_match('/^[A-Za-z0-9_-]{1,128}$/D',$challenge))return ['status'=>403,'body'=>''];
  $platform=Support::env('WHATSAPP_VERIFY_TOKEN');
  $ok=($platform!==''&&hash_equals($platform,$token))||WhatsAppAccount::byVerifyToken($token)!==null;
  return $ok?['status'=>200,'body'=>$challenge]:['status'=>403,'body'=>''];
 }
 private static function signedWith(string $raw,string $signature,string $secret): bool {
  return $secret!==''&&hash_equals(hash_hmac('sha256',$raw,$secret),$signature);
 }
 /** Splits a signed delivery into stored events. @return array{status:int,stored:int,duplicates:int,ignored:int} */
 public static function receive(string $raw,string $signature): array {
  $out=['status'=>200,'stored'=>0,'duplicates'=>0,'ignored'=>0];
  if(strlen($raw)>self::MAX_BYTES)return ['status'=>413]+$out;
  if(!preg_match('/^sha256=([a-f0-9]{64})$/Di',trim($signature),$m))return ['status'=>401]+$out;
  $sig=strtolower($m[1]);$json=json_decode($raw,true);
  $entries=is_array($json)&&($json['object']??'')==='whatsapp_business_account'&&is_array($json['entry']??null)?$json['entry']:[];
  // Accounts named in the delivery (bounded), needed to check signatures of stores that use their own Meta app.
  $accounts=[];
  foreach($entries as $entry)foreach(is_array($entry['changes']??null)?$entry['changes']:[] as $change){
   $id=$change['value']['metadata']['phone_number_id']??null;
   if(is_scalar($id)&&preg_match('/^[0-9]{5,32}$/D',(string)$id)&&!array_key_exists((string)$id,$accounts)&&count($accounts)<self::MAX_NUMBERS)$accounts[(string)$id]=WhatsAppAccount::byPhoneNumberId((string)$id);
  }
  $platform=self::signedWith($raw,$sig,Support::env('WHATSAPP_APP_SECRET'));$own=[];
  foreach($accounts as $a)if($a&&!empty($a['app_secret_ciphertext'])&&self::signedWith($raw,$sig,WhatsAppAccount::appSecret($a)))$own[$a['id']]=true;
  if(!$platform&&!$own)return ['status'=>401]+$out;
  foreach($entries as $entry){
   if(!is_array($entry)||!is_array($entry['changes']??null))continue;$waba=is_scalar($entry['id']??null)?(string)$entry['id']:'';
   foreach($entry['changes'] as $change){
    if(!is_array($change))continue;$value=is_array($change['value']??null)?$change['value']:[];$field=(string)($change['field']??'');
    $phoneId=is_scalar($value['metadata']['phone_number_id']??null)?(string)$value['metadata']['phone_number_id']:'';
    // The owner is the account with this phone_number_id; a different WABA id means it is not this store's number.
    $account=$accounts[$phoneId]??null;if($account&&$waba!==''&&$account['waba_id']!==$waba)$account=null;
    $trusted=$account&&($platform||isset($own[$account['id']]));
    // A store's app may not speak for numbers that are not its own: skip without storing anything.
    if(!$trusted&&!$platform){$out['ignored']++;continue;}
    if(!$trusted)$account=null;
    $items=[];
    if($field==='messages'){
     foreach(is_array($value['messages']??null)?$value['messages']:[] as $msg)if(is_array($msg)&&is_string($msg['id']??null))$items[]=['message','msg:'.$msg['id'],['message'=>$msg,'contacts'=>$value['contacts']??[]]];
     foreach(is_array($value['statuses']??null)?$value['statuses']:[] as $st)if(is_array($st)&&is_string($st['id']??null)&&is_string($st['status']??null))$items[]=['status','st:'.$st['id'].':'.$st['status'],['status'=>$st]];
    }
    if(!$items)$items[]=['other','oth:'.hash('sha256',Support::json($change)),['field'=>$field]];
    foreach($items as [$kind,$key,$data]){
     // Events for numbers that are not connected (or another WABA) are kept only as a dedupe marker, without content.
     $payload=$account?$data+['metadata'=>$value['metadata']??[],'waba_id'=>$waba]:new \stdClass();
     $done=self::store(mb_substr($key,0,255),$kind,$phoneId!==''?mb_substr($phoneId,0,64):null,$account['user_id']??null,$payload,$account?'pending':'ignored');
     if(!$done)$out['duplicates']++;elseif($account)$out['stored']++;else $out['ignored']++;
    }
   }
  }
  return $out;
 }
 private static function store(string $key,string $kind,?string $phoneId,?string $owner,array|\stdClass $payload,string $status): bool {
  if(Database::one('SELECT id FROM whatsapp_events WHERE dedupe_key=?',[$key]))return false;
  try{Database::query('INSERT INTO whatsapp_events(id,dedupe_key,kind,phone_number_id,user_id,payload,status,processed_at) VALUES(?,?,?,?,?,?::jsonb,?,'.($status==='ignored'?'now()':'NULL').')',[Support::uuid(),$key,$kind,$phoneId,$owner,Support::json($payload),$status]);}
  catch(\PDOException $e){
   // A concurrent delivery of the same event won the unique key: that is a duplicate, not an error.
   if(Database::one('SELECT id FROM whatsapp_events WHERE dedupe_key=?',[$key]))return false;throw $e;
  }
  return true;
 }
}
