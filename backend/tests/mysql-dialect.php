<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
use App\MySqlDialect;

$checks=0;
$assert=static function(string $name,bool $ok)use(&$checks):void{if(!$ok)throw new RuntimeException('FAIL '.$name);$checks++;echo 'PASS '.$name."\n";};
$assert('json casts removed',MySqlDialect::sql('INSERT INTO t(j) VALUES(?::jsonb)')==='INSERT INTO t(j) VALUES(?)');
$assert('timestamps translated',str_contains(MySqlDialect::sql("SELECT now()+interval '24 hours'"),'DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 24 HOUR)'));
$assert('case-insensitive search uses configured collation',str_contains(MySqlDialect::sql('SELECT id FROM media_assets WHERE original_name ILIKE ?'),'original_name LIKE ?'));
$assert('queue lock order follows mysql grammar',str_contains(MySqlDialect::sql('SELECT id FROM jobs ORDER BY created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1'),'ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED'));
$assert('shared row locks map to a supported exclusive lock',str_ends_with(MySqlDialect::sql('SELECT id FROM jobs WHERE id=? FOR SHARE'),'FOR UPDATE'));
$upsert=MySqlDialect::sql('INSERT INTO ai_connections(user_id,provider,key_ciphertext) VALUES(?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET key_ciphertext=excluded.key_ciphertext,updated_at=now()');
$assert('upsert syntax and excluded values translated',str_contains($upsert,'ON DUPLICATE KEY UPDATE key_ciphertext=VALUES(key_ciphertext)'));
$noop=MySqlDialect::sql('INSERT INTO selected_products(id,integration_id,dropi_id) VALUES(?,?,?) ON CONFLICT(integration_id,dropi_id) DO UPDATE SET updated_at=selected_products.updated_at');
$assert('no-op conflict update translated',str_contains($noop,'ON DUPLICATE KEY UPDATE updated_at=selected_products.updated_at'));
$assert('JSON history concatenation translated',str_contains(MySqlDialect::sql('UPDATE webhook_deliveries SET history=history||?::jsonb'),'history=JSON_MERGE_PRESERVE(history,?)'));
$assert('JSON settings merge translated',str_contains(MySqlDialect::sql('INSERT INTO template_settings(user_id,settings) VALUES(?,?::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=template_settings.settings||excluded.settings'),'JSON_MERGE_PATCH(template_settings.settings,VALUES(settings))'));
$assert('date month filter translated',str_contains(MySqlDialect::sql("created_at>=?::date AND created_at<(?::date + interval '1 month')"),'created_at>=? AND created_at<DATE_ADD(?, INTERVAL 1 MONTH)'));
$assert('regex text search translated',str_contains(MySqlDialect::sql('content::text ~ ?'),'CAST(content AS CHAR) REGEXP ?'));
$plan=MySqlDialect::returning('INSERT INTO leads(id,user_id,landing_page_id,idempotency_key,product_data) VALUES(?,?,?,?,?::jsonb) ON CONFLICT(landing_page_id,idempotency_key) DO NOTHING RETURNING id,status',['id-1','user-1','page-1','key-1','{}']);
$assert('insert returning resolves conflict key',is_array($plan)&&$plan['select']==='SELECT id,status FROM leads WHERE landing_page_id=? AND idempotency_key=?'&&$plan['args']===['page-1','key-1']);
$assert('do nothing conflict preserves null RETURNING semantics',is_array($plan)&&$plan['do_nothing']);
$plan=MySqlDialect::returning('UPDATE orders SET version=version+1 WHERE id=? RETURNING *',['order-1']);
$assert('update returning is read after mutation',is_array($plan)&&$plan['select']==='SELECT * FROM orders WHERE id=?');
$plan=MySqlDialect::returning('UPDATE orders SET quantity=?,notes=?,confirmation=?::jsonb WHERE id=? RETURNING *',[2,'n','{}','order-1']);
$assert('update returning re-reads with only the WHERE arguments',$plan['args']===['order-1']);
$plan=MySqlDialect::returning('UPDATE leads SET status=? WHERE id=? AND user_id=? RETURNING id',['failed','lead-1','owner-1']);
$assert('update returning keeps every WHERE argument in order',$plan['args']===['lead-1','owner-1']);
$plan=MySqlDialect::returning("UPDATE webhook_deliveries SET status='pending' WHERE lead_id=? AND status='failed' RETURNING id",['lead-1']);
$assert('update returning exposes table and condition to lock rows before a write that changes them',$plan['table']==='webhook_deliveries'&&$plan['where']==="lead_id=? AND status='failed'"&&$plan['returning']==='id'&&$plan['args']===['lead-1']);
$plan=MySqlDialect::returning('INSERT INTO integrations(id,user_id,name,token_ciphertext) VALUES(?,?,?,?) RETURNING id,name,created_at,updated_at',['uuid','owner','name','cipher']);
$assert('plain insert returning resolves primary key',is_array($plan)&&$plan['select']==='SELECT id,name,created_at,updated_at FROM integrations WHERE id=?'&&$plan['args']===['uuid']);
$rejected=false;try{MySqlDialect::sql('INSERT INTO rate_limits(bucket) VALUES(?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts<10');}catch(RuntimeException){$rejected=true;}
$assert('unsupported conditional upsert fails closed',$rejected);
echo "{$checks} MySQL dialect checks passed.\n";
