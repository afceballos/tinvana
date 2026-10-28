<?php
declare(strict_types=1);
namespace App;

/**
 * Stage 5: an order made in the WhatsApp chat. The AI only gathers the data (product, variant, quantity, name, city,
 * address, neighborhood, optional email) and asks for the summary (action request_quote); the server checks it, takes
 * the price from the chat's offer or from the product's published landing, the freight from Dropi (or included), the
 * live stock, and creates the request and its draft order like the landing form does (source=whatsapp). Then it shows
 * the summary with «1 SÍ / 2 NO» (WhatsAppOrderChat). Without a published landing, or with an error, an advisor takes over.
 */
final class WhatsAppChatOrder {
 private const WORDS=['un'=>1,'una'=>1,'uno'=>1,'dos'=>2,'tres'=>3,'cuatro'=>4,'cinco'=>5,'seis'=>6,'siete'=>7,'ocho'=>8,'nueve'=>9,'diez'=>10];

 public static function plain(string $s): string {
  $s=mb_strtolower(strtr($s,['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n','Á'=>'a','É'=>'e','Í'=>'i','Ó'=>'o','Ú'=>'u','Ü'=>'u','Ñ'=>'n']));
  return trim(preg_replace('/\s+/',' ',preg_replace('/[^a-z0-9 ]/',' ',$s)??'')??'');
 }
 /** The published landing of a product (its price, variants and freight are the sale terms), or null. */
 public static function landing(string $owner,string $productId): ?array {
  $r=Database::one("SELECT * FROM landing_pages WHERE selected_product_id=? AND user_id=? AND status='published'",[$productId,$owner]);
  return $r?Landing::published($r):null;
 }
 /** Public address of the product's published landing, to share when the customer wants to see the product. */
 public static function url(array $landing): string {return Store::landingUrl((string)($landing['published_slug']?:$landing['slug']),Store::subdomainOf((string)$landing['user_id']));}
 /** Price as the agent may say it: the landing price, or «desde» the cheapest available variant. */
 public static function priceText(array $landing): ?string {
  $r=Landing::decode($landing);$c=$r['content'];$prices=[];
  foreach(LandingVariants::visible($c,$r['product_snapshot']) as $v)if($v['available']&&$v['price']!==null)$prices[]=$v['price'];
  if(!$prices&&$c['publicPrice']!==null)$prices[]=(float)$c['publicPrice'];if(!$prices)return null;
  $min=min($prices);return (count(array_unique($prices))>1?'desde ':'').WhatsAppOffers::money($min);
 }
 /** What the agent needs to sell the product in the chat: variants to choose, maximum quantity, price text. */
 public static function terms(?array $landing): ?array {
  if(!$landing)return null;$r=Landing::decode($landing);$c=$r['content'];
  $variants=array_values(array_map(fn($v)=>$v['label'],array_filter(LandingVariants::visible($c,$r['product_snapshot']),fn($v)=>$v['available'])));
  return ['variants'=>$variants,'max_quantity'=>$c['commerce']['quantityEnabled']?(int)$c['commerce']['maxQuantity']:1,'price_text'=>self::priceText($landing)];
 }
 /**
  * City by name (official names like «Santiago De Cali» also match «Cali»), narrowed by the department when given.
  * @return array{0:?array,1:?string} the match [department_code, city_code, city, state] or the question to ask
  */
 public static function city(string $city,string $department): array {
  $want=self::plain($city);$dep=self::plain($department);if($want==='')return [null,'¿En qué ciudad o municipio recibes el pedido?'];
  $exact=[];$near=[];
  foreach(DeliveryAddress::geography()['departments'] as $d)foreach($d['cities'] as $c){
   $name=self::plain($c['name']);$m=['department_code'=>$d['id'],'city_code'=>$c['id'],'city'=>$c['name'],'state'=>$d['name']];
   if($name===$want)$exact[]=$m;elseif(str_starts_with($name,$want.' ')||str_ends_with($name,' '.$want))$near[]=$m;
  }
  // A partial name («Cartagena») prefers the department capital (DANE code ending in 001) over other matches.
  if(!$exact&&count($near)>1&&count($capital=array_values(array_filter($near,fn($m)=>str_ends_with($m['city_code'],'001'))))===1&&$dep==='')$near=$capital;
  $list=$exact?:$near;
  if($dep!==''&&count($list)>1){$f=array_values(array_filter($list,fn($m)=>str_contains(self::plain($m['state']),$dep)||str_contains($dep,self::plain($m['state']))));if($f)$list=$f;}
  if(count($list)===1)return [$list[0],null];
  if(!$list)return [null,'No encontré la ciudad «'.mb_substr(trim($city),0,60).'». ¿Me escribes el municipio y el departamento?'];
  return [null,'Hay varias ciudades llamadas «'.$list[0]['city'].'»: '.implode(', ',array_unique(array_map(fn($m)=>$m['state'],array_slice($list,0,6)))).'. ¿En qué departamento?'];
 }
 /** The variant the customer named (label or all its option values), among the available ones. */
 public static function variant(array $visible,string $text): array {
  $available=array_values(array_filter($visible,fn($v)=>$v['available']));$t=' '.self::plain($text).' ';$found=[];
  if(trim($t)!=='')foreach($available as $v){
   $label=self::plain($v['label']);$all=true;foreach($v['options'] as $val)if(!str_contains($t,' '.self::plain((string)$val).' '))$all=false;
   if(($label!==''&&str_contains($t,' '.$label.' '))||$all)$found[]=$v;
  }
  if(count($found)===1)return [$found[0],null];
  $names=implode(', ',array_map(fn($v)=>$v['label'],array_slice($found?:$available,0,10)));
  return [null,$available?'¿Cuál opción quieres? Tenemos: '.$names.'.':'Lo siento, ese producto está agotado en este momento.'];
 }
 public static function quantity(string $text): ?int {
  $t=self::plain($text);if($t==='')return null;
  if(preg_match('/\b([0-9]{1,3})\b/',$t,$m))return (int)$m[1];
  foreach(explode(' ',$t) as $w)if(isset(self::WORDS[$w]))return self::WORDS[$w];
  return null;
 }
 private static function say(string $owner,array $c,string $text): void {
  $a=Database::one('SELECT * FROM whatsapp_accounts WHERE id=? AND user_id=?',[$c['account_id'],$owner]);
  if($a&&WhatsAppInbox::windowOpen($c['last_customer_at']))WhatsAppInbox::sendText($a,$c,$text,'system',null);
 }

 /**
  * Builds the order from what the chat captured and shows its summary («1 SÍ / 2 NO»). Missing or unclear data is asked
  * by the server. Returns a handoff reason when an advisor must take over, or null.
  */
 public static function prepare(string $owner,array $c): ?string {
  $captured=json_decode((string)$c['captured'],true);$captured=is_array($captured)?$captured:[];$get=fn(string $k)=>trim((string)($captured[$k]??''));
  $productId=(string)($c['product_id']??'');if($productId===''){self::say($owner,$c,'¿Qué producto quieres pedir?');return null;}
  $landing=self::landing($owner,$productId);if(!$landing)return 'El producto no tiene una landing publicada: arma el pedido a mano';
  $r=Landing::decode($landing);$content=$r['content'];
  if($content['publicPrice']===null&&!LandingVariants::visible($content,$r['product_snapshot']))return 'La landing del producto no tiene precio: arma el pedido a mano';
  // Offer of the ad or code, when it is for this product: it fixes the units and the price.
  $offer=WhatsAppOffers::forConversation($owner,$c);$chatOffer=null;
  if($offer&&$offer['active']&&$offer['product']['id']===$productId){
   $p=Database::one('SELECT * FROM whatsapp_offers WHERE id=? AND user_id=?',[$c['offer_id'],$owner]);$price=$p?WhatsAppOffers::price($p):['total'=>null];
   $units=(int)$offer['units'];if($price['total']===null||$units<1)return 'No se pudo calcular el precio de la oferta «'.$offer['name'].'»';
   $cents=(int)round($price['total']*100);if($cents%$units!==0)return 'El precio de la oferta «'.$offer['name'].'» no se reparte en unidades exactas: arma el pedido a mano';
   $chatOffer=['name'=>$offer['name'],'code'=>$offer['code'],'units'=>$units,'unit_price'=>number_format($cents/$units/100,2,'.','')];
  }
  // Name and surname.
  $parts=preg_split('/\s+/u',$get('name'))?:[];$parts=array_values(array_filter($parts,fn($x)=>$x!==''));
  if(count($parts)<2){self::say($owner,$c,'Para el envío necesito tu nombre y apellido.');return null;}
  [$place,$ask]=self::city($get('city'),$get('department'));if(!$place){self::say($owner,$c,$ask);return null;}
  if(mb_strlen($get('address'))<5){self::say($owner,$c,'¿Cuál es la dirección de entrega? (calle o carrera, número)');return null;}
  if($get('neighborhood')===''){self::say($owner,$c,'¿En qué barrio queda?');return null;}
  $variant=null;$visible=LandingVariants::visible($content,$r['product_snapshot']);
  if($visible){[$variant,$ask]=self::variant($visible,$get('variant'));if(!$variant){self::say($owner,$c,$ask);return null;}}
  $max=$content['commerce']['quantityEnabled']?(int)$content['commerce']['maxQuantity']:1;
  if($chatOffer)$qty=$chatOffer['units'];
  else{$qty=$get('quantity')===''?1:self::quantity($get('quantity'));if($qty===null||$qty<1){self::say($owner,$c,'¿Cuántas unidades quieres?');return null;}
   if($qty>$max){self::say($owner,$c,$max===1?'Por este medio puedes pedir 1 unidad por pedido.':'Puedes pedir hasta '.$max.' unidades por pedido. ¿Cuántas quieres?');return null;}}
  $email=strtolower($get('email'));if($email!==''&&!filter_var($email,FILTER_VALIDATE_EMAIL))$email='';
  $details=mb_substr('Barrio '.$get('neighborhood').($get('reference')!==''?' · '.$get('reference'):''),0,200);
  $body=['idempotency_key'=>Support::uuid(),'first_name'=>mb_substr($parts[0],0,100),'last_name'=>mb_substr(implode(' ',array_slice($parts,1)),0,100),'email'=>$email,
   'phone'=>'+'.preg_replace('/\D/','',(string)$c['phone']),'phone_country'=>'CO','country_code'=>'CO','department_code'=>$place['department_code'],'city_code'=>$place['city_code'],
   'address'=>mb_substr($get('address'),0,300),'address_details'=>$details,'quantity'=>$qty,'variant_id'=>$variant['id']??''];
  $fingerprint=hash('sha256',Support::json([$productId,$variant['id']??null,$qty,$chatOffer['code']??null,$body['first_name'],$body['last_name'],$email,$place['city_code'],$body['address'],$details]));
  // The same data again shows the same draft; changed data replaces the previous draft of this chat.
  $previous=$c['order_id']?Database::one("SELECT * FROM orders WHERE id=? AND user_id=? AND source='whatsapp' AND sale_status='draft' AND integration_status='not_sent'",[$c['order_id'],$owner]):null;
  if($previous&&(json_decode((string)$previous['product_data'],true)['chat_fingerprint']??null)===$fingerprint){WhatsAppOrderChat::show($owner,(string)$c['id'],(string)$previous['id']);return null;}
  try{$saved=Leads::save($landing,$body,['conversation_id'=>$c['id'],'offer'=>$chatOffer,'fingerprint'=>$fingerprint]);}
  catch(HttpError $e){
   // Sold out, variant sold out, invalid address…: the message is for the buyer, and the chat goes on.
   if($e->status<500){self::say($owner,$c,$e->getMessage());return null;}
   throw $e;
  }
  if(!$saved['order_id'])return 'No se pudo crear el pedido desde el chat';
  if($previous){
   $p=Database::one("UPDATE orders SET sale_status='cancelled',quote_id=NULL,quote_expires_at=NULL,version=version+1,updated_at=now() WHERE id=? AND sale_status='draft' AND integration_status='not_sent' RETURNING *",[$previous['id']]);
   if($p)Orders::event($p,'cancelled',['reason'=>'El cliente cambió los datos en el chat; lo reemplaza el pedido '.$saved['order_number'],'by'=>'whatsapp_chat'],null);
  }
  Database::query('UPDATE whatsapp_conversations SET order_id=?,stage=?,updated_at=now() WHERE id=?',[$saved['order_id'],'pedido',$c['id']]);
  $o=Database::one('SELECT * FROM orders WHERE id=?',[$saved['order_id']]);
  Notifications::notify($owner,'chat_order',WhatsAppAgent::who($c).' armó un pedido por WhatsApp','Pedido '.Orders::displayNumber($o).'. El cliente lo está revisando para confirmarlo.','/panel/pedidos/'.$saved['order_id'],(string)$c['id']);
  WhatsAppOrderChat::show($owner,(string)$c['id'],(string)$saved['order_id']);
  return null;
 }
}
