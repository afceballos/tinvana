<?php
declare(strict_types=1);
namespace App;

/**
 * WhatsApp offers and Click to WhatsApp ads (stage 4).
 * An offer is a product + units (combos) + a price rule (the product's quantity tiers, current version, or a fixed
 * price) + a code (TB-XXXX) for the ad's default message and the landing WhatsApp button.
 * Identification of each entry, never "the best seller" by default:
 *  1. the ad id Meta sends in `referral.source_id`, looked up in the store's ads (an unknown ad is created unassigned);
 *  2. a verified code from a landing WhatsApp link (code + signature that Tinbana checks);
 *  3. a code typed in the message, taken only as a hint (the agent confirms it with the customer);
 *  4. nothing clear: the agent asks which product.
 * Every entry is stored separately; a new entry never changes a previous order.
 */
final class WhatsAppOffers {
 // New codes start with TB- (Tinbana); TV- codes created before the brand change keep working.
 private const CODE_RE='/\b(T[VB])-([A-Z0-9]{2,12})(?:-([A-Z0-9]{4}))?\b/i';
 public const METHODS=['ad'=>'Identificador del anuncio (Click to WhatsApp)','code_link'=>'Código del botón de WhatsApp de la landing','code_text'=>'Código escrito en el mensaje (indicio)'];

 public static function money(float $v): string {return '$'.number_format($v,0,',','.');}
 private static function flag(mixed $v): bool {return $v===true||(int)$v===1;}
 /** Signature appended to codes in landing links, so a code coming from the landing can be told apart from one typed by hand. */
 public static function signature(string $owner,string $code): string {
  $h=hash_hmac('sha256',$owner.'|'.strtoupper($code),'wa-offer|'.Support::env('TOKEN_ENCRYPTION_KEY'));
  return strtoupper(substr(str_pad(base_convert(substr($h,0,12),16,36),4,'0',STR_PAD_LEFT),0,4));
 }
 private static function productName(string $owner,string $productId): ?string {
  $p=Database::one('SELECT mapped_data FROM selected_products WHERE id=? AND user_id=?',[$productId,$owner]);if(!$p)return null;
  $m=json_decode((string)$p['mapped_data'],true);return mb_substr(is_string($m['name']??null)?$m['name']:'Producto',0,160);
 }
 /** Current price of an offer: tiers use the product's current offer version; fixed uses the stored total. */
 public static function price(array $o): array {
  $units=(int)$o['units'];$unitsText=$units.' '.($units===1?'unidad':'unidades');
  if($o['price_mode']==='fixed'){$t=(float)$o['fixed_price'];return ['total'=>$t,'version'=>null,'text'=>$unitsText.' · '.self::money($t)];}
  $p=Database::one('SELECT * FROM selected_products WHERE id=? AND user_id=?',[$o['selected_product_id'],$o['user_id']]);
  $v=Database::one('SELECT version FROM product_offers WHERE selected_product_id=? AND user_id=?',[$o['selected_product_id'],$o['user_id']]);
  if(!$p||!$v)return ['total'=>null,'version'=>null,'text'=>null];
  try{$r=ProductOffers::resolve($p,(int)$v['version'],$units);}catch(HttpError){return ['total'=>null,'version'=>(int)$v['version'],'text'=>null];}
  $t=(float)$r['unit_price']*$units;return ['total'=>$t,'version'=>(int)$r['version'],'text'=>$unitsText.' · '.self::money($t).' (v'.$r['version'].')'];
 }
 public static function message(array $o): string {return 'Hola, quiero '.$o['name'].' ('.$o['code'].')';}
 public static function view(array $o): array {
  $price=self::price($o);
  return ['id'=>$o['id'],'code'=>$o['code'],'name'=>$o['name'],'product'=>['id'=>$o['selected_product_id'],'name'=>self::productName((string)$o['user_id'],(string)$o['selected_product_id'])],
   'units'=>(int)$o['units'],'price_mode'=>$o['price_mode'],'fixed_price'=>$o['fixed_price']!==null?(float)$o['fixed_price']:null,'landing_default'=>self::flag($o['landing_default']),'status'=>$o['status'],
   'price'=>$price,'label'=>self::productName((string)$o['user_id'],(string)$o['selected_product_id']).' · '.($price['text']??((int)$o['units'].' '.((int)$o['units']===1?'unidad':'unidades').' · precio pendiente')),'message'=>self::message($o)];
 }
 private static function offerRow(string $owner,string $id): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Oferta no encontrada.');
  $o=Database::one('SELECT * FROM whatsapp_offers WHERE id=? AND user_id=?',[$id,$owner]);if(!$o)throw new HttpError(404,'Oferta no encontrada.');return $o;
 }
 private static function adRow(string $owner,string $id): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Anuncio no encontrado.');
  $a=Database::one('SELECT * FROM whatsapp_ads WHERE id=? AND user_id=?',[$id,$owner]);if(!$a)throw new HttpError(404,'Anuncio no encontrado.');return $a;
 }

 public static function list(string $owner): array {
  $offers=array_map(self::view(...),Database::all("SELECT * FROM whatsapp_offers WHERE user_id=? AND status='active' ORDER BY created_at",[$owner]));
  $byId=[];foreach($offers as $o)$byId[$o['id']]=$o;
  $since=(string)Database::timestamp(gmdate('Y-m-d\TH:i:s\Z',time()-7*86400));
  $counts=[];foreach(Database::all('SELECT ad_ref,COUNT(*) AS n FROM whatsapp_entries WHERE user_id=? AND ad_ref IS NOT NULL AND created_at>=? GROUP BY ad_ref',[$owner,$since]) as $r)$counts[$r['ad_ref']]=(int)$r['n'];
  $ads=array_map(function($a)use($byId,$counts){$src=json_decode((string)$a['source'],true);
   return ['id'=>$a['id'],'ad_id'=>$a['ad_id'],'name'=>$a['name'],'status'=>$a['offer_id']&&isset($byId[$a['offer_id']])?$a['status']:'unassigned','origin'=>$a['origin'],
    'offer'=>$a['offer_id']&&isset($byId[$a['offer_id']])?['id'=>$a['offer_id'],'label'=>$byId[$a['offer_id']]['label'],'code'=>$byId[$a['offer_id']]['code']]:null,
    'source'=>is_array($src)?$src:[],'entries_7d'=>$counts[$a['id']]??0,'first_seen_at'=>$a['first_seen_at'],'last_seen_at'=>$a['last_seen_at']];},
   Database::all('SELECT * FROM whatsapp_ads WHERE user_id=? ORDER BY (offer_id IS NULL) DESC,last_seen_at DESC,created_at DESC',[$owner]));
  $products=array_map(fn($p)=>['id'=>$p['id'],'name'=>self::productName($owner,(string)$p['id'])],Database::all('SELECT id FROM selected_products WHERE user_id=? ORDER BY created_at DESC LIMIT 200',[$owner]));
  return ['ads'=>$ads,'offers'=>$offers,'products'=>$products,'unassigned'=>count(array_filter($ads,fn($a)=>$a['status']==='unassigned'))];
 }

 private static function code(string $owner,string $name,int $units,?string $exclude=null): string {
  $base=strtoupper(preg_replace('/[^A-Z0-9]/','',strtoupper(strtr(mb_substr(explode(' ',trim($name))[0]??'OF',0,8),['Á'=>'A','É'=>'E','Í'=>'I','Ó'=>'O','Ú'=>'U','Ñ'=>'N','á'=>'A','é'=>'E','í'=>'I','ó'=>'O','ú'=>'U','ñ'=>'N'])))??'OF');
  $base=substr($base!==''?$base:'OF',0,4).$units;
  for($i=0;$i<50;$i++){$c='TB-'.$base.($i?chr(65+$i%26).($i>=26?intdiv($i,26):''):'');if(!Database::one('SELECT id FROM whatsapp_offers WHERE user_id=? AND code=?'.($exclude?' AND id<>?':''),array_merge([$owner,$c],$exclude?[$exclude]:[])))return $c;}
  return 'TB-'.strtoupper(bin2hex(random_bytes(4)));
 }
 public static function saveOffer(string $owner,?string $id,array $b): array {
  $current=$id?self::offerRow($owner,$id):null;
  $productId=$current?$current['selected_product_id']:($b['product_id']??null);if(!is_string($productId))throw new HttpError(422,'Elige el producto de la oferta.');
  ProductOffers::product($owner,$productId);
  $name=trim(is_string($b['name']??null)?$b['name']:'');if($name===''||mb_strlen($name)>160)throw new HttpError(422,'Escribe un nombre para la oferta (hasta 160 caracteres).');
  $units=$b['units']??null;if(!is_int($units)||$units<1||$units>99)throw new HttpError(422,'Las unidades deben estar entre 1 y 99.');
  $mode=$b['price_mode']??null;if(!in_array($mode,['tiers','fixed'],true))throw new HttpError(422,'Elige cómo se calcula el precio.');
  $fixed=null;if($mode==='fixed'){$f=$b['fixed_price']??null;if(!is_int($f)&&!is_float($f)||$f<0||$f>100000000)throw new HttpError(422,'Escribe el precio total de la oferta.');$fixed=round((float)$f,2);}
  $landing=($b['landing_default']??false)===true;
  $code=$b['code']??null;
  if(is_string($code)&&trim($code)!==''){$code=strtoupper(trim($code));if(!preg_match('/^TB-[A-Z0-9]{2,12}$/D',$code))throw new HttpError(422,'El código debe verse así: TB-PICA1 (letras y números, sin espacios).');
   if(Database::one('SELECT id FROM whatsapp_offers WHERE user_id=? AND code=?'.($current?' AND id<>?':''),array_merge([$owner,$code],$current?[$current['id']]:[])))throw new HttpError(409,'Ya tienes otra oferta con ese código.');}
  else $code=$current['code']??self::code($owner,self::productName($owner,$productId)??$name,$units);
  $db=Database::connection();$db->beginTransaction();
  try{
   if($landing)Database::query('UPDATE whatsapp_offers SET landing_default=0,updated_at=now() WHERE user_id=? AND selected_product_id=?'.($current?' AND id<>?':''),array_merge([$owner,$productId],$current?[$current['id']]:[]));
   if($current){Database::query('UPDATE whatsapp_offers SET code=?,name=?,units=?,price_mode=?,fixed_price=?,landing_default=?,updated_at=now() WHERE id=?',[$code,$name,$units,$mode,$fixed,$landing?1:0,$current['id']]);$id=$current['id'];}
   else{$id=Support::uuid();Database::query('INSERT INTO whatsapp_offers(id,user_id,selected_product_id,code,name,units,price_mode,fixed_price,landing_default) VALUES(?,?,?,?,?,?,?,?,?)',[$id,$owner,$productId,$code,$name,$units,$mode,$fixed,$landing?1:0]);}
   $db->commit();
  }catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  return self::list($owner);
 }
 /** Archived offers stop being offered; past conversations and entries keep their reference. */
 public static function archiveOffer(string $owner,string $id): array {
  $o=self::offerRow($owner,$id);Database::query("UPDATE whatsapp_offers SET status='archived',landing_default=0,updated_at=now() WHERE id=?",[$o['id']]);return self::list($owner);
 }
 private static function adId(mixed $v): string {$v=is_string($v)?trim($v):'';if(!preg_match('/^[0-9]{6,32}$/D',$v))throw new HttpError(422,'El identificador del anuncio son solo números, como aparece en el Administrador de anuncios.');return $v;}
 private static function offerOrNull(string $owner,mixed $id): ?string {
  if($id===null||$id==='')return null;if(!is_string($id))throw new HttpError(422,'Oferta inválida.');
  $o=self::offerRow($owner,$id);if($o['status']!=='active')throw new HttpError(422,'Esa oferta está archivada.');return $o['id'];
 }
 public static function addAd(string $owner,array $b): array {
  $adId=self::adId($b['ad_id']??null);$name=trim(is_string($b['name']??null)?$b['name']:'');if($name===''||mb_strlen($name)>160)throw new HttpError(422,'Escribe un nombre para el anuncio.');
  if(Database::one('SELECT id FROM whatsapp_ads WHERE user_id=? AND ad_id=?',[$owner,$adId]))throw new HttpError(409,'Ese anuncio ya está en la lista.');
  Database::query("INSERT INTO whatsapp_ads(id,user_id,ad_id,name,offer_id,origin,source) VALUES(?,?,?,?,?,'manual',?::jsonb)",[Support::uuid(),$owner,$adId,$name,self::offerOrNull($owner,$b['offer_id']??null),'{}']);
  return self::list($owner);
 }
 public static function updateAd(string $owner,string $id,array $b): array {
  $a=self::adRow($owner,$id);
  $name=array_key_exists('name',$b)?trim(is_string($b['name'])?$b['name']:''):$a['name'];if($name===''||mb_strlen($name)>160)throw new HttpError(422,'Escribe un nombre para el anuncio.');
  $offer=array_key_exists('offer_id',$b)?self::offerOrNull($owner,$b['offer_id']):$a['offer_id'];
  $status=$b['status']??$a['status'];if(!in_array($status,['active','paused'],true))throw new HttpError(422,'Estado inválido.');
  Database::query('UPDATE whatsapp_ads SET name=?,offer_id=?,status=?,updated_at=now() WHERE id=?',[$name,$offer,$status,$a['id']]);
  return self::list($owner);
 }
 public static function deleteAd(string $owner,string $id): array {$a=self::adRow($owner,$id);Database::query('DELETE FROM whatsapp_ads WHERE id=?',[$a['id']]);return self::list($owner);}

 /** Prefilled WhatsApp text for a landing: the product's landing offer with a verified code, or null. */
 public static function landingMessage(array $landing): ?string {
  $owner=(string)($landing['user_id']??'');$product=(string)($landing['selected_product_id']??'');if($owner===''||$product==='')return null;
  try{$o=Database::one("SELECT * FROM whatsapp_offers WHERE user_id=? AND selected_product_id=? AND status='active' AND landing_default=1",[$owner,$product]);}catch(\Throwable){return null;}
  return $o?'Hola, quiero '.$o['name'].' ('.$o['code'].'-'.self::signature($owner,(string)$o['code']).')':null;
 }

 /**
  * Records the entry of an incoming message and identifies its offer. Runs inside the inbound transaction.
  * @param array $c conversation row (locked), $referral Meta's referral object or null, $text visible text
  */
 public static function resolveEntry(string $owner,array $c,string $text,?array $referral,string $at): void {
  $method=null;$certainty='baja';$offer=null;$adRef=null;$code=null;
  if($referral&&is_scalar($referral['source_id']??null)&&preg_match('/^[0-9]{3,32}$/D',(string)$referral['source_id'])){
   $src=[];foreach(['source_url','source_type','headline','body','media_type','image_url','thumbnail_url'] as $k)if(is_string($referral[$k]??null))$src[$k]=mb_substr($referral[$k],0,500);
   $ad=Database::one('SELECT * FROM whatsapp_ads WHERE user_id=? AND ad_id=? FOR UPDATE',[$owner,(string)$referral['source_id']]);
   if(!$ad){
    $adRef=Support::uuid();$name=mb_substr(trim((string)($src['headline']??''))?:'Anuncio '.substr((string)$referral['source_id'],-6),0,160);
    Database::query("INSERT INTO whatsapp_ads(id,user_id,ad_id,name,origin,source,first_seen_at,last_seen_at) VALUES(?,?,?,?,'first_message',?::jsonb,?,?)",[$adRef,$owner,(string)$referral['source_id'],$name,Support::json((object)$src),$at,$at]);
   }else{
    $adRef=$ad['id'];
    Database::query('UPDATE whatsapp_ads SET last_seen_at=?,first_seen_at=COALESCE(first_seen_at,?),source=?::jsonb,updated_at=now() WHERE id=?',[$at,$at,Support::json((object)($src?:(json_decode((string)$ad['source'],true)?:[]))),$ad['id']]);
    if($ad['offer_id']&&$ad['status']==='active'){$o=Database::one("SELECT * FROM whatsapp_offers WHERE id=? AND user_id=? AND status='active'",[$ad['offer_id'],$owner]);if($o){$offer=$o;$certainty='alta';}}
   }
   $method='ad';
  }elseif(preg_match(self::CODE_RE,$text,$m)){
   $code=strtoupper($m[1]).'-'.strtoupper($m[2]);$o=Database::one("SELECT * FROM whatsapp_offers WHERE user_id=? AND code=? AND status='active'",[$owner,$code]);
   if($o){$verified=isset($m[3])&&$m[3]!==''&&hash_equals(self::signature($owner,$code),strtoupper($m[3]));$offer=$o;$method=$verified?'code_link':'code_text';$certainty=$verified?'alta':'media';}
  }
  if($method===null)return;
  Database::query('INSERT INTO whatsapp_entries(id,user_id,conversation_id,ad_ref,offer_id,method,certainty,code,referral,created_at) VALUES(?,?,?,?,?,?,?,?,?::jsonb,?)',
   [Support::uuid(),$owner,$c['id'],$adRef,$offer['id']??null,$method,$certainty,$code,$referral?Support::json($referral):null,$at]);
  $captured=json_decode((string)$c['captured'],true);$buying=is_array($captured)&&$captured!==[];
  $changed=$c['offer_id']!==null&&($offer['id']??null)!==$c['offer_id']&&$buying;
  Database::query('UPDATE whatsapp_conversations SET offer_id=?,offer_version=?,product_id=?,sheet_version=NULL,ad_ref=?,offer_method=?,offer_certainty=?,offer_changed=?,updated_at=now() WHERE id=?',
   [$offer['id']??null,$offer?self::price($offer)['version']:null,$offer['selected_product_id']??null,$adRef,$method,$certainty,$changed?1:0,$c['id']]);
 }
 /** Offer of a conversation for the agent and the chat context, or null when none or archived. */
 public static function forConversation(string $owner,array $c): ?array {
  if(!$c['offer_id'])return null;$o=Database::one("SELECT * FROM whatsapp_offers WHERE id=? AND user_id=?",[$c['offer_id'],$owner]);if(!$o)return null;
  $v=self::view($o);return $v+['active'=>$o['status']==='active','method'=>$c['offer_method'],'method_label'=>self::METHODS[$c['offer_method']]??null,'certainty'=>$c['offer_certainty'],'changed'=>self::flag($c['offer_changed']??0)];
 }
}
