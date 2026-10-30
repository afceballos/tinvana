<?php
declare(strict_types=1);
namespace App;

/**
 * WhatsApp sales agent (stage 3). It only converses: the AI returns the text for the customer, the data the
 * customer gave and one requested action; the server validates everything and decides. The AI never sets prices,
 * shipping, totals or availability and never creates orders (quotes and orders arrive in stage 5; until then a
 * customer ready to buy is handed to an advisor with the captured data).
 * One sender per chat: it answers only while owner_mode=ai, under a per-conversation lock, and re-checks before
 * sending in case an advisor took the chat meanwhile. customer_seq/ai_seq make it answer the latest customer
 * messages exactly once, also when several arrive while it is thinking.
 */
final class WhatsAppAgent {
 public const ACTIONS=['none','ask_product','request_quote','present_summary','confirm','handoff','show_order','not_interested','opt_out'];
 /** Goodbye when the customer is not interested and the AI wrote nothing. */
 public const NOT_INTERESTED='Entendido, gracias por avisarnos. 😊 Si más adelante necesitas algo, escríbenos aquí mismo.';
 public const CAPTURE=['name'=>'Nombre','city'=>'Ciudad','department'=>'Departamento','address'=>'Dirección','neighborhood'=>'Barrio','reference'=>'Referencia','quantity'=>'Cantidad','variant'=>'Variante','email'=>'Correo'];
 private const HISTORY=20;
 private const REPLY_CHARS=['breve'=>350,'normal'=>700];
 private const MAX_TOKENS=['breve'=>400,'normal'=>800];
 private const TIMEOUT=25;
 /** Asked when the customer wants to know about an order they already placed and did not send its number. */
 public const ASK_ORDER='Con gusto te ayudo con tu pedido. Escríbeme tu número de pedido: empieza por TB, por ejemplo TB-7KQ2-MX9P. Lo encuentras en el correo o en el mensaje de confirmación.';
 // «mi pedido», «mi orden», «dónde está mi…», «estado de…», «seguimiento», «rastrear», but not a new purchase («hacer mi pedido»).
 private const ORDER_QUESTION='/\b(mis?\s+(pedidos?|[oó]rden(es)?|compras?|paquetes?|env[ií]os?)|estado\s+de\s+(mi|la|el)|d[oó]nde\s+(est[aá]|va|viene)\s+mi|seguimiento|rastre(ar|o))\b/iu';
 private const NEW_PURCHASE='/\b(hacer|realizar|enviar|crear|quiero)\s+(mi|el|un)\s+(pedido|orden|compra)\b/iu';
 private const BUYING='El cliente quiere comprar: revisa sus datos y cierra la venta (la cotización automática llega en la etapa 5).';

 /** Why the agent cannot answer this store's chats, or null when it can. */
 public static function unavailable(string $owner): ?string {
  if(!Entitlements::allows($owner,'whatsapp_ai'))return 'Tu plan no incluye el agente de IA';
  if(!WhatsAppAgentSettings::forUser($owner)['settings']['enabled'])return 'El agente de IA está desactivado en sus ajustes';
  try{AiConnections::credentials($owner);}catch(HttpError){return 'Conecta una IA en «Integraciones de IA» para que el agente responda';}
  return null;
 }
 /** @return array{0:string,1:?string} owner mode and reason for a new conversation */
 public static function initialMode(string $owner): array {$why=self::unavailable($owner);return $why?['human',$why]:['ai',null];}

 /** Answers the conversations waiting for the agent. */
 public static function runDue(int $limit=5): int {
  if($limit<1)return 0;$done=0;
  $rows=Database::all("SELECT id FROM whatsapp_conversations WHERE owner_mode='ai' AND customer_seq>ai_seq AND last_customer_at>now()-interval '24 hours' AND (locked_until IS NULL OR locked_until<now()) ORDER BY last_customer_at LIMIT ".max(1,min(50,$limit)));
  foreach($rows as $r){try{if(self::respond((string)$r['id']))$done++;}catch(\Throwable $t){error_log('WhatsApp agent '.$r['id'].': '.get_class($t));}}
  return $done;
 }

 private static function monthStart(): string {
  return (string)Database::timestamp((new \DateTimeImmutable('first day of this month midnight',new \DateTimeZone('America/Bogota')))->format(\DateTimeInterface::ATOM));
 }
 /**
  * Hands the chat to an advisor. With $account/$s and the «notify the customer» setting on, the customer gets the store's
  * custom handoff message first (and nothing written by the AI). The store gets a notification of kind $kind.
  */
 private static function handoff(array $c,string $reason,string $kind='handoff',?array $account=null,?array $s=null): void {
  if($account&&$s&&$s['handoff_notice'])self::system($account,$c,$s['messages']['handoff']);
  $done=Database::query("UPDATE whatsapp_conversations SET owner_mode='human',handoff_reason=?,version=version+1,updated_at=now() WHERE id=? AND owner_mode='ai'",[mb_substr($reason,0,200),$c['id']])->rowCount();
  if($done===1)Notifications::notify((string)$c['user_id'],$kind,self::who($c).' necesita un asesor',$reason,'/panel/whatsapp/'.$c['id'],(string)$c['id']);
 }
 public static function who(array $c): string {$n=trim((string)($c['profile_name']??''));return $n!==''?$n:'+'.($c['phone']??'');}
 /** Sends an automatic (non-AI) text if the chat is still the agent's. */
 private static function system(array $account,array $c,string $text): void {
  $mode=Database::one('SELECT owner_mode FROM whatsapp_conversations WHERE id=?',[$c['id']])['owner_mode']??'';
  if($mode==='ai'&&WhatsAppInbox::windowOpen($c['last_customer_at']))WhatsAppInbox::sendText($account,$c,$text,'system',null);
 }
 private static function cut(string $text,int $max): string {
  $text=trim(preg_replace('/[ \t]+/',' ',$text)??$text);if(mb_strlen($text)<=$max)return $text;
  $part=mb_substr($text,0,$max);$end=max(mb_strrpos($part,'. ')?:0,mb_strrpos($part,'? ')?:0,mb_strrpos($part,'! ')?:0,mb_strrpos($part,"\n")?:0);
  return $end>=(int)($max*0.5)?trim(mb_substr($part,0,$end+1)):rtrim(mb_substr($part,0,$max-1)).'…';
 }

 /** Answers one conversation. Returns false when another process holds it or nothing is pending. */
 public static function respond(string $id): bool {
  $lock=bin2hex(random_bytes(16));
  $got=Database::query("UPDATE whatsapp_conversations SET lock_token=?,locked_until=now()+interval '90 seconds' WHERE id=? AND owner_mode='ai' AND customer_seq>ai_seq AND (locked_until IS NULL OR locked_until<now())",[$lock,$id])->rowCount();
  if($got!==1)return false;
  $c=Database::one('SELECT c.*,ct.phone,ct.profile_name FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id AND ct.user_id=c.user_id WHERE c.id=?',[$id]);
  $seq=(int)($c['customer_seq']??0);$owner=(string)($c['user_id']??'');
  try{
   $account=$c?Database::one('SELECT * FROM whatsapp_accounts WHERE id=? AND user_id=?',[$c['account_id'],$owner]):null;
   if(!$c||!$account||!WhatsAppInbox::windowOpen($c['last_customer_at']))return true;
   $s=WhatsAppAgentSettings::forUser($owner)['settings'];
   if($why=self::unavailable($owner)){self::handoff($c,$why,'handoff',$account,$s);return true;}
   // A question about an order already placed: ask for its number (the inbox answers the number with the status).
   // No AI tokens and no advisor; if the customer already got this request, the AI takes over as usual.
   $lastIn=Database::one("SELECT type,body FROM whatsapp_messages WHERE conversation_id=? AND direction='in' ORDER BY created_at DESC,id DESC LIMIT 1",[$id]);
   $lastOut=Database::one("SELECT body FROM whatsapp_messages WHERE conversation_id=? AND direction='out' ORDER BY created_at DESC,id DESC LIMIT 1",[$id]);
   if(($lastIn['type']??'')==='text'&&preg_match(self::ORDER_QUESTION,(string)$lastIn['body'])&&!preg_match(self::NEW_PURCHASE,(string)$lastIn['body'])&&($lastOut['body']??'')!==self::ASK_ORDER){if(!WhatsAppOrderChat::answerOrderQuestion($owner,$c))WhatsAppInbox::sendText($account,$c,self::ASK_ORDER,'system',null);return true;}
   $max=Entitlements::of($owner)['limits']['whatsapp_ai_conversations']??null;
   if($max!==null&&!Database::one("SELECT id FROM whatsapp_messages WHERE conversation_id=? AND sender='ai' AND created_at>=?",[$id,self::monthStart()])&&Entitlements::aiConversationsThisMonth($owner)>=$max){
    self::handoff($c,'Se alcanzó el límite mensual de conversaciones con IA','limit',$account,$s);return true;
   }
   if(!WhatsAppAgentSettings::inHours($s)&&$s['schedule']['off_hours']==='handoff'){self::system($account,$c,$s['messages']['off_hours']);self::handoff($c,'Mensaje fuera del horario de atención','off_hours');return true;}
   // After a closed chat opens again, the AI reads only from the closing on.
   $history=array_reverse(Database::all('SELECT direction,type,body,sender FROM whatsapp_messages WHERE conversation_id=?'.($c['opened_at']?' AND created_at>=?':'').' ORDER BY created_at DESC,id DESC LIMIT '.self::HISTORY,$c['opened_at']?[$id,Database::timestamp((string)$c['opened_at'])]:[$id]));
   $last=null;foreach(array_reverse($history) as $m)if($m['direction']==='in'){$last=$m;break;}
   if($last&&!in_array($last['type'],['text','button','interactive'],true)){
    $prev=Database::one("SELECT body FROM whatsapp_messages WHERE conversation_id=? AND direction='out' ORDER BY created_at DESC,id DESC LIMIT 1",[$id]);
    if(($prev['body']??'')===$s['messages']['unsupported']){self::handoff($c,'El cliente envía archivos que la IA no puede leer','handoff',$account,$s);return true;}
    self::system($account,$c,$s['messages']['unsupported']);return true;
   }
   $products=WhatsAppSheets::sellable($owner);
   if(!$products){self::handoff($c,'No hay fichas de producto aprobadas para el agente','handoff',$account,$s);return true;}
   $ids=array_column($products,'id');
   // Stage 4: an offer identified from the ad or a code fixes the product (and its price, computed by the server).
   $offer=WhatsAppOffers::forConversation($owner,$c);if($offer&&!$offer['active'])$offer=null;
   if($offer&&!in_array($offer['product']['id'],$ids,true)){self::handoff($c,'El producto de la oferta del anuncio no tiene ficha aprobada','handoff',$account,$s);return true;}
   $productId=$offer?$offer['product']['id']:(in_array($c['product_id'],$ids,true)?$c['product_id']:(count($products)===1?$products[0]['id']:null));
   $sheet=$productId?WhatsAppSheets::approved($owner,$productId):null;
   $captured=json_decode((string)$c['captured'],true);$captured=is_array($captured)?$captured:[];
   $landings=[];foreach($ids as $pid)$landings[$pid]=WhatsAppChatOrder::landing($owner,$pid);
   $sell=$s['chat_orders']&&Entitlements::allows($owner,'whatsapp_ai');
   $input=['store'=>$account['verified_name']?:'la tienda','now'=>(new \DateTimeImmutable('now',new \DateTimeZone('America/Bogota')))->format('Y-m-d H:i'),'in_hours'=>WhatsAppAgentSettings::inHours($s),
    'products'=>array_map(fn($p)=>['id'=>$p['id'],'name'=>$p['name'],'price_text'=>$landings[$p['id']]?WhatsAppChatOrder::priceText($landings[$p['id']]):null,'url'=>$landings[$p['id']]?WhatsAppChatOrder::url($landings[$p['id']]):null],$products),
    'buy'=>$sell&&$productId?(WhatsAppChatOrder::terms($landings[$productId])??['unavailable'=>'Este producto no se puede pedir por el chat: pásalo a un asesor cuando quiera comprar']):null,'product'=>$productId?['id'=>$productId,'name'=>$products[array_search($productId,$ids,true)]['name']]:null,
    'sheet'=>$sheet['content']??null,'captured'=>(object)$captured,'memory'=>(string)($c['summary']??''),'orders'=>WhatsAppOrderChat::context($owner,$c),
    'knowledge'=>WhatsAppKnowledge::relevant($owner,(string)($last['body']??'').' '.(string)($c['summary']??'')),
    'offer'=>$offer?['name'=>$offer['name'],'code'=>$offer['code'],'units'=>$offer['units'],'price_text'=>$offer['price']['text'],'certainty'=>$offer['certainty'],'came_from'=>$offer['method'],'new_entry_while_buying'=>$offer['changed']]:null,
    'history'=>array_map(fn($m)=>['from'=>$m['direction']==='in'?'cliente':'tienda','text'=>in_array($m['type'],['text','button','interactive'],true)||$m['direction']==='out'?mb_substr((string)$m['body'],0,600):'[archivo]'],$history)];
   try{$r=AiClient::structured(self::instructions($s),'whatsapp_reply',self::schema(),$input,AiConnections::credentials($owner),self::MAX_TOKENS[$s['length']],self::TIMEOUT);}
   catch(\Throwable $t){
    // The customer gets the neutral message and an advisor takes over; the log has no personal data.
    error_log('WhatsApp agent AI error ('.$id.'): '.get_class($t));
    self::system($account,$c,$s['messages']['fallback']);self::handoff($c,'La IA no pudo responder'.($t instanceof HttpError?': '.mb_substr($t->getMessage(),0,120):''),'ai_failure');return true;
   }
   $d=$r['proposal'];$tokens=(int)$r['usage']['inputTokens']+(int)$r['usage']['outputTokens'];
   $reply=self::cut(is_string($d['reply']??null)?$d['reply']:'',self::REPLY_CHARS[$s['length']]);
   $action=in_array($d['action']??null,self::ACTIONS,true)?$d['action']:'none';
   $newProduct=is_string($d['product_id']??null)&&in_array($d['product_id'],$ids,true)?$d['product_id']:$productId;
   foreach(self::CAPTURE as $k=>$_){$v=$d['captured'][$k]??'';if(is_string($v)&&trim($v)!=='')$captured[$k]=mb_substr(trim($v),0,200);}
   $newSheet=$newProduct?(WhatsAppSheets::approved($owner,$newProduct)['version']??null):null;
   // If the customer turns to another product, the ad's offer no longer applies to this chat.
   $keepOffer=$offer&&$newProduct===$offer['product']['id'];
   // The AI keeps a short memory of the conversation (what the customer wants, their data, where it stopped).
   $memory=is_string($d['memory']??null)&&trim($d['memory'])!==''?mb_substr(trim($d['memory']),0,600):($c['summary']??null);
   Database::query('UPDATE whatsapp_conversations SET captured=?::jsonb,product_id=?,sheet_version=?,ai_tokens=ai_tokens+?,stage=?,summary=?,offer_changed=0'.($offer&&!$keepOffer?',offer_id=NULL,offer_version=NULL':'').',updated_at=now() WHERE id=?',[Support::json((object)$captured),$newProduct,$newSheet,$tokens,$action==='none'?'asesorando':$action,$memory,$id]);
   // Re-check before sending: an advisor may have taken the chat while the AI was thinking.
   $mode=Database::one('SELECT owner_mode FROM whatsapp_conversations WHERE id=?',[$id])['owner_mode']??'';
   if($mode!=='ai')return true;
   // Not interested, or asks not to be written again: one goodbye and the chat closes, so no reminder follows. It
   // opens again if the customer writes; the notices of their orders keep arriving.
   if($action==='not_interested'||$action==='opt_out'){
    if($action==='opt_out'){Database::query('UPDATE whatsapp_contacts SET opted_out_at=COALESCE(opted_out_at,now()),updated_at=now() WHERE id=? AND user_id=?',[$c['contact_id'],$owner]);WhatsAppInbox::sendText($account,$c,WhatsAppInbox::OPT_OUT_REPLY,'system',null);}
    else WhatsAppInbox::sendText($account,$c,$reply!==''?$reply:self::NOT_INTERESTED,'ai',null,null,$tokens);
    WhatsAppInbox::close($id,$action==='opt_out'?'opted_out':'not_interested');return true;
   }
   // Show an order (status, and «1 SÍ / 2 NO» if it can still be confirmed): the server writes it, never the AI.
   if($action==='show_order'){$number=Orders::normalizeNumber(is_string($d['order_number']??null)?$d['order_number']:'');$mine=array_column(WhatsAppOrderChat::ordersFor($owner,$c),'id','order_number');
    if($number&&isset($mine[$number])){WhatsAppOrderChat::show($owner,$id,(string)$mine[$number]);return true;}
    if(!$number&&count($mine)>0){WhatsAppOrderChat::answerOrderQuestion($owner,$c);return true;}
    if(!$number){WhatsAppInbox::sendText($account,$c,self::ASK_ORDER,'system',null);return true;}}
   if($reply==='')$reply=$s['messages']['fallback'];
   // Stage 5: with «Vender por WhatsApp» on, the server builds the order and shows the summary (never the AI's text).
   if($sell&&in_array($action,['request_quote','present_summary','confirm'],true)){
    $fresh=Database::one('SELECT c.*,ct.phone,ct.profile_name FROM whatsapp_conversations c JOIN whatsapp_contacts ct ON ct.id=c.contact_id AND ct.user_id=c.user_id WHERE c.id=?',[$id]);
    try{$why=WhatsAppChatOrder::prepare($owner,$fresh);}catch(\Throwable $t){error_log('WhatsApp chat order '.$id.': '.get_class($t));$why='No se pudo armar el pedido desde el chat';}
    if($why!==null)self::handoff($fresh,$why,'handoff',$account,$s);
    return true;
   }
   $reason=$action==='handoff'?(is_string($d['handoff_reason']??null)&&trim($d['handoff_reason'])!==''?'La IA pidió un asesor: '.trim($d['handoff_reason']):'La IA pidió un asesor'):(in_array($action,['request_quote','present_summary','confirm'],true)?self::BUYING:null);
   // With the handoff notice on, the customer receives only the store's custom message, not the AI text.
   if($reason!==null&&$s['handoff_notice']){self::handoff($c,$reason,'handoff',$account,$s);return true;}
   WhatsAppInbox::sendText($account,$c,$reply,'ai',null,null,$tokens);
   if($reason!==null)self::handoff($c,$reason);
   return true;
  }finally{
   Database::query('UPDATE whatsapp_conversations SET ai_seq=GREATEST(ai_seq,?),lock_token=NULL,locked_until=NULL WHERE id=? AND lock_token=?',[$seq,$id,$lock]);
  }
 }

 public static function schema(): array {
  $captured=[];foreach(self::CAPTURE as $k=>$_)$captured[$k]=['type'=>'string'];
  return ['type'=>'object','additionalProperties'=>false,'required'=>['reply','intent','product_id','captured','action','handoff_reason','order_number','memory'],'properties'=>[
   'reply'=>['type'=>'string'],'intent'=>['type'=>'string'],'product_id'=>['type'=>'string'],'order_number'=>['type'=>'string'],'memory'=>['type'=>'string'],
   'captured'=>['type'=>'object','additionalProperties'=>false,'required'=>array_keys(self::CAPTURE),'properties'=>$captured],
   'action'=>['type'=>'string','enum'=>self::ACTIONS],'handoff_reason'=>['type'=>'string']]];
 }
 public static function instructions(array $s): string {
  $tone=['cercano'=>'cercano, cálido y amable, tuteando','profesional'=>'profesional y cortés, usando «usted»','entusiasta'=>'entusiasta y positivo, sin exagerar'][$s['tone']];
  $length=$s['length']==='breve'?'Responde en 1 o 2 frases cortas (máximo 300 caracteres), directo a lo que preguntó el cliente. Sin saludos largos, sin repetir lo que ya dijiste y con un emoji como máximo.':'Responde en máximo 4 frases claras, sin relleno.';
  $h=$s['handoff'];$motives=[];
  if($h['customer_asks'])$motives[]='el cliente pide hablar con una persona o un asesor';
  if($h['complaint'])$motives[]='el cliente tiene un reclamo, una queja o un problema con un pedido (preguntar cómo va o dónde está su pedido no es un problema)';
  if($h['unknown'])$motives[]='el cliente pregunta algo que no está en la ficha';
  if($h['no_sheet'])$motives[]='el cliente pregunta por un producto que no está en "products"';
  if($h['custom']!=='')$motives[]=$h['custom'];
  $sell=$s['chat_orders']?'Puedes tomar pedidos en el chat. Si el cliente quiere comprar y "buy" no tiene "unavailable", pide uno o dos a la vez los datos que falten: variante (una de "buy.variants", si hay), cantidad (máximo "buy.max_quantity"; si hay "offer", la cantidad es la de la oferta), nombre y apellido, ciudad o municipio (y departamento si hay varias con ese nombre), dirección y barrio; la referencia y el correo son opcionales. Cuando los tengas todos, usa action "request_quote" con un "reply" corto: el sistema arma el pedido, le muestra el resumen con el precio y el envío y le pregunta «1 SÍ / 2 NO». No digas el total ni que el pedido quedó creado o confirmado. Si "buy" tiene "unavailable", pasa a un asesor cuando quiera comprar.'."\n"
   :'No creas pedidos ni confirmes compras. Cuando el cliente quiera comprar, pide los datos que falten (nombre, ciudad y departamento, dirección, barrio, referencia, cantidad y variante si aplica), uno o dos a la vez; cuando los tengas, usa action "request_quote".'."\n";
  return 'Eres el asesor de ventas por WhatsApp de la tienda indicada en "store", en Colombia. Tono: '.$tone.'. '.$length."\n"
   .'Si el cliente solo agradece o se despide, responde con una despedida breve y amable: no ofrezcas productos ni temas que no pidió.'."\n"
   .'Si el cliente dice que no le interesa, que ya no quiere comprar o que lo deja así, usa action "not_interested" con una despedida breve y amable: no insistas, no preguntes por qué ni ofrezcas otros productos. Si pide que no le escriban más o no recibir mensajes, usa action "opt_out". Un «no» que solo responde a otra pregunta (una variante, una duda) no es "not_interested".'."\n"
   .'Responde siempre en español. Usa solo la información de la ficha aprobada ("sheet") y de "knowledge" (respuestas aprobadas por la tienda o la plataforma: úsalas tal cual cuando apliquen); no inventes características, garantías ni tiempos.'."\n"
   .'Nunca digas ni calcules precios, costos de envío, totales, descuentos, tiempos de entrega ni disponibilidad, salvo el texto exacto de "offer.price_text", del "price_text" del producto en "products" o de "sheet.price_note" si existen.'."\n"
   .'Si el cliente pide ver el producto, fotos o más detalles, comparte el "url" de ese producto en "products", copiado exacto (si es null, no hay enlace: no inventes uno). No envíes el enlace si no lo pide.'."\n"
   .'Si el cliente pregunta qué productos hay, cuéntale los de "products" (nombre y "price_text" si lo tiene) y pregunta cuál le interesa; cuando pregunte por uno, devuelve su id en "product_id".'."\n"
   .'En "orders" están los pedidos de este cliente (número, producto, total, estado y si falta confirmarlo). No inventes estados ni datos de pedidos. Si pregunta por un pedido, quiere confirmarlo o ver su información, usa action "show_order" con su número en "order_number" (o "" si tiene varios y no sabes cuál): el sistema le muestra el pedido y, si falta confirmarlo, le pregunta «1 SÍ / 2 NO». No digas que un pedido quedó confirmado: eso lo hace el sistema. Si no tiene pedidos en "orders", pídele su número de pedido, que empieza por TB. No pases a un asesor por preguntas sobre pedidos; solo si reporta un problema.'."\n"
   .'En "memory" está lo que ya sabes de esta conversación; devuelve en "memory" un resumen breve y actualizado (qué quiere el cliente, sus datos, pedidos mencionados y en qué quedó), máximo 400 caracteres. Si "order_number" no aplica, déjalo en "".'."\n"
   .$sell
   .'Si "product" es null y hay varios productos en "products", pregunta cuál le interesa (action "ask_product"). Cuando lo identifiques, devuelve su id exacto en "product_id"; si no, deja "product_id" en "".'."\n"
   .'Si hay "offer", el cliente llegó por esa oferta: preséntala por su nombre y puedes decir exactamente "offer.price_text" (es el precio que calculó la tienda). Si "offer.certainty" es "media", confirma primero que le interesa esa oferta. Si "offer.new_entry_while_buying" es true, pregunta si quiere continuar la compra que ya tenía o empezar con esta oferta.'."\n"
   .($motives?'Pasa a un asesor (action "handoff", con el motivo en "handoff_reason" y un mensaje breve diciendo que un asesor le escribirá) cuando: '.implode('; ',$motives).".\n":'')
   .(!$h['unknown']?'Si algo no está en la ficha, dilo con amabilidad y ofrece ayuda con lo que sí sabes.'."\n":'')
   .'En "captured" escribe solo datos que el cliente dio explícitamente en la conversación; deja "" en lo demás. "intent" es una palabra que resuma lo que quiere el cliente.'
   .(($general=WhatsAppKnowledge::prompt())!==''?"\nInstrucciones generales de la plataforma: ".$general:'')
   .($s['instructions']!==''?"\nInstrucciones de la tienda: ".$s['instructions']:'');
 }
}
