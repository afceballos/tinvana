<?php
declare(strict_types=1);
namespace App;
require __DIR__.'/account-config.php';
$_ENV['MAIL_TRANSPORT']='resend';$_ENV['RESEND_API_KEY']='synthetic-test-api-key';$_ENV['HTTP_CA_BUNDLE']='';$status=200;
function ensure(bool $value):void {if(!$value)throw new \RuntimeException('Resend transport assertion failed.');}
function curl_init(string $url):object {ensure($url==='https://api.resend.com/emails');return (object)['options'=>[]];}
function curl_setopt_array(object $curl,array $options):bool {$curl->options=$options;return true;}
function curl_exec(object $curl):string {
 $o=$curl->options;ensure($o[CURLOPT_SSL_VERIFYPEER]===true&&$o[CURLOPT_SSL_VERIFYHOST]===2&&$o[CURLOPT_FOLLOWLOCATION]===false&&$o[CURLOPT_TIMEOUT]<=20);$data=json_decode($o[CURLOPT_POSTFIELDS],true,512,JSON_THROW_ON_ERROR);ensure($data['from']==='Zenzales <no-reply@example.test>'&&$data['to']===['recipient@example.test']);ensure(str_contains($data['html'],'/brand/logo-white.png')&&!str_contains($data['html'],'cid:'));ensure(str_contains($data['html'],'#token=synthetic-token')&&str_contains($data['text'],'30 minutos'));ensure(in_array('Idempotency-Key: account-mail-fixed-mail-id',$o[CURLOPT_HTTPHEADER],true));return $GLOBALS['status']===200?'{"id":"provider-message-id"}':'{"message":"synthetic-test-api-key"}';
}
function curl_getinfo(object $curl,int $option):int {return $GLOBALS['status'];}
function curl_close(object $curl):void {}
ensure(AccountMail::configured());AccountMail::send('recipient@example.test','reset','http://127.0.0.1:8084/restablecer-contrasena#token=synthetic-token','fixed-mail-id');
$status=401;try{AccountMail::send('recipient@example.test','reset','http://127.0.0.1:8084/restablecer-contrasena#token=synthetic-token','fixed-mail-id');throw new \LogicException('Expected failure.');}catch(\RuntimeException $e){ensure(!str_contains($e->getMessage(),'synthetic-test-api-key'));}
echo "PASS Resend fixed URL, TLS verification, timeouts, schema, branded logo, idempotency and secret-safe error handling. Test transport only; no provider contacted.\n";
