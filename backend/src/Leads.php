<?php
declare(strict_types=1);
namespace App;
final class Leads {
 public static function productData(array $landing): array {
  $r=Landing::decode($landing);$c=$r['content'];$p=$r['product_snapshot'];
  return ['product_id'=>$p['id'],'product_name'=>$c['title'],'dropi_product_name'=>$p['name'],
   'sku'=>$p['sku']??null,'dropi_price'=>$p['price']??null,'public_price'=>$c['publicPrice'],
   'inflated_price'=>$c['publicPrice'],'image'=>$c['images'][0]??null,
   'landing_url'=>rtrim(Support::env('APP_URL'),'/').'/p/'.$r['slug'],
   'tags'=>['dropi-product-lead','product-'.$p['id']]];
 }
 public static function validate(array $b): array {
  $key=$b['idempotency_key']??'';if(!is_string($key)||!Support::isUuid($key))throw new HttpError(422,'Identificador de consulta inválido.');
  if(($b['website']??'')!=='')throw new HttpError(422,'No fue posible aceptar la consulta.');
  $first=Support::text($b['first_name']??null,100);$last=Support::text($b['last_name']??null,100);$email=Support::text($b['email']??null,254);$phone=Support::text($b['phone']??null,30);
  if(!filter_var($email,FILTER_VALIDATE_EMAIL)||!preg_match('/^\+?[0-9 ()-]{7,30}$/',$phone)||strlen(preg_replace('/\D/','',$phone))<7)throw new HttpError(422,'Verifica el email y el teléfono.');
  return ['key'=>$key,'first'=>$first,'last'=>$last,'email'=>strtolower($email),'phone'=>$phone];
 }
 public static function save(array $landing,array $b): array {
  $v=self::validate($b);$r=Landing::decode($landing);$c=$r['content'];$p=$r['product_snapshot'];
  $data=self::productData($r);
  $db=Database::connection();$db->beginTransaction();try{
   $lead=Database::one('INSERT INTO leads(id,user_id,landing_page_id,idempotency_key,first_name,last_name,email,phone,product_data) VALUES(?,?,?,?,?,?,?,?,?::jsonb) ON CONFLICT(landing_page_id,idempotency_key) DO NOTHING RETURNING id,status',[Support::uuid(),$r['user_id'],$r['id'],$v['key'],$v['first'],$v['last'],$v['email'],$v['phone'],Support::json($data)]);
   if($lead)Database::query('INSERT INTO webhook_deliveries(id,lead_id) VALUES(?,?)',[Support::uuid(),$lead['id']]);
   else $lead=Database::one('SELECT id,status FROM leads WHERE landing_page_id=? AND idempotency_key=?',[$r['id'],$v['key']]);
   $db->commit();return ['saved'=>true,'delivery_status'=>$lead['status'],'message'=>$lead['status']==='delivered'?'Tu consulta fue guardada y enviada.':'Tu consulta fue guardada. El envío al equipo está pendiente.'];
  }catch(\Throwable $e){$db->rollBack();throw $e;}
 }
 public static function deliver(int $limit=20,?callable $sender=null): array {
  // Injectable transport for isolated tests; HTTP callers cannot supply a sender.
  $sender??=[Webhooks::class,'send'];
  $done=0;$failed=0;
  for($i=0;$i<$limit;$i++){
   $db=Database::connection();$db->beginTransaction();
   $d=Database::one("SELECT d.*,w.user_id AS destination_owner,w.url_ciphertext FROM webhook_deliveries d
    JOIN leads l ON l.id=d.lead_id JOIN webhook_settings w ON w.user_id=l.user_id AND w.enabled=true
    WHERE (d.status='pending' AND d.next_attempt_at<=now()) OR (d.status='processing' AND d.locked_at<now()-interval '5 minutes')
    ORDER BY d.next_attempt_at FOR UPDATE OF d SKIP LOCKED LIMIT 1");
   if(!$d){$db->commit();break;}
   Database::query("UPDATE webhook_deliveries SET status='processing',locked_at=now(),updated_at=now() WHERE id=?",[$d['id']]);$db->commit();
   $l=Database::one('SELECT * FROM leads WHERE id=?',[$d['lead_id']]);$payload=array_merge(json_decode($l['product_data'],true),['lead_id'=>$l['id'],'idempotency_key'=>$l['id'],'first_name'=>$l['first_name'],'last_name'=>$l['last_name'],'email'=>$l['email'],'phone'=>$l['phone']]);
   $payload['dropi_price']??=null;$payload['inflated_price']??=$payload['public_price']??null;
   try{
    $url=Crypto::decrypt($d['url_ciphertext'],'webhook-url:'.$d['destination_owner']);
    $result=$sender($url,$payload,$l['id']);
   }catch(\Throwable){$result=['http'=>0,'ok'=>false,'error'=>'No fue posible preparar el envío del webhook.'];}
   $http=(int)$result['http'];$ok=(bool)$result['ok'];
   $attempt=(int)$d['attempts']+1;$status=$ok?'delivered':($attempt>=8?'failed':'pending');$error=$result['error'];$delay=min(21600,60*(2**min($attempt-1,8)));
   $event=Support::json([['attempt'=>$attempt,'at'=>gmdate('c'),'http_status'=>$http,'error'=>$error,'result'=>$status]]);
   $db->beginTransaction();try{Database::query("UPDATE webhook_deliveries SET attempts=?,status=?,last_http_status=?,last_error=?,history=history||?::jsonb,next_attempt_at=now()+(? * interval '1 second'),locked_at=null,updated_at=now() WHERE id=?",[$attempt,$status,$http,$error,$event,$delay,$d['id']]);Database::query('UPDATE leads SET status=?,updated_at=now() WHERE id=?',[$status==='delivered'?'delivered':($status==='failed'?'failed':'pending'),$l['id']]);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}
   if($ok)$done++;else $failed++;
  }
  $waiting=Database::one("SELECT count(*) AS total FROM webhook_deliveries d JOIN leads l ON l.id=d.lead_id
   LEFT JOIN webhook_settings w ON w.user_id=l.user_id WHERE d.status IN ('pending','processing') AND (w.user_id IS NULL OR w.enabled=false)");
  return ['delivered'=>$done,'pending_or_failed'=>$failed,'waiting_for_configuration'=>(int)$waiting['total']];
 }
}
