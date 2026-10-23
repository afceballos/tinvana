<?php
declare(strict_types=1);
foreach(json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-env.json'),true) as $k=>$v)$_ENV[$k]=(string)$v;
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Database};
if(!str_ends_with(Support::env('DB_DATABASE'),'_test')||Support::env('DB_HOST')!=='127.0.0.1')throw new RuntimeException('Local test database only.');
$fixture=json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-fixture.json'),true);
if(($argv[1]??'')==='reset-limits')Database::query('DELETE FROM rate_limits');
if(in_array($argv[1]??'',['reset-orders','reset-editing'],true)){
 if($argv[1]==='reset-editing')Database::query('DELETE FROM product_offers WHERE selected_product_id=? AND user_id=?',[$fixture['product'],$fixture['owner']]);
 Database::query('DELETE FROM orders WHERE user_id=?',[$fixture['owner']]);
 foreach(Database::all('SELECT id FROM leads WHERE user_id=?',[$fixture['owner']]) as $lead)App\Orders::create($fixture['owner'],['lead_id'=>$lead['id']]);
}
if(($argv[1]??'')==='expire')Database::query("UPDATE orders SET quote_expires_at=now()-interval '1 minute' WHERE id=? AND user_id=?",[$argv[2],$fixture['owner']]);
if(in_array($argv[1]??'',['variants','simple'],true)){
 $row=Database::one('SELECT mapped_data FROM selected_products WHERE id=? AND user_id=?',[$fixture['product'],$fixture['owner']]);$p=json_decode($row['mapped_data'],true);
 $p['type']=($argv[1]==='variants')?'VARIABLE':'SIMPLE';$p['variations']=($argv[1]==='variants')?[['id'=>321,'name'=>'Rojo','sku'=>'TEST-RED'],['id'=>322,'name'=>'Azul','sku'=>'TEST-BLUE']]:[];
 Database::query('UPDATE selected_products SET mapped_data=?::jsonb WHERE id=? AND user_id=?',[Support::json($p),$fixture['product'],$fixture['owner']]);
}
if(($argv[1]??'')==='offer-history')echo Support::json(Database::all('SELECT version FROM product_offer_versions WHERE selected_product_id=? AND user_id=? ORDER BY version',[$fixture['product'],$fixture['owner']]));
if(($argv[1]??'')==='checks'){
 $r=Database::one('SELECT count(*) AS n FROM orders WHERE user_id=?',[$fixture['owner']]);
 // Row level security is PostgreSQL-only; on MySQL/MariaDB owner isolation is enforced in PHP only.
 echo Support::json(['orders'=>(int)$r['n'],'rls'=>Database::driver()==='mysql'?null:Database::all("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('orders','order_events')")]);
}
if(in_array($argv[1]??'',['dropi-supplier','dropi-no-supplier'],true)){
 $row=Database::one('SELECT original_data FROM selected_products WHERE id=? AND user_id=?',[$fixture['product'],$fixture['owner']]);$raw=json_decode($row['original_data'],true);
 if($argv[1]==='dropi-supplier'){$raw['user_id']=55;$raw['user']['id']=55;}else{unset($raw['user_id'],$raw['user']['id']);}Database::query('UPDATE selected_products SET original_data=?::jsonb WHERE id=? AND user_id=?',[Support::json($raw),$fixture['product'],$fixture['owner']]);
}
if(($argv[1]??'')==='dropi-stale')Database::query("UPDATE orders SET integration_status='sending',integration_data=?::jsonb WHERE id=? AND user_id=?",[Support::json(['attempt_id'=>Support::uuid(),'started_at'=>gmdate('c',time()-600)]),$argv[2],$fixture['owner']]);
