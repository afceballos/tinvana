<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
use App\DropiShipping;
$passed=0;
function check(string $name,bool $condition): void {global $passed;if(!$condition)throw new RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
// Shape copied from the real production probe of 2026-10-23 (Cali -> Bogota, cash on delivery).
$objects=[
 ['transportadora'=>'VELOCES','transportadora_id'=>6,'objects'=>['precioEnvio'=>16450]],
 ['transportadora'=>'ENVIA','transportadora_id'=>2,'objects'=>['precioEnvio'=>16164]],
 ['transportadora'=>'INTERRAPIDISIMO','transportadora_id'=>3,'error'=>'No se puede crear una orden menor a $45.000 COP.'],
 ['transportadora'=>'DOMINA','transportadora_id'=>4,'objects'=>['precioEnvio'=>20188.6]],
 ['transportadora'=>'99MINUTOS','transportadora_id'=>7,'error'=>'Debes enviar la bodega remitente 99minutos'],
 ['transportadora'=>'BROKEN','objects'=>['precioEnvio'=>0]],
];
$q=DropiShipping::pick($objects);
check('cheapest carrier without error',$q['carrier']==='ENVIA'&&$q['carrier_id']===2&&$q['raw']===16164.0);
check('rounded up to the next thousand',$q['amount']===17000);
check('exact thousands stay',DropiShipping::pick([['transportadora'=>'X','objects'=>['precioEnvio'=>15000]]])['amount']===15000);
check('decimals round up',DropiShipping::pick([['transportadora'=>'X','objects'=>['precioEnvio'=>15000.4]]])['amount']===16000);
check('only errors means no quote',DropiShipping::pick([$objects[2],$objects[4]])===null);
check('garbage entries ignored',DropiShipping::pick(['x',null,['objects'=>'y']])===null);
check('5-digit DIVIPOLA becomes 8-digit DANE',DropiShipping::dane('11001')==='11001000'&&DropiShipping::dane('76001000')==='76001000'&&DropiShipping::dane('1100')===null);
check('origin from first warehouse city',DropiShipping::origin(['warehouse_product'=>[['warehouse'=>['city'=>['cod_dane'=>'76001000']]]]])==='76001000');
check('no warehouse means no origin',DropiShipping::origin(['warehouse_product'=>[]])===null);
echo "Dropi shipping checks: $passed\n";
