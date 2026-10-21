<?php
$root=dirname(__DIR__,2);foreach(json_decode(file_get_contents($root.'/.tools/test-env.json'),true) as $k=>$v)$_ENV[$k]=(string)$v;
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Database,Product};
if(Support::env('DB_DATABASE')!=='zenzales_test'||Support::env('DB_HOST')!=='127.0.0.1')throw new RuntimeException('Only isolated test database allowed.');
$f=json_decode(file_get_contents($root.'/.tools/test-fixture.json'),true);$integration=Database::one('SELECT id FROM integrations WHERE user_id=?',[$f['otherOwner']]);
$raw=['id'=>999998,'name'=>'Other account product','description'=>'Other account description'];
Database::query('INSERT INTO selected_products(id,user_id,integration_id,dropi_id,original_data,mapped_data) VALUES(?,?,?,?,?::jsonb,?::jsonb)',[Support::uuid(),$f['otherOwner'],$integration['id'],$raw['id'],Support::json($raw),Support::json(Product::map($raw))]);
echo "Isolated other account selection created.\n";
