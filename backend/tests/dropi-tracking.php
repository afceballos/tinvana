<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
use App\{DropiTracking,MySqlDialect};
$passed=0;
function check(string $name,bool $condition): void {global $passed;if(!$condition)throw new RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
// Shape of GET orders/myorders/{id} from the production probe of 2026-10-23 (buyer fields present on purpose).
$raw=['id'=>94229877,'name'=>'Ana','surname'=>'Pérez','phone'=>'3001234567','dir'=>'Calle 1','client_email'=>'ana@example.test','status'=>'GUIA_GENERADA','shipping_guide'=>'240012345','shipping_company'=>'VELOCES','shipping_amount'=>'16450.00','novedad_servientrega'=>'','updated_at'=>'2026-10-24T09:10:00',
 'history'=>[['id'=>2,'status'=>'GUIA_GENERADA','created_at'=>'2026-10-24T09:10:00','novedad_servientrega'=>null,'notes'=>'  Despacho programado mañana  ','user'=>['name'=>'Operador']],['id'=>1,'status'=>'PENDIENTE CONFIRMACION','created_at'=>'2026-10-23T15:48:57','novedad_servientrega'=>'']],
 'distribution_company'=>['id'=>6,'name'=>'VELOCES']];
$t=DropiTracking::extract($raw);
check('status, carrier, guide and Dropi freight extracted',$t['status']==='GUIA_GENERADA'&&$t['carrier']==='VELOCES'&&$t['guide']==='240012345'&&$t['shipping_amount']===16450.0);
check('history sorted oldest first with Colombia time zone',count($t['history'])===2&&$t['history'][0]['status']==='PENDIENTE CONFIRMACION'&&$t['history'][0]['at']==='2026-10-23T15:48:57-05:00');
check('Dropi notes kept per history entry',$t['history'][1]['note']==='Despacho programado mañana'&&$t['history'][0]['note']===null);
check('empty novelty becomes null',$t['novelty']===null&&$t['history'][0]['novelty']===null);
check('buyer data is not kept',!str_contains(json_encode($t),'Ana')&&!str_contains(json_encode($t),'3001234567')&&!str_contains(json_encode($t),'Calle 1')&&!str_contains(json_encode($t),'Operador'));
check('carrier falls back to distribution company',DropiTracking::extract(['distribution_company'=>['name'=>'ENVIA']])['carrier']==='ENVIA');
check('missing fields stay null',DropiTracking::extract([])===['status'=>null,'carrier'=>null,'guide'=>null,'shipping_amount'=>null,'novelty'=>null,'history'=>[],'updated_at'=>null]);
check('final statuses stop polling',DropiTracking::final('ENTREGADO')&&DropiTracking::final('CANCELADO')&&DropiTracking::final('DEVOLUCION')&&!DropiTracking::final('PENDIENTE CONFIRMACION')&&!DropiTracking::final('GUIA_GENERADA')&&!DropiTracking::final(null));
$sql=MySqlDialect::sql("SELECT * FROM orders WHERE integration_status='sent' AND dropi_order_id IS NOT NULL AND (dropi_synced_at IS NULL OR dropi_synced_at<now()-interval '10 minutes') ORDER BY dropi_synced_at IS NOT NULL, dropi_synced_at LIMIT 40");
check('sync query translates for MySQL/MariaDB',str_contains($sql,'DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 10 MINUTE)'));
$L=fn($s,$n=null)=>DropiTracking::logistics($s,$n);
check('Dropi statuses map to Tinvana logistics',$L('PENDIENTE CONFIRMACION')==='pending'&&$L('PENDIENTE')==='pending'&&$L('GUIA_GENERADA')==='guide_generated'&&$L('EN TRANSITO')==='in_transit'&&$L('EN REPARTO')==='in_transit'&&$L('ENTREGADO')==='delivered'&&$L('DEVOLUCION')==='returned'&&$L('CANCELADO')==='cancelled'&&$L('RECHAZADO')==='cancelled');
check('novelty wins over transit',$L('NOVEDAD')==='novelty'&&$L('EN TRANSITO','Dirección incompleta')==='novelty');
check('unknown status does not invent a logistics state',$L('ALGO NUEVO')===null&&$L(null)===null);
echo "Dropi tracking checks: $passed\n";
