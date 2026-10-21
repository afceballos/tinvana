<?php
require __DIR__.'/account-config.php';
use App\{Database,AccountMail,Crypto,Support};
$operation=$argv[1]??'';$email=$argv[2]??'';
if($operation==='work'){echo Support::json(AccountMail::work(20));exit;}
if($operation==='template'){$content=AccountMail::template('verify','https://example.test/verificar-correo#token=preview-only');$content['html']=str_replace('cid:zenzales-logo','http://127.0.0.1:8084/brand/logo-white.png',$content['html']);file_put_contents(dirname(__DIR__,2).'/test-results/account-email-preview.html',$content['html']);exit;}
if(!preg_match('/^account-[a-f0-9]+@example\.test$/D',$email))throw new RuntimeException('Only account test users allowed.');
if($operation==='cleanup'){Database::query('DELETE FROM users WHERE email=?',[$email]);exit;}
$user=Database::one('SELECT id,email_verified_at,role FROM users WHERE email=?',[$email]);
if($operation==='expire'){Database::query("UPDATE account_tokens SET expires_at=now()-interval '1 minute' WHERE user_id=? AND purpose=? AND used_at IS NULL",[$user['id'],$argv[3]]);exit;}
if($operation==='due'){Database::query("UPDATE account_mail SET next_attempt_at=now() WHERE token_id IN (SELECT id FROM account_tokens WHERE user_id=?)",[$user['id']]);exit;}
if($operation==='limits'){foreach(['account-mail:'.($argv[3]??'verify').':'.$email,'account-mail-ip:127.0.0.1','account-token-ip:127.0.0.1','login-ip:127.0.0.1'] as $bucket)Database::query('DELETE FROM rate_limits WHERE bucket=?',[hash('sha256',$bucket)]);exit;}
$r=Database::one('SELECT t.*,m.payload_ciphertext,m.id AS mail_id,m.status FROM account_tokens t JOIN account_mail m ON m.token_id=t.id WHERE t.user_id=? AND t.purpose=? ORDER BY t.created_at DESC LIMIT 1',[$user['id'],$argv[3]??'verify']);
$url=$r&&$r['payload_ciphertext']?json_decode(Crypto::decrypt($r['payload_ciphertext'],'account-mail:'.$r['mail_id']),true)['url']:null;
echo Support::json(['user'=>$user,'row'=>$r?['token_hash'=>$r['token_hash'],'status'=>$r['status'],'used_at'=>$r['used_at'],'expires_at'=>$r['expires_at']]:null,'url'=>$url]);
