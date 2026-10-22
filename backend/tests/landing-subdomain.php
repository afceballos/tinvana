<?php
declare(strict_types=1);
// Isolated local PostgreSQL only. Creates its own owner and removes it (and its landings) at the end.
require dirname(__DIR__).'/bootstrap.php';
use App\{Database,Support,Landing,Leads,HttpError,Crypto};
if(Support::env('DB_HOST')!=='127.0.0.1'||Support::env('DB_DATABASE')!=='zenzales_test')throw new RuntimeException('Subdomain tests require isolated local PostgreSQL.');
$passed=0;
function check(string $name,bool $ok):void{global $passed;if(!$ok)throw new RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
function rejects(string $name,callable $f,int $status=422):void{try{$f();}catch(HttpError $e){check($name,$e->status===$status);return;}throw new RuntimeException('FAIL: '.$name.' was accepted');}

// Pure validation.
check('empty means normal link',Landing::subdomain('')===null&&Landing::subdomain(null)===null&&Landing::subdomain('   ')===null);
foreach(['ana','mi-producto','tienda-de-ana-2','a1b','x'.str_repeat('y',38).'z'] as $ok)check('accepts '.$ok,Landing::subdomain($ok)===$ok);
foreach(['a','ab','Ana','mi producto','-ana','ana-','a--b','ñandu','a_b','a.b','a/b','ana!','x'.str_repeat('y',39).'z','xn--bcher-kva'] as $bad)rejects('rejects '.json_encode($bad),fn()=>Landing::subdomain($bad));
foreach(['www','mail','cpanel','api','admin','p'] as $reserved)rejects('reserved '.$reserved,fn()=>Landing::subdomain($reserved));
rejects('non-string refused',fn()=>Landing::subdomain(['x']));

// Base domain and public URL (Support::env reads $_ENV first).
$_ENV['APP_URL']='http://127.0.0.1:8081';check('IP has no subdomain base',Landing::subdomainBase()===null&&Landing::publicUrl('mi-slug','ana')==='http://127.0.0.1:8081/p/mi-slug');
$_ENV['APP_URL']='http://localhost:8081';check('localhost has no subdomain base',Landing::subdomainBase()===null);
$_ENV['APP_URL']='https://tinbana.com';
check('base domain',Landing::subdomainBase()==='tinbana.com');
check('subdomain URL',Landing::publicUrl('mi-slug','ana')==='https://ana.tinbana.com');
check('normal URL without subdomain',Landing::publicUrl('mi-slug',null)==='https://tinbana.com/p/mi-slug'&&Landing::publicUrl('mi-slug','')==='https://tinbana.com/p/mi-slug');

// Database behaviour.
$owner=Support::uuid();$email='subdomain-'.bin2hex(random_bytes(4)).'@example.test';
Database::query('INSERT INTO users(id,email,password_hash,email_verified_at) VALUES(?,?,?,now())',[$owner,$email,password_hash('x'.bin2hex(random_bytes(6)),PASSWORD_DEFAULT)]);
try{
 $integration=Support::uuid();Database::query('INSERT INTO integrations(id,user_id,name,token_ciphertext) VALUES(?,?,?,?)',[$integration,$owner,'Subdomain fixture',Crypto::encrypt('non-production-test-token',$integration.':'.$owner)]);
 $landings=[];
 foreach([9101,9102] as $n){
  $product=['id'=>$n,'name'=>'Producto subdominio '.$n,'description'=>'<p>Texto de prueba suficiente para publicar</p>','images'=>['https://example.test/'.$n.'.jpg'],'price'=>10000,'suggestedPrice'=>20000,'stock'=>5,'categories'=>[],'sku'=>'S'.$n];
  $id=Support::uuid();Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[$id,$owner,$integration,$n,'{}',Support::json($product)]);
  $landings[]=Landing::create(['id'=>$id,'mapped_data'=>Support::json($product)],$owner);
 }
 [$a,$b]=$landings;
 $fetch=fn(string $id)=>Database::one('SELECT * FROM landing_pages WHERE id=?',[$id]);
 check('new landing has no subdomain',$a['subdomain']===null&&$a['published_subdomain']===null);
 Database::query('UPDATE landing_pages SET subdomain=? WHERE id=?',['ana-test',$a['id']]);
 Landing::checkSubdomain('ana-test',$a['id']);check('own subdomain is not a conflict',true);
 rejects('same subdomain on another landing conflicts',fn()=>Landing::checkSubdomain('ana-test',$b['id']),409);
 Landing::checkSubdomain(null,$b['id']);check('null subdomain never conflicts',true);
 $duplicate=false;try{Database::query('UPDATE landing_pages SET subdomain=? WHERE id=?',['ana-test',$b['id']]);}catch(PDOException $e){$duplicate=true;}check('database enforces unique subdomain',$duplicate);
 $badFormat=false;try{Database::query('UPDATE landing_pages SET subdomain=? WHERE id=?',['Mal Nombre',$b['id']]);}catch(PDOException $e){$badFormat=true;}check('database refuses malformed subdomain',$badFormat);
 // Publish: the draft choice becomes the live one.
 Landing::publish($fetch($a['id']));
 $live=$fetch($a['id']);
 check('published_subdomain copied on publish',$live['published_subdomain']==='ana-test'&&$live['status']==='published');
 $public=Landing::published($live);check('published view exposes live subdomain',$public['subdomain']==='ana-test'&&$public['subdomain_base']==='tinbana.com');
 // Changing the draft does not move the live address until publishing again.
 Database::query('UPDATE landing_pages SET subdomain=? WHERE id=?',['ana-nueva',$a['id']]);
 $live=$fetch($a['id']);check('draft change keeps the live subdomain',$live['published_subdomain']==='ana-test'&&Landing::published($live)['subdomain']==='ana-test');
 rejects('live subdomain stays reserved for its landing',fn()=>Landing::checkSubdomain('ana-test',$b['id']),409);
 check('lead URL uses the live subdomain',Leads::productData($live)['landing_url']==='https://ana-test.tinbana.com');
 Landing::publish($live);$live=$fetch($a['id']);check('republish moves the live subdomain',$live['published_subdomain']==='ana-nueva');
 Landing::checkSubdomain('ana-test',$b['id']);check('released subdomain can be reused',true);
 // Back to the normal link.
 Database::query('UPDATE landing_pages SET subdomain=NULL WHERE id=?',[$a['id']]);Landing::publish($fetch($a['id']));
 $live=$fetch($a['id']);check('switching back clears the live subdomain',$live['published_subdomain']===null&&str_starts_with(Leads::productData($live)['landing_url'],'https://tinbana.com/p/'));
}finally{Database::query('DELETE FROM users WHERE id=?',[$owner]);}
echo "OK $passed checks\n";
