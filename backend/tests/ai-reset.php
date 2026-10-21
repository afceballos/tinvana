<?php
foreach(json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-env.json'),true) as $key=>$value)$_ENV[$key]=(string)$value;
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Database};
if(Support::env('DB_DATABASE')!=='zenzales_test'||Support::env('DB_HOST')!=='127.0.0.1')throw new RuntimeException('Only isolated test database allowed.');
$fixture=json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-fixture.json'),true);$owner=$fixture['owner'];$mode=$argv[1]??'all';
if($mode==='login')Database::query('DELETE FROM rate_limits WHERE bucket=?',[hash('sha256','login-email:'.$fixture['email'])]);
Database::query('DELETE FROM rate_limits WHERE bucket=?',[hash('sha256','ai-minute:'.$owner)]);
if($mode==='all')Database::query('DELETE FROM rate_limits WHERE bucket=?',[hash('sha256','ai-day:'.$owner)]);
if($mode==='last')Database::query("UPDATE rate_limits SET attempts=3,expires_at=now()+interval '24 hours' WHERE bucket=?",[hash('sha256','ai-day:'.$owner)]);
echo "Isolated AI limits prepared.\n";
