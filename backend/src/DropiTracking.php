<?php
declare(strict_types=1);
namespace App;

/**
 * Dropi order tracking, read-only: GET orders/myorders/{id} (contract confirmed with dropi:order-probe on 2026-10-23).
 * Stores status, carrier, guide, Dropi freight, novelty and the status history; never changes the order in Dropi
 * (PUT on that route generates the guide and is not used). Status changes are also written to the Tinvana history.
 */
final class DropiTracking {
 public const URL='https://api.dropi.co/integrations/orders/myorders/';
 private const STALE_SECONDS=600;

 private static function base(): string {
  $url=Support::env('DROPI_TRACKING_URL');
  if($url!==''&&Support::env('APP_ENV')!=='production'&&preg_match('~^https://127\.0\.0\.1:[0-9]{2,5}/[A-Za-z0-9/]*/$~D',$url))return $url;
  return self::URL;
 }
 /** Delivered, cancelled or returned orders are not polled again. */
 public static function final(?string $status): bool {return $status!==null&&(bool)preg_match('/ENTREGAD|CANCELAD|DEVOLUCI|DEVUELT|RECHAZAD/i',$status);}
 /** Tinvana logistics state for a Dropi status; null for statuses we do not recognise (the raw status is still shown). */
 public static function logistics(?string $status,?string $novelty=null): ?string {
  if($status===null)return null;$u=strtoupper(str_replace('_',' ',$status));
  return match(true){
   (bool)preg_match('/CANCELAD|RECHAZAD/',$u)=>'cancelled',
   str_contains($u,'ENTREGAD')=>'delivered',
   (bool)preg_match('/DEVOLUCI|DEVUELT/',$u)=>'returned',
   str_contains($u,'NOVEDAD')||($novelty!==null&&$novelty!=='')=>'novelty',
   (bool)preg_match('/TRANSITO|TRÁNSITO|REPARTO|DESPACHAD|RECOGID|EN CAMINO|EN RUTA|BODEGA DESTINO|EN CENTRO/',$u)=>'in_transit',
   str_contains($u,'GUIA')||str_contains($u,'GUÍA')=>'guide_generated',
   (bool)preg_match('/PENDIENTE|PREPARAC|CONFIRMAD/',$u)=>'pending',
   default=>null,
  };
 }
 /** Dropi dates come without zone and match Colombia local time. */
 private static function date(mixed $v): ?string {
  if(!is_string($v)||!preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/',$v))return null;
  try{return (new \DateTimeImmutable(str_replace(' ','T',substr($v,0,19)),new \DateTimeZone('America/Bogota')))->format(DATE_ATOM);}catch(\Throwable){return null;}
 }
 private static function text(mixed $v,int $max=160): ?string {return is_string($v)&&trim($v)!==''?mb_substr(trim($v),0,$max):null;}
 /** Only logistics facts; buyer data in the Dropi response is ignored. */
 public static function extract(array $o): array {
  $history=[];
  foreach(is_array($o['history']??null)?$o['history']:[] as $h){
   if(!is_array($h)||!($status=self::text($h['status']??null,64)))continue;
   $history[]=['status'=>$status,'at'=>self::date($h['created_at']??null),'novelty'=>self::text($h['novedad_servientrega']??null)];
  }
  usort($history,fn($a,$b)=>strcmp((string)$a['at'],(string)$b['at']));
  $amount=$o['shipping_amount']??null;
  return ['status'=>self::text($o['status']??null,64),'carrier'=>self::text($o['shipping_company']??null,60)??self::text($o['distribution_company']['name']??null,60),
   'guide'=>self::text($o['shipping_guide']??null,80),'shipping_amount'=>is_numeric($amount)?round((float)$amount,2):null,
   'novelty'=>self::text($o['novedad_servientrega']??null,240),'history'=>array_slice($history,-50),'updated_at'=>self::date($o['updated_at']??null)];
 }
 private static function fetch(array $integration,string $dropiId): ?array {
  try{$token=Crypto::decrypt($integration['token_ciphertext'],$integration['id'].':'.$integration['user_id']);}catch(\Throwable){return null;}
  if($token===''||preg_match('/[\r\n]/',$token))return null;
  $c=curl_init(self::base().$dropiId);
  curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>6,CURLOPT_TIMEOUT=>15,CURLOPT_USERAGENT=>'WordPress/6.5; https://tinbana.com',CURLOPT_HTTPGET=>true,
   CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_HTTPHEADER=>['Accept: application/json','dropi-integration-key: '.$token]]);
  if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($c,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
  $res=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
  $json=$res===false?null:json_decode((string)$res,true);
  if($status<200||$status>=300||!is_array($json)||($json['isSuccess']??false)!==true||!is_array($json['objects']??null)){error_log('Tinvana Dropi tracking failed status='.$status);return null;}
  $o=$json['objects'];if(array_is_list($o))$o=$o[0]??null;
  return is_array($o)&&(string)($o['id']??'')===$dropiId?$o:null;
 }
 /** Syncs one sent order; returns false when Dropi could not be read (nothing is changed then). */
 public static function sync(array $order): bool {
  if(($order['integration_status']??'')!=='sent'||empty($order['dropi_order_id']))return false;
  $product=ProductOffers::forOrder($order);$integration=Database::one('SELECT * FROM integrations WHERE id=? AND user_id=?',[$product['integration_id'],$order['user_id']]);if(!$integration)return false;
  $raw=self::fetch($integration,(string)$order['dropi_order_id']);
  if($raw===null){Database::query('UPDATE orders SET dropi_synced_at=now() WHERE id=?',[$order['id']]);return false;}
  $t=self::extract($raw);$t['synced_at']=gmdate(DATE_ATOM);
  $db=Database::connection();$own=!$db->inTransaction();if($own)$db->beginTransaction();
  try{
   $r=Database::one('SELECT * FROM orders WHERE id=? FOR UPDATE',[$order['id']]);
   Database::query('UPDATE orders SET dropi_status=?,dropi_tracking=?::jsonb,dropi_synced_at=now() WHERE id=?',[$t['status'],Support::json($t),$order['id']]);
   if($t['status']!==null&&$t['status']!==($r['dropi_status']??null))Orders::event($r,'dropi_status_changed',['from'=>$r['dropi_status']??null,'to'=>$t['status'],'guide'=>$t['guide'],'carrier'=>$t['carrier']],null);
   // Mirror Dropi in Tinvana: logistics follows the Dropi status; a cancellation in Dropi cancels the sale here too.
   $logistics=self::logistics($t['status'],$t['novelty']);
   if($logistics!==null&&$logistics!==$r['logistics_status'])Database::query('UPDATE orders SET logistics_status=? WHERE id=?',[$logistics,$order['id']]);
   if($logistics==='cancelled'&&$r['sale_status']!=='cancelled'){
    $c=Database::one("UPDATE orders SET sale_status='cancelled',quote_id=null,quote_expires_at=null,version=version+1,updated_at=now() WHERE id=? RETURNING *",[$order['id']]);
    Orders::event($c,'cancelled',['reason'=>'Cancelado en Dropi ('.$t['status'].').','source'=>'dropi'],null);OrderMail::queue($c,'buyer_cancelled');
   }
   if($own)$db->commit();
  }catch(\Throwable $e){if($own&&$db->inTransaction())$db->rollBack();throw $e;}
  return true;
 }
 /** Cron: sent orders not in a final state (filtered in SQL so they never crowd out active ones) and not synced in the last 10 minutes. */
 public static function syncDue(int $limit=40): array {
  $rows=Database::all("SELECT * FROM orders WHERE integration_status='sent' AND dropi_order_id IS NOT NULL AND (dropi_synced_at IS NULL OR dropi_synced_at<now()-interval '10 minutes') AND (dropi_status IS NULL OR (dropi_status NOT LIKE '%ENTREGAD%' AND dropi_status NOT LIKE '%CANCELAD%' AND dropi_status NOT LIKE '%DEVOLUCI%' AND dropi_status NOT LIKE '%DEVUELT%' AND dropi_status NOT LIKE '%RECHAZAD%')) ORDER BY dropi_synced_at IS NOT NULL, dropi_synced_at LIMIT ".max(1,min(200,$limit)));
  $ok=0;$failed=0;
  foreach($rows as $r){try{self::sync($r)?$ok++:$failed++;}catch(\Throwable $e){error_log('Tinvana Dropi tracking: '.get_class($e));$failed++;}}
  return ['synced'=>$ok,'failed'=>$failed];
 }
 /** Manual refresh from the order detail. */
 public static function refresh(string $owner,string $id): array {
  $r=Orders::owned($owner,$id);
  if($r['integration_status']!=='sent'||empty($r['dropi_order_id']))throw new HttpError(409,'Este pedido todavía no está creado en Dropi.');
  if(!self::sync($r))throw new HttpError(502,'No fue posible consultar la orden en Dropi. Inténtalo de nuevo en unos minutos.');
  return Orders::detail($owner,$id);
 }
}
