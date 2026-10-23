<?php
declare(strict_types=1);
// Explicitly isolated PostgreSQL database; fixtures are not part of the product.
$root=dirname(__DIR__,2);$configPath=$root.'/.tools/test-env.json';
if(!is_file($configPath))throw new RuntimeException('Create .tools/test-env.json for the isolated local test database.');
foreach(json_decode(file_get_contents($configPath),true,512,JSON_THROW_ON_ERROR) as $k=>$v)$_ENV[$k]=(string)$v;
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Database,Crypto,Product,Landing};
if(!str_ends_with(Support::env('DB_DATABASE'),'_test')||!in_array(Support::env('DB_HOST'),['127.0.0.1','localhost'],true))throw new RuntimeException('Fixture database must be localhost and end with _test.');
$file=$root.'/.tools/test-fixture.json';
if(($argv[1]??'')==='cleanup'){
 if(is_file($file)){$fixture=json_decode(file_get_contents($file),true);$ids=[$fixture['owner'],$fixture['otherOwner']];foreach($ids as $id){foreach(Database::all('SELECT id FROM media_assets WHERE user_id=?',[$id]) as $asset){$path=App\Media::path($asset['id']);if(is_file($path))unlink($path);}Database::query('DELETE FROM leads WHERE user_id=?',[$id]);Database::query('DELETE FROM users WHERE id=?',[$id]);}Database::query('DELETE FROM rate_limits');unlink($file);echo "Test fixtures removed.\n";}exit;
}
if(is_file($file))throw new RuntimeException('Fixtures already exist; cleanup first.');
$owner=Support::uuid();$other=Support::uuid();$password=bin2hex(random_bytes(24));$tag=substr(str_replace('-','',$owner),0,12);$email='test-'.$tag.'@example.test';$otherEmail='other-'.$tag.'@example.test';
foreach([[$owner,$email],[$other,$otherEmail]] as [$id,$mail])Database::query('INSERT INTO users(id,email,password_hash,email_verified_at) VALUES(?,?,?,now())',[$id,$mail,password_hash($password,PASSWORD_DEFAULT)]);
$integration=Support::uuid();$token='non-production-test-token-'.bin2hex(random_bytes(10));Database::query('INSERT INTO integrations(id,user_id,name,token_ciphertext) VALUES(?,?,?,?)',[$integration,$owner,'Integration fixture',Crypto::encrypt($token,$integration.':'.$owner)]);
$raw=['id'=>987654321,'name'=>'Producto de prueba HTTP','description'=>'<p>Descripción real del fixture de pruebas.</p>','sale_price'=>'12345','suggested_price'=>'20000','sku'=>'TEST-HTTP','gallery'=>[['main'=>true,'urlS3'=>'https://example.test/test-image.jpg']],'warehouse_product'=>[['stock'=>1]],'user'=>['store_name'=>'Proveedor interno fixture']];$mapped=Product::map($raw);$product=Support::uuid();
Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[$product,$owner,$integration,$raw['id'],Support::json($raw),Support::json($mapped)]);
$p=Database::one('SELECT * FROM selected_products WHERE id=?',[$product]);$landing=Landing::create($p,$owner);
$duplicatePrevented=false;try{Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[Support::uuid(),$owner,$integration,$raw['id'],Support::json($raw),Support::json($mapped)]);}catch(PDOException $e){$duplicatePrevented=in_array($e->getCode(),['23505','23000'],true);}if(!$duplicatePrevented)throw new RuntimeException('Product uniqueness failed.');
$crossOwnerPrevented=false;try{Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[Support::uuid(),$other,$integration,123,'{}','{}']);}catch(PDOException $e){$crossOwnerPrevented=in_array($e->getCode(),['23503','23000'],true);}if(!$crossOwnerPrevented)throw new RuntimeException('Cross-owner FK failed.');
file_put_contents($file,Support::json(['owner'=>$owner,'otherOwner'=>$other,'email'=>$email,'otherEmail'=>$otherEmail,'password'=>$password,'integration'=>$integration,'product'=>$product,'landing'=>$landing['id'],'slug'=>$landing['slug']]));
echo "Isolated fixtures created. Uniqueness and cross-owner foreign key checked. Runtime-generated passwords not printed.\n";
