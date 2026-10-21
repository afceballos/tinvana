<?php
declare(strict_types=1);
$root=dirname(__DIR__,2);foreach(json_decode(file_get_contents($root.'/.tools/test-env.json'),true) as $key=>$value)$_ENV[$key]=(string)$value;
require dirname(__DIR__).'/bootstrap.php';
use App\{Database,Support,Media};
if(Support::env('DB_HOST')!=='127.0.0.1'||!str_ends_with(Support::env('DB_DATABASE'),'_test'))throw new RuntimeException('Local tests only.');
$fixture=json_decode(file_get_contents($root.'/.tools/test-fixture.json'),true);$asset=Database::one('SELECT * FROM media_assets WHERE id=? AND user_id=?',[$argv[2]??'',$fixture['owner']]);if(!$asset)throw new RuntimeException('Owned test asset required.');
if($argv[1]==='lead')Database::query('INSERT INTO leads(id,user_id,landing_page_id,idempotency_key,first_name,last_name,email,phone,product_data) VALUES(?,?,?,?,?,?,?,?,?::jsonb)',[Support::uuid(),$fixture['owner'],$fixture['landing'],Support::uuid(),'Test','Media',$fixture['email'],'+573001234567',Support::json(['image'=>Media::item($asset)['url']])]);
elseif($argv[1]==='template')Database::query('INSERT INTO template_settings(user_id,settings) VALUES(?,?::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings',[$fixture['owner'],Support::json(['test_image'=>Media::item($asset)['url']])]);
elseif($argv[1]==='path')echo Support::json(['path'=>Media::path($asset['id'])]);
