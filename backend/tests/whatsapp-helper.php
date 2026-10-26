<?php
declare(strict_types=1);
// Fixture helper for the WhatsApp tests. Isolated local test database only; touches only the fixture users' rows
// and webhook events created by the tests.
foreach(json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-env.json'),true) as $k=>$v)$_ENV[$k]??=(string)$v;
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Database};
if(!str_ends_with(Support::env('DB_DATABASE'),'_test')||Support::env('DB_HOST')!=='127.0.0.1')throw new RuntimeException('Local test database only.');
$fixture=json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-fixture.json'),true);$ids=[$fixture['owner'],$fixture['otherOwner']];
$op=$argv[1]??'';
if($op==='reset'){
 Database::query('DELETE FROM whatsapp_accounts WHERE user_id IN (?,?)',$ids);
 Database::query("DELETE FROM whatsapp_events WHERE user_id IN (?,?) OR user_id IS NULL",$ids);
 Database::query('DELETE FROM whatsapp_contacts WHERE user_id IN (?,?)',$ids);
 Database::query('UPDATE users SET entitlement_overrides=NULL WHERE id IN (?,?)',$ids);
 echo 'ok';exit;
}
if($op==='events'){
 $rows=Database::all('SELECT dedupe_key,kind,status,user_id,phone_number_id,payload FROM whatsapp_events ORDER BY received_at,dedupe_key');
 foreach($rows as &$r)$r['payload']=json_decode((string)$r['payload'],true);
 echo Support::json($rows);exit;
}
if($op==='age-window'){
 // Moves the owner's conversations 25 hours into the past, so the 24-hour window is closed.
 Database::query("UPDATE whatsapp_conversations SET last_customer_at=now()-interval '25 hours' WHERE user_id=?",[$fixture['owner']]);
 echo 'ok';exit;
}
if($op==='feature'){
 $on=($argv[2]??'')==='on';
 Database::query('UPDATE users SET entitlement_overrides=?::jsonb WHERE id=?',[$on?null:Support::json(['features'=>['whatsapp'=>false],'limits'=>new stdClass()]),$fixture['owner']]);
 echo 'ok';exit;
}
throw new RuntimeException('Unknown operation.');
