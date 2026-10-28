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
 Database::query('DELETE FROM whatsapp_knowledge WHERE user_id IN (?,?) OR user_id IS NULL',$ids);
 Database::query('DELETE FROM whatsapp_status_notices WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_notice_settings WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_reminders WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_confirm_settings WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM whatsapp_product_sheets WHERE user_id IN (?,?)',$ids);
 Database::query('DELETE FROM ai_connections WHERE user_id IN (?,?)',$ids);
 Database::query("DELETE FROM admin_audit WHERE actor_id IN (?,?)",$ids);
 Database::query("DELETE FROM app_settings WHERE setting_key IN ('whatsapp_signature_rejected','whatsapp_agent_defaults','whatsapp_agent_prompt')");
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
if($op==='close-age'){
 // Moves one chat of the owner into the past: argv[2]=conversation, argv[3]=hours since the last message, argv[4]=days since the closing.
 $id=(string)($argv[2]??'');$h=(int)($argv[3]??25);$d=isset($argv[4])?(int)$argv[4]:null;
 Database::query('UPDATE whatsapp_conversations SET last_message_at=now()-make_interval(hours=>?)'.($d!==null?',closed_at=now()-make_interval(days=>?)':'').' WHERE id=? AND user_id=?',$d!==null?[$h,$d,$id,$fixture['owner']]:[$h,$id,$fixture['owner']]);
 if($d!==null)Database::query('UPDATE whatsapp_messages SET created_at=now()-make_interval(hours=>?) WHERE conversation_id=? AND user_id=?',[$h,$id,$fixture['owner']]);
 echo 'ok';exit;
}
if($op==='status-notice'){
 // A Dropi logistics change for one order of the owner: argv[2]=order, argv[3]=state, argv[4]=JSON with guide/carrier/novelty.
 $o=Database::one('SELECT * FROM orders WHERE id=? AND user_id=?',[$argv[2]??'',$fixture['owner']]);if(!$o)throw new RuntimeException('Order not found.');
 $db=Database::connection();$db->beginTransaction();App\OrderStatusNotices::queue($o,(string)($argv[3]??''),json_decode($argv[4]??'{}',true)?:[]);$db->commit();echo 'ok';exit;
}
if($op==='order-mails'){echo Support::json(array_column(Database::all('SELECT kind FROM order_mail WHERE order_id=? AND user_id=? ORDER BY created_at',[$argv[2]??'',$fixture['owner']]),'kind'));exit;}
if($op==='all-hours'){
 // The owner's agent attends every day at any hour, so the reminders do not depend on when the test runs.
 $s=App\WhatsAppAgentSettings::forUser($fixture['owner'])['settings'];$s['schedule']=['days'=>[1,2,3,4,5,6,7],'start'=>'00:00','end'=>'23:59','off_hours'=>'reply'];
 App\WhatsAppAgentSettings::save($fixture['owner'],$s);echo 'ok';exit;
}
if($op==='age-chat'){
 // One chat of the owner: the customer wrote argv[3] hours ago and the store answered 5 minutes later.
 Database::query("UPDATE whatsapp_conversations SET last_customer_at=now()-make_interval(hours=>?),last_message_at=now()-make_interval(hours=>?)+interval '5 minutes' WHERE id=? AND user_id=?",[(int)$argv[3],(int)$argv[3],$argv[2]??'',$fixture['owner']]);echo 'ok';exit;
}
if($op==='age-reminders'){
 // Summaries sent 4 hours ago (confirmation buttons and «1 SÍ / 2 NO» in the chat), and reminders 25 hours old.
 Database::query("UPDATE whatsapp_order_confirmations SET sent_at=now()-interval '4 hours' WHERE user_id=? AND status='sent'",[$fixture['owner']]);
 foreach(Database::all('SELECT id,pending FROM whatsapp_conversations WHERE user_id=? AND pending IS NOT NULL',[$fixture['owner']]) as $c){$p=json_decode((string)$c['pending'],true);if(is_array($p)){$p['at']=gmdate('c',time()-4*3600);Database::query('UPDATE whatsapp_conversations SET pending=?::jsonb WHERE id=?',[Support::json($p),$c['id']]);}}
 Database::query("UPDATE whatsapp_reminders SET created_at=now()-interval '25 hours' WHERE user_id=?",[$fixture['owner']]);echo 'ok';exit;
}
if($op==='housekeeping'){echo Support::json(App\WhatsAppInbox::housekeeping());exit;}
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
if($op==='confirm-due'){
 // Makes the owner's confirmations that wait for the customer due now (the template fallback time has come).
 Database::query("UPDATE whatsapp_order_confirmations SET send_after=now()-interval '1 minute' WHERE user_id=? AND status='queued'",[$fixture['owner']]);
 echo 'ok';exit;
}
if($op==='mail-info'){echo Support::json(App\WhatsAppOrderConfirm::mailInfo($fixture['owner'],(string)($argv[2]??'')));exit;}
if($op==='confirm-work'){echo Support::json(App\WhatsAppOrderConfirm::runDue(20));exit;}
if($op==='feature'){
 $on=($argv[2]??'')==='on';
 Database::query('UPDATE users SET entitlement_overrides=?::jsonb WHERE id=?',[$on?null:Support::json(['features'=>['whatsapp'=>false],'limits'=>new stdClass()]),$fixture['owner']]);
 echo 'ok';exit;
}
throw new RuntimeException('Unknown operation.');
