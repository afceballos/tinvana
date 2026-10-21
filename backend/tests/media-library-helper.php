<?php
declare(strict_types=1);
$root=dirname(__DIR__,2);
foreach(json_decode(file_get_contents($root.'/.tools/test-env.json'),true) as $key=>$value)$_ENV[$key]=(string)$value;
require dirname(__DIR__).'/bootstrap.php';
use App\{Database,Support,Landing,Media};
if(Support::env('DB_HOST')!=='127.0.0.1'||!str_ends_with(Support::env('DB_DATABASE'),'_test'))throw new RuntimeException('Local tests only.');
$fixture=json_decode(file_get_contents($root.'/.tools/test-fixture.json'),true);
if(($argv[1]??'')==='prepare'){
 $product=Database::one('SELECT * FROM selected_products WHERE id=? AND user_id=?',[$fixture['product'],$fixture['owner']]);$id=Support::uuid();
 Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[$id,$fixture['owner'],$fixture['integration'],987654322,$product['original_data'],$product['mapped_data']]);
 $landing=Landing::create(Database::one('SELECT * FROM selected_products WHERE id=?',[$id]),$fixture['owner']);
 $legacy=Support::uuid();$file=dirname(__DIR__).'/storage/media/'.$legacy.'.webp';$meta=Media::optimize($root.'/.tools/upload-test.png',$file);
 Database::query("INSERT INTO media_assets(id,user_id,landing_page_id,bytes,width,height,created_at) VALUES(?,?,?,?,?,?,'2025-01-05T12:00:00Z')",[$legacy,$fixture['owner'],$fixture['landing'],$meta['bytes'],$meta['width'],$meta['height']]);
 echo Support::json(['second'=>$landing['id'],'legacy'=>$legacy]);
}elseif(($argv[1]??'')==='path'){
 $asset=Database::one('SELECT storage_path FROM media_assets WHERE id=? AND user_id=?',[$argv[2],$fixture['owner']]);echo Support::json(['path'=>$asset['storage_path']??null,'exists'=>is_file(Media::path($argv[2]))]);
}
