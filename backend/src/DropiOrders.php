<?php
declare(strict_types=1);
namespace App;

/** Preflight only. No guessed supplier endpoint, login or outbound write. */
final class DropiOrders {
 public static function readiness(array $r): array {
  $p=ProductOffers::forOrder($r);$address=json_decode($r['delivery_address'],true);$mapped=json_decode($p['mapped_data'],true);$variants=ProductOffers::variants($p);$variant=json_decode($r['variant_data']??'null',true);$variantValid=!$variants&&strtoupper((string)($mapped['type']??''))!=='VARIABLE';
  foreach($variants as $v)if($variant&&$v['id']===($variant['id']??null))$variantValid=true;
  $configured=(bool)Database::one('SELECT id FROM integrations WHERE id=? AND user_id=?',[$p['integration_id'],$r['user_id']]);
  $checks=[
   ['key'=>'integration','label'=>'Integración del catálogo configurada','ready'=>$configured],
   ['key'=>'buyer_acceptance','label'=>'Aceptación local del comprador registrada','ready'=>$r['sale_status']==='confirmed'&&$r['confirmation']!==null],
   ['key'=>'quote','label'=>'Cotización vigente con precio y envío','ready'=>$r['quote_id']!==null&&$r['quote_expires_at']!==null&&strtotime($r['quote_expires_at'])>time()&&$r['shipping_price']!==null],
   ['key'=>'address','label'=>'Dirección de Colombia con códigos locales','ready'=>($address['country_code']??'')==='CO'&&!empty($address['department_code'])&&!empty($address['city_code'])&&!empty($address['address'])],
   ['key'=>'variant','label'=>'Variante del catálogo seleccionada cuando aplica','ready'=>$variantValid],
   ['key'=>'official_contract','label'=>'Endpoints y autenticación de órdenes confirmados por Dropi','ready'=>false],
   ['key'=>'supplier_validation','label'=>'Stock, cobertura y flete verificados con Dropi','ready'=>false],
   ['key'=>'safe_submission','label'=>'Idempotencia y conciliación externas probadas','ready'=>false]
  ];
  return ['mode'=>'preparation_only','can_submit'=>false,'checks'=>$checks,'message'=>'La preparación local no acredita acceso a la API de órdenes. No se enviarán pedidos hasta validar el contrato oficial y las pruebas de integración.'];
 }
}
