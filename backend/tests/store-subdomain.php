<?php
declare(strict_types=1);
// Isolated local PostgreSQL only. Creates its own users and removes them (and their landings) at the end.
require dirname(__DIR__).'/bootstrap.php';
use App\{Database,Support,Landing,Leads,Store,Profile,HttpError,Crypto};
if(Support::env('DB_HOST')!=='127.0.0.1'||Support::env('DB_DATABASE')!=='zenzales_test')throw new RuntimeException('Store tests require isolated local PostgreSQL.');
$passed=0;
function check(string $name,bool $ok):void{global $passed;if(!$ok)throw new RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
function rejects(string $name,callable $f,int $status=422):void{try{$f();}catch(HttpError $e){check($name,$e->status===$status);return;}throw new RuntimeException('FAIL: '.$name.' was accepted');}

// Pure validation.
check('empty means no store address',Store::validate('')===null&&Store::validate(null)===null&&Store::validate('   ')===null);
foreach(['ana','mi-tienda','tienda-de-ana-2','a1b','x'.str_repeat('y',38).'z'] as $ok)check('accepts '.$ok,Store::validate($ok)===$ok);
foreach(['a','ab','Ana','mi tienda','-ana','ana-','a--b','ñandu','a_b','a.b','a/b','ana!','x'.str_repeat('y',39).'z','xn--bcher-kva'] as $bad)rejects('rejects '.json_encode($bad),fn()=>Store::validate($bad));
foreach(['www','mail','cpanel','api','admin','p','tinbana'] as $reserved)rejects('reserved '.$reserved,fn()=>Store::validate($reserved));
rejects('non-string refused',fn()=>Store::validate(['x']));

// Base domain and URLs (Support::env reads $_ENV first).
$_ENV['APP_URL']='http://127.0.0.1:8081';check('IP has no store base',Store::base()===null&&Store::origin('ana')===null&&Store::landingUrl('mi-slug','ana')==='http://127.0.0.1:8081/p/mi-slug');
$_ENV['APP_URL']='http://localhost:8081';check('localhost has no store base',Store::base()===null);
$_ENV['APP_URL']='https://tinbana.com';
check('base domain',Store::base()==='tinbana.com');
check('store origin',Store::origin('ana')==='https://ana.tinbana.com'&&Store::origin(null)===null&&Store::origin('')===null);
check('landing inside the store',Store::landingUrl('mi-slug','ana')==='https://ana.tinbana.com/p/mi-slug');
check('landing without a store',Store::landingUrl('mi-slug',null)==='https://tinbana.com/p/mi-slug');

// Database behaviour.
$mk=function(string $tag):string{$id=Support::uuid();Database::query('INSERT INTO users(id,email,password_hash,email_verified_at) VALUES(?,?,?,now())',[$id,'store-'.$tag.'-'.bin2hex(random_bytes(4)).'@example.test',password_hash('x'.bin2hex(random_bytes(6)),PASSWORD_DEFAULT)]);return $id;};
$a=$mk('a');$b=$mk('b');
try{
 check('new user has no store',Store::subdomainOf($a)===null&&Profile::view($a)['store']==['subdomain'=>null,'base'=>'tinbana.com','url'=>null]);
 $view=Store::save($a,['subdomain'=>'ana-test'])['store'];
 check('save returns the store in the profile',$view['subdomain']==='ana-test'&&$view['url']==='https://ana-test.tinbana.com'&&Store::subdomainOf($a)==='ana-test'&&Store::owner('ana-test')===$a);
 check('saving the same name again is allowed',Store::save($a,['subdomain'=>'ana-test'])['store']['subdomain']==='ana-test');
 rejects('same name for another user conflicts',fn()=>Store::save($b,['subdomain'=>'ana-test']),409);
 rejects('invalid name is refused',fn()=>Store::save($b,['subdomain'=>'Mi Tienda']));
 rejects('reserved name is refused',fn()=>Store::save($b,['subdomain'=>'www']));
 rejects('other fields are refused',fn()=>Store::save($b,['subdomain'=>'bea-test','email'=>'x@example.test']));
 check('refused saves changed nothing',Store::subdomainOf($b)===null);
 $duplicate=false;try{Database::query('UPDATE users SET store_subdomain=? WHERE id=?',['ana-test',$b]);}catch(PDOException $e){$duplicate=true;}check('database enforces unique store name',$duplicate);
 $badFormat=false;try{Database::query('UPDATE users SET store_subdomain=? WHERE id=?',['Mal Nombre',$b]);}catch(PDOException $e){$badFormat=true;}check('database refuses malformed store name',$badFormat);
 // Landing addresses follow the owner's store.
 $integration=Support::uuid();Database::query('INSERT INTO integrations(id,user_id,name,token_ciphertext) VALUES(?,?,?,?)',[$integration,$a,'Store fixture',Crypto::encrypt('non-production-test-token',$integration.':'.$a)]);
 $product=['id'=>9301,'name'=>'Producto tienda','description'=>'<p>Texto de prueba suficiente para publicar</p>','images'=>['https://example.test/9301.jpg'],'price'=>10000,'suggestedPrice'=>20000,'stock'=>5,'categories'=>[],'sku'=>'T9301'];
 $pid=Support::uuid();Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[$pid,$a,$integration,9301,'{}',Support::json($product)]);
 $landing=Landing::create(['id'=>$pid,'mapped_data'=>Support::json($product)],$a);
 Landing::publish(Database::one('SELECT * FROM landing_pages WHERE id=?',[$landing['id']]));
 $row=Database::one('SELECT * FROM landing_pages WHERE id=?',[$landing['id']]);
 check('landing payload carries its store URL',Store::decorate($row)['public_url']==='https://ana-test.tinbana.com/p/'.$row['published_slug']);
 check('lead URL uses the owner store',Leads::productData($row)['landing_url']==='https://ana-test.tinbana.com/p/'.$row['published_slug']);
 Store::save($a,['subdomain'=>null]);
 check('clearing the store returns landings to the normal link',Store::subdomainOf($a)===null&&Leads::productData($row)['landing_url']==='https://tinbana.com/p/'.$row['published_slug']&&Store::owner('ana-test')===null);
 check('a released name can be taken by another user',Store::save($b,['subdomain'=>'ana-test'])['store']['subdomain']==='ana-test');
 $_ENV['APP_URL']='http://127.0.0.1:8081';rejects('no store names without a public domain',fn()=>Store::save($a,['subdomain'=>'otra-tienda']));
 check('clearing still works without a public domain',Store::save($a,['subdomain'=>null])['store']['subdomain']===null);
}finally{foreach([$a,$b] as $id)Database::query('DELETE FROM users WHERE id=?',[$id]);}
echo "OK $passed checks\n";
