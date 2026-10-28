<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
use App\DropiOrders;
$passed=0;
function check(string $name,bool $condition): void {global $passed;if(!$condition)throw new RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
// Test fixtures only: rows shaped like the orders and selected_products tables, no database access.
$raw=['id'=>4321,'name'=>'Nombre Dropi','type'=>'VARIABLE','sale_price'=>'30000','user_id'=>77,'user'=>['id'=>77,'store_name'=>'Proveedor'],'variations'=>[['id'=>991,'name'=>'Rojo']]];
$product=['original_data'=>json_encode($raw),'mapped_data'=>json_encode(['name'=>'Nombre comercial','type'=>'VARIABLE'])];
$order=['id'=>'0f1e2d3c-1111-4222-8333-444455556666','quantity'=>2,'unit_price'=>'50000.25','shipping_price'=>'12000.10',
 'customer'=>json_encode(['first_name'=>'Ana','last_name'=>'Pérez','email'=>'ana@example.test','phone'=>'+573001234567']),
 'delivery_address'=>json_encode(['country_code'=>'CO','department_code'=>'76','state'=>'Valle Del Cauca','city_code'=>'76001','city'=>'Santiago De Cali','address'=>'Calle 5 # 10-20','address_details'=>'Apto 301']),
 'variant_data'=>json_encode(['id'=>'991','label'=>'Rojo'])];
$p=DropiOrders::payload($order,$product);
check('collected total includes shipping',$p['total_order']===112000.6);
check('line price folds shipping like the plugin',$p['products'][0]['price']===56000.3&&$p['products'][0]['quantity']===2);
check('line keeps Dropi product id',$p['products'][0]['id']===4321);
check('commercial name sent',$p['products'][0]['name']==='Nombre comercial');
check('variation id sent as integer',$p['products'][0]['variation_id']===991);
check('supplier from product owner',$p['supplier_id']===77);
check('pending confirmation and cash on delivery',$p['status']==='PENDIENTE CONFIRMACION'&&$p['rate_type']==='CON RECAUDO'&&$p['type']==='FINAL_ORDER');
check('Colombian phone without country code',$p['phone']==='3001234567');
check('address joins details',$p['dir']==='Calle 5 # 10-20 Apto 301');
check('department and city mapped to plugin names',$p['state']==='VAC'&&$p['city']==='Cali');
check('notes carry reference and variant, not internal notes',$p['notes']==='Tinbana 0f1e2d3c. Variante: Rojo');
$bogota=DropiOrders::location(['department_code'=>'11','city_code'=>'11001','state'=>'Bogotá, D.C.','city'=>'Bogotá, D.C.']);
check('Bogota mapped under Cundinamarca',$bogota===['state'=>'CUN','city'=>'Bogota']);
$fallback=DropiOrders::location(['department_code'=>'00','city_code'=>'00000','state'=>'X','city'=>'Y']);
check('unknown codes fall back to DANE names',$fallback===['state'=>'X','city'=>'Y']);
$simple=$order;$simple['variant_data']=null;$simple['quantity']=1;
check('no variation id without variant',!isset(DropiOrders::payload($simple,$product)['products'][0]['variation_id']));

$opt=DropiOrders::payload($simple,$product,['confirmed'=>true]);
check('confirmed option sends the confirmed status',$opt['status']==='PENDIENTE');
check('defaults stay pending confirmation',DropiOrders::payload($simple,$product)['status']==='PENDIENTE CONFIRMACION');
$c=fn(?string $body,int $status,int $errno=0)=>DropiOrders::classify($body,$status,$errno,'secret-token');
$r=$c('{"isSuccess":true,"objects":{"id":123456}}',200);check('success with id is sent',$r['outcome']==='sent'&&$r['dropi_order_id']==='123456');
$r=$c('{"isSuccess":true,"objects":[{"id":"98"}]}',201);check('list response accepted',$r['outcome']==='sent'&&$r['dropi_order_id']==='98');
check('success without id is unknown',$c('{"isSuccess":true,"objects":{}}',200)['outcome']==='unknown');
$r=$c('{"isSuccess":false,"message":"Ciudad no encontrada secret-token"}',200);check('business rejection is failed',$r['outcome']==='failed'&&str_contains($r['message'],'Ciudad no encontrada'));
check('token redacted from messages',!str_contains($r['message'],'secret-token'));
check('401 is failed',$c('{"message":"Unauthorized"}',401)['outcome']==='failed');
check('422 is failed',$c('{"isSuccess":false}',422)['outcome']==='failed');
check('500 is unknown',$c('{"isSuccess":false}',500)['outcome']==='unknown');
check('gateway HTML is unknown',$c('<html>bad gateway</html>',502)['outcome']==='unknown');
check('timeout is unknown',$c(null,0,CURLE_OPERATION_TIMEDOUT)['outcome']==='unknown');
check('connection refused is failed',$c(null,0,CURLE_COULDNT_CONNECT)['outcome']==='failed');
check('DNS failure is failed',$c(null,0,CURLE_COULDNT_RESOLVE_HOST)['outcome']==='failed');
check('2xx non JSON is unknown',$c('ok',200)['outcome']==='unknown');
echo "Dropi order checks: $passed\n";
