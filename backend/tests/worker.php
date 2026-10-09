<?php
declare(strict_types=1);
$root=dirname(__DIR__,2);foreach(json_decode(file_get_contents($root.'/.tools/test-env.json'),true) as $k=>$v)$_ENV[$k]=(string)$v;
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Database,Leads};
if(Support::env('DB_DATABASE')!=='zenzales_test'||Support::env('DB_HOST')!=='127.0.0.1')throw new RuntimeException('Only isolated local tests are allowed.');
$_ENV['GHL_WEBHOOK_URL']='https://127.0.0.1:9443/fixture';
$_ENV['HTTP_CA_BUNDLE']=$root.'/.tools/test-cert.pem';
// Keep the local TLS fixture local even when the test runner supplies an outbound proxy.
putenv('HTTPS_PROXY');putenv('https_proxy');putenv('ALL_PROXY');putenv('all_proxy');putenv('NO_PROXY=127.0.0.1,localhost');
if(($argv[1]??'')==='due')Database::query("UPDATE webhook_deliveries SET next_attempt_at=now() WHERE status='pending'");
elseif(($argv[1]??'')==='final')Database::query("UPDATE webhook_deliveries SET attempts=7,next_attempt_at=now() WHERE status='pending'");
$sender=function(string $url,array $payload,string $leadId) use ($root):array {
 // Fixed local TLS sink is a test transport, never a production URL validation exception.
 if($url!=='https://hooks.example.com/owner-webhook-secret')throw new RuntimeException('Wrong owner webhook selected.');
 $curl=curl_init('https://127.0.0.1:9443/fixture');
 curl_setopt_array($curl,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>Support::json($payload),
  CURLOPT_HTTPHEADER=>['Content-Type: application/json','Idempotency-Key: '.$leadId],
  CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_CAINFO=>$root.'/.tools/test-cert.pem',
  CURLOPT_PROXY=>'',CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>10]);
 $body=curl_exec($curl);$http=(int)curl_getinfo($curl,CURLINFO_RESPONSE_CODE);$errno=curl_errno($curl);curl_close($curl);
 $ok=$body!==false&&$http>=200&&$http<300;
 return ['ok'=>$ok,'http'=>$http,'error'=>$ok?null:($errno?'Error de transporte cURL '.$errno:'El webhook respondió HTTP '.$http)];
};
echo Support::json(Leads::deliver(1,$sender))."\n";
