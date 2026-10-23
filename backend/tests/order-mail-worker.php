<?php
declare(strict_types=1);
namespace App;
// Runs the order mail worker on the queue left by tests/order-mail.mjs with an intercepted Resend transport.
// No provider is contacted; the isolated local database is the only state touched.
require __DIR__.'/account-config.php';
$_ENV['MAIL_TRANSPORT']='resend';$_ENV['RESEND_API_KEY']='synthetic-test-api-key';$_ENV['HTTP_CA_BUNDLE']='';$_ENV['APP_URL']='https://tinbana.example';
$GLOBALS['sent']=[];$GLOBALS['status']=200;$passed=0;
function check(string $name,bool $ok):void {global $passed;if(!$ok)throw new \RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
function curl_init(string $url):object {if($url!=='https://api.resend.com/emails')throw new \RuntimeException('Unexpected URL');return (object)['options'=>[]];}
function curl_setopt_array(object $curl,array $options):bool {$curl->options=$options;return true;}
function curl_exec(object $curl):string {$GLOBALS['sent'][]=['data'=>json_decode($curl->options[CURLOPT_POSTFIELDS],true),'headers'=>$curl->options[CURLOPT_HTTPHEADER]];return $GLOBALS['status']===200?'{"id":"provider-message-id"}':'{"message":"synthetic-test-api-key down"}';}
function curl_getinfo(object $curl,int $option):int {return $GLOBALS['status'];}
function curl_close(object $curl):void {}
$fixture=json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-fixture.json'),true);
$pending=(int)Database::one("SELECT COUNT(*) AS n FROM order_mail WHERE user_id=? AND status='pending'",[$fixture['owner']])['n'];
check('queue from the HTTP suite is waiting',$pending>=4);
$r=OrderMail::work(20);
check('worker sends every pending email',$r['sent']===$pending&&$r['failed']===0);
$by=[];foreach($GLOBALS['sent'] as $m)$by[$m['data']['subject']][]=$m;
$received=array_values(array_filter($GLOBALS['sent'],fn($m)=>str_starts_with($m['data']['subject'],'Recibimos tu pedido')));
check('buyer email goes to the buyer with the store as sender and owner as reply-to',$received&&$received[0]['data']['to']===['ana@example.test']&&$received[0]['data']['from']==='Mi Tienda Pro x <no-reply@example.test>'&&$received[0]['data']['reply_to']===[$fixture['email']]);
check('buyer email uses the hosted logo and escaped custom message',str_contains($received[0]['data']['html'],'https://tinbana.example/brand/tinvana-mail.png')&&str_contains($received[0]['data']['html'],'&lt;b&gt;lunes&lt;/b&gt;')&&!str_contains($received[0]['data']['html'],'cid:'));
$owner=array_values(array_filter($GLOBALS['sent'],fn($m)=>str_starts_with($m['data']['subject'],'Nuevo pedido #')));
check('owner email goes to the notification address with a link to the order',$owner&&$owner[0]['data']['to']===[$fixture['email']]&&preg_match('~https?://[^"]+/panel/pedidos/[0-9a-f-]{36}~',$owner[0]['data']['html'])===1&&!isset($owner[0]['data']['reply_to']));
$confirmed=array_values(array_filter($GLOBALS['sent'],fn($m)=>str_starts_with($m['data']['subject'],'Tu pedido está confirmado')));
check('confirmed email carries the quoted total',$confirmed&&str_contains($confirmed[0]['data']['html'],'$ 76.900'));
check('cancelled email sent',(bool)array_filter($GLOBALS['sent'],fn($m)=>str_starts_with($m['data']['subject'],'Tu pedido fue cancelado')));
check('each email has its own idempotency key',count(array_unique(array_map(fn($m)=>implode('|',array_filter($m['headers'],fn($h)=>str_starts_with($h,'Idempotency-Key: order-mail-'))),$GLOBALS['sent'])))===count($GLOBALS['sent']));
$left=Database::one("SELECT COUNT(*) AS n FROM order_mail WHERE user_id=? AND (status<>'sent' OR payload_ciphertext IS NOT NULL)",[$fixture['owner']]);
check('sent emails drop their encrypted payload',(int)$left['n']===0);
check('running again sends nothing twice',OrderMail::work(20)['sent']===0);
// Provider failure: retried later, error kept generic.
$o=Database::one('SELECT * FROM orders WHERE user_id=? ORDER BY created_at LIMIT 1',[$fixture['owner']]);$o['version']=999;OrderMail::queue($o,'buyer_confirmed');
$GLOBALS['status']=503;$f=OrderMail::work(5);$row=Database::one("SELECT status,attempts,last_error FROM order_mail WHERE dedupe_key=?",[$o['id'].':buyer_confirmed:999']);
check('provider failure is retried later without leaking details',$f['failed']===1&&$row['status']==='pending'&&(int)$row['attempts']===1&&!str_contains((string)$row['last_error'],'synthetic'));
echo "Order mail worker checks: $passed (intercepted transport; no provider contacted)\n";
