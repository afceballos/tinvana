<?php
declare(strict_types=1);
namespace App;

/**
 * Approved product sheets for the WhatsApp agent: what it may say, FAQs, the price and promotions it may mention,
 * and what it must not promise. One editable draft per product; approving it creates a new numbered version.
 * The agent only sells products with an approved sheet. An AI draft can be proposed, but a person approves it.
 */
final class WhatsAppSheets {
 private static function text(mixed $v,int $max,string $label): string {
  if($v===null)$v='';if(!is_string($v))throw new HttpError(422,'Texto inválido en «'.$label.'».');$v=trim($v);
  if(mb_strlen($v)>$max)throw new HttpError(422,'«'.$label.'» admite hasta '.$max.' caracteres.');return $v;
 }
 public static function clean(mixed $b): array {
  if(!is_array($b))throw new HttpError(422,'Ficha inválida.');
  $faq=[];foreach(is_array($b['faq']??null)?$b['faq']:[] as $i=>$f){
   if(!is_array($f))continue;$q=self::text($f['q']??'',200,'Pregunta '.($i+1));$a=self::text($f['a']??'',500,'Respuesta '.($i+1));
   if($q===''&&$a==='')continue;if($q===''||$a==='')throw new HttpError(422,'Cada pregunta frecuente necesita pregunta y respuesta.');$faq[]=['q'=>$q,'a'=>$a];
  }
  if(count($faq)>12)throw new HttpError(422,'Máximo 12 preguntas frecuentes.');
  $c=['summary'=>self::text($b['summary']??'',600,'Resumen'),'can_say'=>self::text($b['can_say']??'',1500,'Qué puede decir'),'price_note'=>self::text($b['price_note']??'',300,'Precio y promociones que puede mencionar'),'faq'=>$faq,'must_not'=>self::text($b['must_not']??'',800,'Qué no debe prometer')];
  return $c;
 }
 private static function product(string $owner,string $id): array {
  $p=ProductOffers::product($owner,$id);$m=json_decode((string)$p['mapped_data'],true);
  return ['row'=>$p,'name'=>is_string($m['name']??null)?$m['name']:'Producto','mapped'=>is_array($m)?$m:[]];
 }
 private static function rows(string $owner,string $productId): array {
  return Database::all('SELECT * FROM whatsapp_product_sheets WHERE user_id=? AND selected_product_id=? ORDER BY version DESC',[$owner,$productId]);
 }
 private static function view(array $r): array {
  return ['id'=>$r['id'],'version'=>(int)$r['version'],'status'=>$r['status'],'content'=>json_decode((string)$r['content'],true),'approved_at'=>$r['approved_at'],'updated_at'=>$r['updated_at']];
 }
 /** The latest approved sheet of a product, or null. */
 public static function approved(string $owner,string $productId): ?array {
  $r=Database::one("SELECT * FROM whatsapp_product_sheets WHERE user_id=? AND selected_product_id=? AND status='approved' ORDER BY version DESC LIMIT 1",[$owner,$productId]);
  return $r?self::view($r):null;
 }
 /** Products the agent may sell: id, name and approved version. */
 public static function sellable(string $owner): array {
  $out=[];
  foreach(Database::all("SELECT s.selected_product_id,MAX(s.version) AS version FROM whatsapp_product_sheets s WHERE s.user_id=? AND s.status='approved' GROUP BY s.selected_product_id",[$owner]) as $r){
   $p=Database::one('SELECT mapped_data FROM selected_products WHERE id=? AND user_id=?',[$r['selected_product_id'],$owner]);if(!$p)continue;
   $m=json_decode((string)$p['mapped_data'],true);$out[]=['id'=>$r['selected_product_id'],'name'=>mb_substr(is_string($m['name']??null)?$m['name']:'Producto',0,160),'version'=>(int)$r['version']];
  }
  return $out;
 }
 public static function list(string $owner): array {
  $products=Database::all('SELECT id,mapped_data,created_at FROM selected_products WHERE user_id=? ORDER BY created_at DESC LIMIT 200',[$owner]);
  $sheets=[];foreach(Database::all('SELECT selected_product_id,version,status,updated_at FROM whatsapp_product_sheets WHERE user_id=? ORDER BY version',[$owner]) as $s){
   $k=$s['selected_product_id'];$sheets[$k]??=['approved'=>null,'draft'=>false,'updated_at'=>null];
   if($s['status']==='approved')$sheets[$k]['approved']=(int)$s['version'];else $sheets[$k]['draft']=true;$sheets[$k]['updated_at']=$s['updated_at'];
  }
  return ['products'=>array_map(function($p)use($sheets){$m=json_decode((string)$p['mapped_data'],true);$s=$sheets[$p['id']]??['approved'=>null,'draft'=>false,'updated_at'=>null];
   return ['id'=>$p['id'],'name'=>is_string($m['name']??null)?$m['name']:'Producto','image'=>is_string($m['images'][0]??null)?$m['images'][0]:null,'approved_version'=>$s['approved'],'has_draft'=>$s['draft'],'updated_at'=>$s['updated_at']];},$products)];
 }
 /** Product, its current draft (or a copy of the approved sheet to edit) and the approved version. */
 public static function get(string $owner,string $productId): array {
  $p=self::product($owner,$productId);$rows=self::rows($owner,$productId);
  $draft=null;$approved=null;foreach($rows as $r){if($r['status']==='draft'&&!$draft)$draft=self::view($r);if($r['status']==='approved'&&!$approved)$approved=self::view($r);}
  $empty=['summary'=>'','can_say'=>'','price_note'=>'','faq'=>[],'must_not'=>''];
  return ['product'=>['id'=>$productId,'name'=>$p['name'],'description'=>mb_substr(strip_tags((string)($p['mapped']['description']??'')),0,1500)],
   'draft'=>$draft,'approved'=>$approved,'editing'=>$draft['content']??$approved['content']??$empty];
 }
 public static function saveDraft(string $owner,string $productId,array $b): array {
  self::product($owner,$productId);$content=Support::json(self::clean($b['content']??null));
  $db=Database::connection();$db->beginTransaction();
  try{
   $draft=Database::one("SELECT id FROM whatsapp_product_sheets WHERE user_id=? AND selected_product_id=? AND status='draft' FOR UPDATE",[$owner,$productId]);
   if($draft)Database::query('UPDATE whatsapp_product_sheets SET content=?::jsonb,updated_at=now() WHERE id=?',[$content,$draft['id']]);
   else{
    $next=(int)(Database::one('SELECT MAX(version) AS v FROM whatsapp_product_sheets WHERE selected_product_id=? AND user_id=?',[$productId,$owner])['v']??0)+1;
    Database::query("INSERT INTO whatsapp_product_sheets(id,user_id,selected_product_id,version,status,content) VALUES(?,?,?,?,'draft',?::jsonb)",[Support::uuid(),$owner,$productId,$next,$content]);
   }
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  return self::get($owner,$productId);
 }
 /** Approving freezes the draft as a new version; earlier versions stay for the history of past conversations. */
 public static function approve(string $owner,string $productId): array {
  self::product($owner,$productId);
  $draft=Database::one("SELECT * FROM whatsapp_product_sheets WHERE user_id=? AND selected_product_id=? AND status='draft'",[$owner,$productId]);
  if(!$draft)throw new HttpError(409,'No hay cambios por aprobar. Guarda primero el borrador.');
  $c=json_decode((string)$draft['content'],true);
  if(($c['summary']??'')===''&&($c['can_say']??'')==='')throw new HttpError(422,'Escribe al menos el resumen o qué puede decir el agente antes de aprobar.');
  Database::query("UPDATE whatsapp_product_sheets SET status='approved',approved_at=now(),updated_at=now() WHERE id=?",[$draft['id']]);
  return self::get($owner,$productId);
 }
 /** AI proposal built only from the product copy; it is saved as a draft and never approved automatically. */
 public static function generate(string $owner,string $productId): array {
  Entitlements::require($owner,'ai');
  $p=self::product($owner,$productId);$credentials=AiConnections::credentials($owner);
  $schema=['type'=>'object','additionalProperties'=>false,'required'=>['summary','can_say','faq','must_not'],'properties'=>[
   'summary'=>['type'=>'string'],'can_say'=>['type'=>'string'],'must_not'=>['type'=>'string'],
   'faq'=>['type'=>'array','items'=>['type'=>'object','additionalProperties'=>false,'required'=>['q','a'],'properties'=>['q'=>['type'=>'string'],'a'=>['type'=>'string']]]]]];
  $instructions='Eres editor de fichas de producto para un vendedor por WhatsApp en Colombia. Escribe en español neutro y claro. '
   .'Usa SOLO la información del producto recibido; no inventes medidas, materiales, garantías, tiempos de entrega ni precios. '
   .'summary: 2 o 3 frases. can_say: viñetas cortas con beneficios y características verificables. '
   .'faq: hasta 6 preguntas que haría un cliente, respondidas solo con la información disponible. '
   .'must_not: lo que el vendedor no debe prometer (por ejemplo resultados no comprobados, tiempos exactos de entrega o descuentos no autorizados).';
  $input=['product'=>['name'=>$p['name'],'description'=>mb_substr(strip_tags((string)($p['mapped']['description']??'')),0,3000)]];
  $r=AiClient::structured($instructions,'whatsapp_product_sheet',$schema,$input,$credentials,1500,45);
  $d=$r['proposal'];$cut=fn($v,$n)=>mb_substr(is_string($v)?trim($v):'',0,$n);
  $faq=[];foreach(array_slice(is_array($d['faq']??null)?$d['faq']:[],0,12) as $f)if(is_array($f)&&$cut($f['q']??'',200)!==''&&$cut($f['a']??'',500)!=='')$faq[]=['q'=>$cut($f['q'],200),'a'=>$cut($f['a'],500)];
  return self::saveDraft($owner,$productId,['content'=>['summary'=>$cut($d['summary']??'',600),'can_say'=>$cut($d['can_say']??'',1500),'price_note'=>'','faq'=>$faq,'must_not'=>$cut($d['must_not']??'',800)]])+['usage'=>$r['usage']];
 }
}
