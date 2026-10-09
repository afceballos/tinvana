<?php
declare(strict_types=1);
// Test-only session fixture. Never route or deploy this directory publicly.
$root=dirname(__DIR__,2);foreach(json_decode(file_get_contents($root.'/.tools/test-env.json'),true) as $k=>$v)$_ENV[$k]=(string)$v;
require dirname(__DIR__).'/bootstrap.php';
use App\Support;
if(Support::env('DB_DATABASE')!=='zenzales_test'||Support::env('DB_HOST')!=='127.0.0.1')throw new RuntimeException('Only the isolated test database is allowed.');
$fixture=json_decode(file_get_contents($root.'/.tools/test-fixture.json'),true);$sid=trim(file_get_contents($root.'/.tools/test-session.txt'));
if(!preg_match('/^[a-zA-Z0-9,-]+$/',$sid))throw new RuntimeException('Invalid test session ID.');
session_save_path(dirname(__DIR__).'/storage/sessions');session_id($sid);session_start();if(($_SESSION['user_id']??'')!==$fixture['owner'])throw new RuntimeException('Test session owner mismatch.');
$_SESSION['catalog_pages'][$fixture['integration']]=[['at'=>time(),'objects'=>[['id'=>987654322,'name'=>'Producto seleccionado por API','description'=>'<p>Dato recibido en página de prueba.</p>','sale_price'=>'9000','suggested_price'=>'18000','sku'=>'TEST-SELECT','gallery'=>[],'warehouse_product'=>[]]]]];
session_write_close();echo "Test catalog session cache seeded.\n";
