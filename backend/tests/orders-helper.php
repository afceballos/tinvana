<?php
declare(strict_types=1);
foreach(json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-env.json'),true) as $k=>$v)$_ENV[$k]=(string)$v;
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Database};
if(!str_ends_with(Support::env('DB_DATABASE'),'_test')||Support::env('DB_HOST')!=='127.0.0.1')throw new RuntimeException('Local test database only.');
$fixture=json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-fixture.json'),true);
if(($argv[1]??'')==='reset-limits')Database::query('DELETE FROM rate_limits');
// The last stock check of the fixture product is old, so the next buy button asks Dropi again.
if(($argv[1]??'')==='stock-expire')Database::query('UPDATE selected_products SET stock_checked_at=NULL WHERE id=? AND user_id=?',[$fixture['product'],$fixture['owner']]);
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
if(($argv[1]??'')==='shipping-setup'){
 // Product dispatched from Cali (as in the real probe) and Dropi freight enabled on the published fixture landing.
 $row=Database::one('SELECT original_data FROM selected_products WHERE id=? AND user_id=?',[$fixture['product'],$fixture['owner']]);$raw=json_decode($row['original_data'],true);
 $raw['warehouse_product']=[['stock'=>5,'warehouse'=>['id'=>1,'name'=>'Bodega Cali','city'=>['id'=>1221,'department_id'=>12,'name'=>'CALI','cod_dane'=>'76001000']]]];
 Database::query('UPDATE selected_products SET original_data=?::jsonb WHERE id=? AND user_id=?',[Support::json($raw),$fixture['product'],$fixture['owner']]);
 foreach(['content','published_content'] as $col){$l=Database::one("SELECT $col AS c FROM landing_pages WHERE id=? AND user_id=?",[$fixture['landing'],$fixture['owner']]);if(!$l||$l['c']===null)continue;$c=json_decode($l['c'],true);$c['commerce']['dropiShipping']=($argv[2]??'on')==='on';$c['publicPrice']=$c['publicPrice']??25000;Database::query("UPDATE landing_pages SET $col=?::jsonb WHERE id=? AND user_id=?",[Support::json($c),$fixture['landing'],$fixture['owner']]);}
 foreach(glob(dirname(__DIR__).'/storage/cache/shipping/*.json')?:[] as $file)unlink($file);
}
if(($argv[1]??'')==='mail-queue')echo Support::json(Database::all('SELECT kind,status,dedupe_key FROM order_mail WHERE user_id=? ORDER BY created_at,kind',[$fixture['owner']]));
if(($argv[1]??'')==='mail-reset'){Database::query('DELETE FROM order_mail WHERE user_id=?',[$fixture['owner']]);Database::query('UPDATE users SET mail_settings=NULL WHERE id=?',[$fixture['owner']]);}
if(($argv[1]??'')==='dropi-mark-sent')Database::query("UPDATE orders SET integration_status='sent',dropi_order_id=?,dropi_status=NULL,dropi_tracking=NULL,dropi_synced_at=NULL WHERE id=? AND user_id=?",[$argv[3],$argv[2],$fixture['owner']]);
if(($argv[1]??'')==='dropi-sync-due'){Database::query('UPDATE orders SET dropi_synced_at=NULL WHERE user_id=?',[$fixture['owner']]);echo Support::json(App\DropiTracking::syncDue(40));}
if(($argv[1]??'')==='order-created-at')Database::query('UPDATE orders SET created_at=? WHERE id=? AND user_id=?',[Database::timestamp($argv[3]),$argv[2],$fixture['owner']]);
if(($argv[1]??'')==='admin-reset'){
 // Plans, global defaults, audit and the account fields of both fixture users back to a clean state.
 $ids=[$fixture['owner'],$fixture['otherOwner']];
 Database::query("UPDATE users SET role=CASE WHEN role='superadmin' THEN 'admin' ELSE role END,status='active',plan_id=NULL,plan_expires_at=NULL,entitlement_overrides=NULL,admin_note=NULL WHERE id IN (?,?)",$ids);
 Database::query('DELETE FROM admin_audit');Database::query('DELETE FROM plans');Database::query("DELETE FROM app_settings WHERE setting_key='entitlements'");
 Database::query("DELETE FROM integrations WHERE user_id IN (?,?) AND name LIKE 'Admin test%'",$ids);
}
