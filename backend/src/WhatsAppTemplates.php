<?php
declare(strict_types=1);
namespace App;

/**
 * WhatsApp message templates (official docs, 2026-10-27):
 * - create: POST /{WABA_ID}/message_templates {name, language, category, components}; body up to 1024 characters with an
 *   example for each variable (positional {{n}}, example.body_text [[...]]), footer up to 60, quick reply buttons up to 25;
 * - list: GET /{WABA_ID}/message_templates?fields=name,language,status,category,id,components&limit=…;
 * - delete: DELETE /{WABA_ID}/message_templates?hsm_id=…&name=…;
 * - send: POST /{PHONE_NUMBER_ID}/messages {type:"template", template:{name, language:{code}, components}}; a quick reply
 *   tap comes back as a "button" message with the payload and context.id of the template message.
 * Templates are the only way to write first or after the 24-hour window. Meta charges each template conversation.
 */
final class WhatsAppTemplates {
 public const LANGUAGES=['es_CO'=>'Español (Colombia)','es'=>'Español','es_MX'=>'Español (México)','es_ES'=>'Español (España)','es_AR'=>'Español (Argentina)','es_CL'=>'Español (Chile)','es_PE'=>'Español (Perú)','es_EC'=>'Español (Ecuador)'];
 public const CATEGORIES=['utility'=>'Utilidad (pedidos y avisos de una compra)','marketing'=>'Marketing (saludos y promociones)'];
 private const VAR_RE='/\{\{\s*([a-z][a-z0-9_]{0,29})\s*\}\}/';
 /** Suggested templates the store can create with one click. */
 public const PRESETS=[
  'order_confirmation'=>['name'=>'confirmacion_pedido','category'=>'utility','language'=>'es_CO','body'=>"Hola {{nombre}}, recibimos tu pedido de {{producto}} ({{cantidad}} und.).\nTotal con envío: {{total}}.\nEntrega en {{direccion}}, {{ciudad}}.\n¿Confirmamos tu pedido?",'footer'=>'Pago contra entrega','buttons'=>['Confirmar pedido','Cambiar algo'],
   'examples'=>['nombre'=>'Laura','producto'=>'Picatodo eléctrico','cantidad'=>'1','total'=>'$68.000','direccion'=>'Cra 7 # 19-40','ciudad'=>'Pereira']],
  'greeting'=>['name'=>'saludo_nuevo_chat','category'=>'marketing','language'=>'es_CO','body'=>"Hola {{nombre}}, te escribimos de {{tienda}}. ¿Te podemos ayudar con algo?",'footer'=>'','buttons'=>['Sí, por favor','No, gracias'],
   'examples'=>['nombre'=>'Laura','tienda'=>'Tienda Tinbana']],
 ];

 private static function account(string $owner): array {$a=WhatsAppAccount::ofUser($owner);if(!$a)throw new HttpError(409,'Primero conecta tu número en Conexión.');return $a;}
 private static function view(array $t): array {
  return ['id'=>$t['id'],'name'=>$t['name'],'language'=>$t['language'],'category'=>$t['category'],'status'=>$t['status'],'body'=>$t['body'],'footer'=>$t['footer'],
   'buttons'=>json_decode((string)$t['buttons'],true)?:[],'variables'=>json_decode((string)$t['variables'],true)?:[],'purpose'=>$t['purpose'],'synced_at'=>$t['synced_at'],'sendable'=>$t['status']==='APPROVED'];
 }
 public static function list(string $owner): array {
  $a=WhatsAppAccount::ofUser($owner);
  $rows=$a?Database::all('SELECT * FROM whatsapp_templates WHERE user_id=? AND account_id=? ORDER BY created_at DESC',[$owner,$a['id']]):[];
  return ['templates'=>array_map(self::view(...),$rows),'presets'=>self::PRESETS,'languages'=>self::LANGUAGES,'categories'=>self::CATEGORIES,'connected'=>$a!==null];
 }
 /** Friendly {{key}} variables in order of first appearance. */
 private static function keys(string $body): array {preg_match_all(self::VAR_RE,$body,$m);return array_values(array_unique($m[1]));}
 private static function positional(string $body,array $keys): string {return preg_replace_callback(self::VAR_RE,fn($m)=>'{{'.(array_search($m[1],$keys,true)+1).'}}',$body);}
 public static function create(string $owner,array $b): array {
  $a=self::account($owner);$token=WhatsAppAccount::token($a);
  $name=is_string($b['name']??null)?trim($b['name']):'';if(!preg_match('/^[a-z0-9_]{1,60}$/D',$name))throw new HttpError(422,'El nombre usa solo minúsculas, números y guion bajo (máximo 60), por ejemplo confirmacion_pedido.');
  $lang=$b['language']??'es_CO';if(!is_string($lang)||!isset(self::LANGUAGES[$lang]))throw new HttpError(422,'Idioma no disponible.');
  $cat=$b['category']??null;if(!is_string($cat)||!isset(self::CATEGORIES[$cat]))throw new HttpError(422,'Elige la categoría: utilidad o marketing.');
  $body=is_string($b['body']??null)?trim($b['body']):'';if($body===''||mb_strlen($body)>1024)throw new HttpError(422,'El mensaje es obligatorio y admite hasta 1024 caracteres.');
  if(preg_match('/\{\{(?!\s*[a-z][a-z0-9_]{0,29}\s*\}\})/',$body))throw new HttpError(422,'Las variables se escriben así: {{nombre}} (minúsculas, sin espacios ni tildes).');
  $footer=is_string($b['footer']??null)?trim($b['footer']):'';if(mb_strlen($footer)>60)throw new HttpError(422,'El pie admite hasta 60 caracteres.');
  $buttons=[];foreach(is_array($b['buttons']??null)?$b['buttons']:[] as $x){$x=is_string($x)?trim($x):'';if($x==='')continue;if(mb_strlen($x)>25)throw new HttpError(422,'Cada botón admite hasta 25 caracteres.');$buttons[]=$x;}
  if(count($buttons)>3)throw new HttpError(422,'Máximo 3 botones.');
  $purpose=in_array($b['purpose']??'custom',['custom','order_confirmation','greeting'],true)?($b['purpose']??'custom'):'custom';
  $keys=self::keys($body);if(count($keys)>10)throw new HttpError(422,'Máximo 10 variables por plantilla.');
  $ex=is_array($b['examples']??null)?$b['examples']:[];$vars=[];
  foreach($keys as $k){$e=is_string($ex[$k]??null)?trim($ex[$k]):'';if($e===''||mb_strlen($e)>200)throw new HttpError(422,'Escribe un ejemplo para {{'.$k.'}}: Meta lo usa para revisar la plantilla.');$vars[]=['key'=>$k,'example'=>$e];}
  if(Database::one('SELECT id FROM whatsapp_templates WHERE account_id=? AND name=? AND language=?',[$a['id'],$name,$lang]))throw new HttpError(409,'Ya tienes una plantilla con ese nombre e idioma.');
  $components=[['type'=>'BODY','text'=>self::positional($body,$keys)]+($vars?['example'=>['body_text'=>[array_column($vars,'example')]]]:[])];
  if($footer!=='')$components[]=['type'=>'FOOTER','text'=>$footer];
  if($buttons)$components[]=['type'=>'BUTTONS','buttons'=>array_map(fn($t)=>['type'=>'QUICK_REPLY','text'=>$t],$buttons)];
  Auth::limit('whatsapp-template-create:'.$owner,20,3600);
  $r=WhatsAppGraph::request('POST',rawurlencode((string)$a['waba_id']).'/message_templates',$token,['name'=>$name,'language'=>$lang,'category'=>$cat,'components'=>$components],20);
  if($r['status']!==200||!is_array($r['json']))throw new HttpError(502,self::metaError($r));
  $status=is_string($r['json']['status']??null)?strtoupper($r['json']['status']):'PENDING';
  Database::query('INSERT INTO whatsapp_templates(id,user_id,account_id,meta_id,name,language,category,status,body,footer,buttons,variables,purpose,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?,now())',
   [Support::uuid(),$owner,$a['id'],is_scalar($r['json']['id']??null)?(string)$r['json']['id']:null,$name,$lang,$cat,$status,$body,$footer?:null,Support::json($buttons),Support::json($vars),$purpose]);
  return self::list($owner)+['message'=>'Plantilla enviada a Meta para aprobación. Suele tardar de minutos a unas horas; pulsa «Actualizar estados» para ver si ya está aprobada.'];
 }
 private static function metaError(array $r): string {
  $e=$r['json']['error']??null;
  if(is_array($e)){$msg=is_string($e['error_user_msg']??null)?$e['error_user_msg']:(is_string($e['message']??null)?$e['message']:'');if($msg!=='')return 'Meta rechazó la plantilla: '.mb_substr($msg,0,300);}
  return WhatsAppGraph::error($r);
 }
 /** Reads the templates of the account from Meta (status and content), importing the ones created in WhatsApp Manager. */
 public static function sync(string $owner): array {
  $a=self::account($owner);$token=WhatsAppAccount::token($a);$seen=[];$after=null;
  for($page=0;$page<5;$page++){
   $r=WhatsAppGraph::request('GET',rawurlencode((string)$a['waba_id']).'/message_templates?fields=name,language,status,category,id,components&limit=100'.($after?'&after='.rawurlencode($after):''),$token);
   if($r['status']!==200||!is_array($r['json']['data']??null))throw new HttpError(502,self::metaError($r));
   foreach($r['json']['data'] as $t){
    if(!is_array($t)||!is_string($t['name']??null)||!is_string($t['language']??null))continue;
    $body='';$footer=null;$buttons=[];
    foreach(is_array($t['components']??null)?$t['components']:[] as $c){$type=strtoupper((string)($c['type']??''));
     if($type==='BODY')$body=(string)($c['text']??'');elseif($type==='FOOTER')$footer=(string)($c['text']??'');
     elseif($type==='BUTTONS')foreach(is_array($c['buttons']??null)?$c['buttons']:[] as $btn)if(strtoupper((string)($btn['type']??''))==='QUICK_REPLY'&&is_string($btn['text']??null))$buttons[]=$btn['text'];}
    $status=strtoupper(is_string($t['status']??null)?$t['status']:'PENDING');$cat=strtolower(is_string($t['category']??null)?$t['category']:'utility');
    $row=Database::one('SELECT * FROM whatsapp_templates WHERE account_id=? AND name=? AND language=?',[$a['id'],$t['name'],$t['language']]);
    if($row)Database::query('UPDATE whatsapp_templates SET meta_id=?,status=?,category=?,synced_at=now(),updated_at=now() WHERE id=?',[is_scalar($t['id']??null)?(string)$t['id']:$row['meta_id'],$status,$cat,$row['id']]);
    else{
     // Created outside Tinbana: positional variables {{n}} become var1, var2… so they can still be filled in.
     preg_match_all('/\{\{\s*(\d+)\s*\}\}/',$body,$m);$n=$m[1]?max(array_map('intval',$m[1])):0;$vars=[];for($i=1;$i<=$n;$i++)$vars[]=['key'=>'var'.$i,'example'=>''];
     $friendly=preg_replace('/\{\{\s*(\d+)\s*\}\}/','{{var$1}}',$body);
     Database::query("INSERT INTO whatsapp_templates(id,user_id,account_id,meta_id,name,language,category,status,body,footer,buttons,variables,purpose,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,'external',now())",
      [Support::uuid(),$owner,$a['id'],is_scalar($t['id']??null)?(string)$t['id']:null,mb_substr($t['name'],0,512),mb_substr($t['language'],0,10),mb_substr($cat,0,20),mb_substr($status,0,24),$friendly,$footer?:null,Support::json($buttons),Support::json($vars)]);
    }
    $seen[]=$t['name'].'|'.$t['language'];
   }
   $after=is_string($r['json']['paging']['cursors']['after']??null)&&isset($r['json']['paging']['next'])?$r['json']['paging']['cursors']['after']:null;if(!$after)break;
  }
  foreach(Database::all('SELECT id,name,language FROM whatsapp_templates WHERE account_id=?',[$a['id']]) as $t)if(!in_array($t['name'].'|'.$t['language'],$seen,true))Database::query("UPDATE whatsapp_templates SET status='DELETED',updated_at=now() WHERE id=?",[$t['id']]);
  return self::list($owner)+['message'=>'Estados actualizados desde Meta.'];
 }
 public static function delete(string $owner,string $id): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Plantilla no encontrada.');$a=self::account($owner);
  $t=Database::one('SELECT * FROM whatsapp_templates WHERE id=? AND user_id=? AND account_id=?',[$id,$owner,$a['id']]);if(!$t)throw new HttpError(404,'Plantilla no encontrada.');
  if($t['meta_id']&&$t['status']!=='DELETED'){
   $r=WhatsAppGraph::request('DELETE',rawurlencode((string)$a['waba_id']).'/message_templates?hsm_id='.rawurlencode((string)$t['meta_id']).'&name='.rawurlencode((string)$t['name']),WhatsAppAccount::token($a));
   if($r['status']!==200)throw new HttpError(502,self::metaError($r));
  }
  Database::query('DELETE FROM whatsapp_templates WHERE id=?',[$t['id']]);return self::list($owner)+['message'=>'Plantilla eliminada.'];
 }
 public static function approved(string $owner,string $id): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Plantilla no encontrada.');
  $t=Database::one("SELECT * FROM whatsapp_templates WHERE id=? AND user_id=?",[$id,$owner]);if(!$t)throw new HttpError(404,'Plantilla no encontrada.');
  if($t['status']!=='APPROVED')throw new HttpError(409,'Esa plantilla todavía no está aprobada por Meta.');return $t;
 }
 /** Visible text with the values, and the Graph body of a template message. @param array<int,string> $payloads quick reply payload per button index */
 public static function build(array $t,array $values,string $to,array $payloads=[]): array {
  $vars=json_decode((string)$t['variables'],true)?:[];$params=[];$text=(string)$t['body'];
  foreach($vars as $v){$val=is_string($values[$v['key']]??null)?trim($values[$v['key']]):'';if($val===''||mb_strlen($val)>500)throw new HttpError(422,'Completa el valor de {{'.$v['key'].'}} (hasta 500 caracteres).');
   $params[]=['type'=>'text','text'=>$val];$text=preg_replace('/\{\{\s*'.preg_quote($v['key'],'/').'\s*\}\}/',addcslashes($val,'\\$'),$text);}
  $components=$params?[['type'=>'body','parameters'=>$params]]:[];
  foreach($payloads as $i=>$p)$components[]=['type'=>'button','sub_type'=>'quick_reply','index'=>(string)$i,'parameters'=>[['type'=>'payload','payload'=>mb_substr($p,0,256)]]];
  return ['text'=>$text,'graph'=>['messaging_product'=>'whatsapp','recipient_type'=>'individual','to'=>$to,'type'=>'template','template'=>['name'=>$t['name'],'language'=>['code'=>$t['language']]]+($components?['components'=>$components]:[])]];
 }
}
