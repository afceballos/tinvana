<?php
declare(strict_types=1);
// Fixture helper for tests/subdomain-router.mjs. Isolated local PostgreSQL only; removes only its own owner.
require dirname(__DIR__).'/bootstrap.php';
use App\{Database,Support,Landing,Crypto};
if(Support::env('DB_HOST')!=='127.0.0.1'||Support::env('DB_DATABASE')!=='zenzales_test')throw new RuntimeException('Isolated local PostgreSQL required.');
$op=$argv[1]??'';$tag=$argv[2]??'';
if(!preg_match('/^[a-f0-9]{8}$/D',$tag))throw new RuntimeException('Invalid tag.');
$email='subrouter-'.$tag.'@example.test';
if($op==='cleanup'){Database::query('DELETE FROM users WHERE email=?',[$email]);exit;}
if($op==='unpublish'){Database::query("UPDATE landing_pages SET status='draft' WHERE user_id IN (SELECT id FROM users WHERE email=?)",[$email]);exit;}
if($op!=='setup')throw new RuntimeException('Unknown operation.');
$owner=Support::uuid();Database::query('INSERT INTO users(id,email,password_hash,email_verified_at) VALUES(?,?,?,now())',[$owner,$email,password_hash('x'.bin2hex(random_bytes(6)),PASSWORD_DEFAULT)]);
$integration=Support::uuid();Database::query('INSERT INTO integrations(id,user_id,name,token_ciphertext) VALUES(?,?,?,?)',[$integration,$owner,'Router fixture',Crypto::encrypt('non-production-test-token',$integration.':'.$owner)]);
$out=[];
foreach(['sub'=>'tienda-'.$tag,'normal'=>null] as $kind=>$subdomain){
 $n=$kind==='sub'?9201:9202;$product=['id'=>$n,'name'=>'Producto '.$kind.' '.$tag,'description'=>'<p>Texto de prueba suficiente para publicar</p>','images'=>['https://example.test/'.$n.'.jpg'],'price'=>10000,'suggestedPrice'=>20000,'stock'=>5,'categories'=>[],'sku'=>'R'.$n];
 $id=Support::uuid();Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[$id,$owner,$integration,$n,'{}',Support::json($product)]);
 $landing=Landing::create(['id'=>$id,'mapped_data'=>Support::json($product)],$owner);
 Database::query('UPDATE landing_pages SET subdomain=? WHERE id=?',[$subdomain,$landing['id']]);
 Landing::publish(Database::one('SELECT * FROM landing_pages WHERE id=?',[$landing['id']]));
 $row=Database::one('SELECT slug,published_subdomain FROM landing_pages WHERE id=?',[$landing['id']]);
 $out[$kind]=['slug'=>$row['slug'],'subdomain'=>$row['published_subdomain'],'title'=>$product['name']];
}
echo Support::json($out);
