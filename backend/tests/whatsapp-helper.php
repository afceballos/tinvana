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
 Database::query("UPDATE users SET role='admin' WHERE id IN (?,?) AND role='superadmin'",$ids);
 Database::query('DELETE FROM notifications WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM notification_settings WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_ads WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_offers WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM selected_products WHERE user_id IN (?,?) AND dropi_id=900002',$ids);
 Database::query('DELETE FROM whatsapp_agent_settings WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_order_confirmations WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_confirm_settings WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_product_sheets WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM ai_connections WHERE user_id IN (?,?)',$ids);
 Database::query("DELETE FROM admin_audit WHERE actor_id IN (?,?)",$ids);
 Database::query("DELETE FROM app_settings WHERE setting_key IN ('whatsapp_signature_rejected','whatsapp_agent_defaults')");
 echo 'ok';exit;
}
if($op==='override'){
 // Per-account features/limits for the owner, e.g. {"features":{"whatsapp_ai":false},"limits":{"whatsapp_ai_conversations":1}}.
 $v=json_decode($argv[2]??'null',true);if(!is_array($v))throw new RuntimeException('JSON expected.');
 Database::query('UPDATE users SET entitlement_overrides=?::jsonb WHERE id=?',[Support::json(['features'=>(object)($v['features']??[]),'limits'=>(object)($v['limits']??[])]),$fixture['owner']]);
 echo 'ok';exit;
}
if($op==='add-product'){
 // A second product for the owner (copy of the fixture product), to test two ads with different products.
 $p=Database::one('SELECT * FROM selected_products WHERE id=?',[$fixture['product']]);$id=Support::uuid();$m=json_decode((string)$p['mapped_data'],true);$m['name']='Cepillo eléctrico giratorio';
 Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[$id,$p['user_id'],$p['integration_id'],900002,$p['original_data'],Support::json($m)]);
 echo $id;exit;
}
if($op==='landing-text'){
 // Prefilled WhatsApp text of the fixture landing (its product's landing offer, with the verified code).
 echo App\WhatsAppOffers::landingMessage((array)Database::one('SELECT * FROM landing_pages WHERE id=?',[$fixture['landing']]))??'';exit;
}
if($op==='notifications'){
 // The owner's notifications with their email queue state (for the notification tests).
 echo Support::json(Database::all('SELECT kind,title,body,link,read_at,email_status,email_to FROM notifications WHERE user_id=? ORDER BY created_at,id',[$fixture['owner']]));exit;
}
if($op==='superadmin'){
 // Temporarily makes the second fixture account a superadmin for the Administración checks.
 Database::query('UPDATE users SET role=? WHERE id=?',[($argv[2]??'')==='on'?'superadmin':'admin',$fixture['otherOwner']]);
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
if($op==='confirmations'){
 // The owner's order confirmations (for the WhatsApp confirmation tests).
 echo Support::json(Database::all('SELECT id,order_id,status,origin,error,reply,reply_pending,conversation_id,quote_id,order_version FROM whatsapp_order_confirmations WHERE user_id=? ORDER BY created_at,id',[$fixture['owner']]));exit;
}
if($op==='confirm-work'){echo Support::json(App\WhatsAppOrderConfirm::runDue(20));exit;}
if($op==='feature'){
 $on=($argv[2]??'')==='on';
 Database::query('UPDATE users SET entitlement_overrides=?::jsonb WHERE id=?',[$on?null:Support::json(['features'=>['whatsapp'=>false],'limits'=>new stdClass()]),$fixture['owner']]);
 echo 'ok';exit;
}
throw new RuntimeException('Unknown operation.');
