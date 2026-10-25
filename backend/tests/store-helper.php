<?php
declare(strict_types=1);
// Fixture helper for tests/store-router.mjs. Isolated local PostgreSQL only; removes only its own users.
require dirname(__DIR__).'/bootstrap.php';
use App\{Database,Support,Landing,Store,Crypto};
if(Support::env('DB_HOST')!=='127.0.0.1'||Support::env('DB_DATABASE')!=='zenzales_test')throw new RuntimeException('Isolated local PostgreSQL required.');
$op=$argv[1]??'';$tag=$argv[2]??'';
if(!preg_match('/^[a-f0-9]{8}$/D',$tag))throw new RuntimeException('Invalid tag.');
$like='store-router-'.$tag.'-%@example.test';
if($op==='cleanup'){Database::query('DELETE FROM users WHERE email LIKE ?',[$like]);exit;}
if($op==='unpublish'){Database::query("UPDATE landing_pages SET status='draft' WHERE user_id IN (SELECT id FROM users WHERE email=?)",['store-router-'.$tag.'-a@example.test']);exit;}
// Known password for store a's owner (browser tests that sign in on the main domain); printed back only to the test.
if($op==='password'){$pass='Store-'.bin2hex(random_bytes(8));Database::query('UPDATE users SET password_hash=? WHERE email=?',[password_hash($pass,PASSWORD_DEFAULT),'store-router-'.$tag.'-a@example.test']);echo Support::json(['email'=>'store-router-'.$tag.'-a@example.test','password'=>$pass]);exit;}
if($op==='clear'){Database::query('UPDATE users SET store_subdomain=NULL WHERE email=?',['store-router-'.$tag.'-a@example.test']);exit;}
if($op!=='setup')throw new RuntimeException('Unknown operation.');
$out=[];
// a: store with its own landing, b: another store, c: user without a store.
foreach(['a'=>'tienda-'.$tag,'b'=>'otra-'.$tag,'c'=>null] as $who=>$subdomain){
 $owner=Support::uuid();Database::query('INSERT INTO users(id,email,password_hash,email_verified_at,store_subdomain) VALUES(?,?,?,now(),?)',[$owner,'store-router-'.$tag.'-'.$who.'@example.test',password_hash('x'.bin2hex(random_bytes(6)),PASSWORD_DEFAULT),$subdomain]);
 $integration=Support::uuid();Database::query('INSERT INTO integrations(id,user_id,name,token_ciphertext) VALUES(?,?,?,?)',[$integration,$owner,'Router fixture',Crypto::encrypt('non-production-test-token',$integration.':'.$owner)]);
 $n=9400+ord($who);$product=['id'=>$n,'name'=>'Producto '.$who.' '.$tag,'description'=>'<p>Texto de prueba suficiente para publicar</p>','images'=>['https://example.test/'.$n.'.jpg'],'price'=>10000,'suggestedPrice'=>20000,'stock'=>5,'categories'=>[],'sku'=>'R'.$n];
 $id=Support::uuid();Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[$id,$owner,$integration,$n,'{}',Support::json($product)]);
 $landing=Landing::create(['id'=>$id,'mapped_data'=>Support::json($product)],$owner);
 Landing::publish(Database::one('SELECT * FROM landing_pages WHERE id=?',[$landing['id']]));
 $row=Database::one('SELECT published_slug FROM landing_pages WHERE id=?',[$landing['id']]);
 $out[$who]=['slug'=>$row['published_slug'],'store'=>$subdomain,'title'=>$product['name']];
}
echo Support::json($out);
