<?php
declare(strict_types=1);
namespace App;

/**
 * Order emails with the Tinbana account-email look: buyer "received / confirmed / cancelled" and owner "new order".
 * Queued in the same transaction as the order change (order_mail, encrypted payload) and sent by the existing
 * `mail:work` cron through AccountMail::deliver. Settings live in users.mail_settings.
 */
final class OrderMail {
 public const KINDS=['buyer_received','owner_new_order','buyer_confirmed','buyer_cancelled'];
 public const MESSAGES=['buyer_received','buyer_confirmed','buyer_cancelled'];

 private static function user(string $owner): array {
  $u=Database::one('SELECT id,email,profile,mail_settings FROM users WHERE id=?',[$owner]);if(!$u)throw new HttpError(404,'Usuario no encontrado.');return $u;
 }
 public static function defaults(array $user): array {
  $profile=json_decode((string)($user['profile']??'{}'),true)?:[];
  return ['enabled'=>array_fill_keys(self::KINDS,true),'sender_name'=>self::senderName((string)($profile['company_name']??'')),'reply_to'=>$user['email'],'owner_email'=>$user['email'],'messages'=>array_fill_keys(self::MESSAGES,'')];
 }
 public static function settings(string $owner): array {
  $u=self::user($owner);$d=self::defaults($u);$s=json_decode((string)($u['mail_settings']??'null'),true);if(!is_array($s))return $d;
  foreach(self::KINDS as $k)if(is_bool($s['enabled'][$k]??null))$d['enabled'][$k]=$s['enabled'][$k];
  foreach(['sender_name','reply_to','owner_email'] as $k)if(is_string($s[$k]??null)&&$s[$k]!=='')$d[$k]=$s[$k];
  foreach(self::MESSAGES as $k)if(is_string($s['messages'][$k]??null))$d['messages'][$k]=$s['messages'][$k];
  return $d;
 }
 /** Display name safe for a From header: no quotes, angle brackets or control characters. */
 public static function senderName(string $raw): string {
  $name=trim(preg_replace('/\s+/u',' ',preg_replace('/[\x00-\x1f\x7f"<>\\\\;,]/u','',$raw)??'')??'');
  return $name===''?'Tinbana':mb_substr($name,0,60);
 }
 public static function view(string $owner): array {
  $u=self::user($owner);return ['settings'=>self::settings($owner),'account_email'=>$u['email'],'mail_configured'=>AccountMail::configured()];
 }
 public static function save(string $owner,array $b): array {
  $s=$b['settings']??null;if(!is_array($s))throw new HttpError(422,'Configuración de correos inválida.');
  $out=['enabled'=>[],'messages'=>[]];
  foreach(self::KINDS as $k){if(!is_bool($s['enabled'][$k]??null))throw new HttpError(422,'Indica si cada correo se envía o no.');$out['enabled'][$k]=$s['enabled'][$k];}
  $name=$s['sender_name']??'';if(!is_string($name)||mb_strlen($name)>60)throw new HttpError(422,'El nombre del remitente admite hasta 60 caracteres.');$out['sender_name']=self::senderName($name);
  foreach(['reply_to'=>'El correo de respuesta','owner_email'=>'El correo para avisos de pedidos'] as $k=>$label){$v=strtolower(trim((string)($s[$k]??'')));if(!filter_var($v,FILTER_VALIDATE_EMAIL)||strlen($v)>254)throw new HttpError(422,$label.' no es válido.');$out[$k]=$v;}
  foreach(self::MESSAGES as $k){$v=$s['messages'][$k]??'';if(!is_string($v)||mb_strlen($v)>500)throw new HttpError(422,'Cada mensaje personalizado admite hasta 500 caracteres.');$out['messages'][$k]=trim(str_replace("\r",'',$v));}
  Database::query('UPDATE users SET mail_settings=?::jsonb,updated_at=now() WHERE id=?',[Support::json($out),$owner]);
  return self::view($owner);
 }

 private static function money(?float $v): string {return $v===null?'Por confirmar':'$ '.number_format($v,fmod($v,1.0)==0.0?0:2,',','.');}
 /** Facts copied from the order at queue time; the email never re-reads mutable data. */
 public static function snapshot(array $order,array $settings): array {
  $c=json_decode((string)$order['customer'],true)?:[];$a=json_decode((string)$order['delivery_address'],true)?:[];$p=json_decode((string)$order['product_data'],true)?:[];$v=json_decode((string)($order['variant_data']??'null'),true);
  $qty=(int)$order['quantity'];$unit=$order['unit_price']===null?null:(float)$order['unit_price'];$ship=$order['shipping_price']===null?null:(float)$order['shipping_price'];
  return ['ref'=>Orders::displayNumber($order),'tracking_url'=>!empty($order['order_number'])?OrderLookup::url((string)$order['user_id'],(string)$order['order_number']):'','order_id'=>$order['id'],'first_name'=>(string)($c['first_name']??''),'last_name'=>(string)($c['last_name']??''),'email'=>(string)($c['email']??''),'phone'=>(string)($c['phone']??''),
   'product'=>(string)($p['product_name']??'Producto'),'variant'=>is_array($v)?(string)($v['label']??''):'','quantity'=>$qty,'unit_price'=>$unit,'shipping'=>$ship,'total'=>$unit!==null&&$ship!==null?round($unit*$qty+$ship,2):null,
   'address'=>trim((string)($a['address']??'').' '.(string)($a['address_details']??'')),'city'=>trim((string)($a['city']??'').', '.(string)($a['state']??''),', '),
   'store'=>$settings['sender_name'],'reply_to'=>$settings['reply_to'],'panel_url'=>rtrim(Support::env('APP_URL'),'/').'/panel/pedidos/'.$order['id']];
 }
 /** Queue one email for an order unless the owner disabled it; duplicates per order version are ignored. */
 public static function queue(array $order,string $kind): void {
  if(!in_array($kind,self::KINDS,true)||!Entitlements::allows((string)$order['user_id'],'mail'))return;
  $settings=self::settings((string)$order['user_id']);if(!$settings['enabled'][$kind])return;
  $data=self::snapshot($order,$settings);$to=$kind==='owner_new_order'?$settings['owner_email']:$data['email'];
  if(!filter_var($to,FILTER_VALIDATE_EMAIL))return;
  $data['to']=$to;$data['message']=$settings['messages'][$kind]??'';$id=Support::uuid();
  $key=$order['id'].':'.$kind.':'.(in_array($kind,['buyer_received','owner_new_order'],true)?'created':(string)$order['version']);
  Database::query('INSERT INTO order_mail(id,user_id,order_id,kind,dedupe_key,payload_ciphertext) VALUES(?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING',[$id,$order['user_id'],$order['id'],$kind,$key,Crypto::encrypt(Support::json($data),'order-mail:'.$id)]);
 }

 /** @return array{subject:string,html:string,text:string} */
 public static function render(string $kind,array $d): array {
  $e=fn($v)=>Support::escape((string)$v);$store=$d['store'];$ref=str_starts_with((string)$d['ref'],'TB-')?(string)$d['ref']:'#'.$d['ref'];$hello=trim($d['first_name'])!==''?'Hola '.trim($d['first_name']):'Hola';
  $copy=[
   'buyer_received'=>['Recibimos tu pedido',$hello.', gracias por tu pedido en '.$store.'. Te contactaremos pronto para confirmar los detalles y el envío.'],
   'buyer_confirmed'=>['Tu pedido está confirmado',$hello.', confirmamos tu pedido y lo estamos preparando para el envío. Te avisaremos si necesitamos algo más.'],
   'buyer_cancelled'=>['Tu pedido fue cancelado',$hello.', tu pedido '.$ref.' fue cancelado. Si crees que es un error o quieres hacer un nuevo pedido, responde a este correo.'],
   'owner_new_order'=>['Nuevo pedido recibido',trim($d['first_name'].' '.$d['last_name']).' pidió '.$d['quantity'].' × '.$d['product'].'. Revísalo, cotiza el envío y registra la aceptación.'],
  ][$kind];
  [$title,$intro]=$copy;$owner=$kind==='owner_new_order';
  $row=fn(string $k,string $v,bool $strong=false)=>'<tr><td style="padding:10px 0;border-top:1px solid #ffe0cd;font-size:14px;color:#75665c">'.$e($k).'</td><td align="right" style="padding:10px 0;border-top:1px solid #ffe0cd;font-size:'.($strong?'16px;font-weight:bold;color:#1e1e1e':'14px;color:#3b3029').'">'.$e($v).'</td></tr>';
  $body='<p style="font-size:16px;line-height:1.7;margin:0 0 22px;color:#3b3029">'.$e($intro).'</p>';
  if(!$owner&&trim((string)$d['message'])!=='')$body.='<div style="margin:0 0 22px;padding:16px 18px;background:#fff8f1;border:1px solid #ffe0cd;border-radius:14px;font-size:15px;line-height:1.6;color:#3b3029">'.nl2br($e($d['message'])).'</div>';
  // WhatsApp step of the order confirmation (only while the customer has not confirmed; see WhatsAppOrderConfirm::mailInfo).
  $wa=$kind==='buyer_received'&&is_array($d['whatsapp']??null)?$d['whatsapp']:null;
  $waText=$wa?($wa['sent']?'Te enviamos el resumen de tu pedido por WhatsApp. Ábrelo y toca «Confirmar pedido» para que lo preparemos.':'¿Quieres confirmarlo más rápido? Escríbenos por WhatsApp con tu número de pedido '.$wa['code'].' y te enviamos el resumen al instante.'):'';
  if($wa)$body.='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#e9f8ef;border:1px solid #bfe8cf;border-radius:14px"><tr><td style="padding:16px 18px"><p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#14532d">'.$e($waText).'</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#128c4a" style="border-radius:12px"><a href="'.$e($wa['link']).'" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">'.($wa['sent']?'Abrir WhatsApp':'Confirmar por WhatsApp').'</a></td></tr></table></td></tr></table>';
  $body.='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #ffe0cd;border-radius:14px"><tr><td style="padding:16px 18px"><p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#974000;font-weight:bold">Resumen del pedido · '.$e($ref).'</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
   .$row('Producto',$d['product'].($d['variant']!==''?' · '.$d['variant']:''))
   .$row('Cantidad',(string)$d['quantity'])
   .$row('Precio por unidad',self::money($d['unit_price']))
   .$row('Envío',self::money($d['shipping']))
   .$row('Total',self::money($d['total']),true)
   .'</table></td></tr></table>';
  $body.='<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#974000;font-weight:bold">'.($owner?'Comprador y entrega':'Entrega en').'</p><p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#3b3029">'
   .($owner?$e(trim($d['first_name'].' '.$d['last_name'])).'<br>'.$e($d['phone']).' · '.$e($d['email']).'<br>':'').$e($d['address']).'<br>'.$e($d['city']).'</p>';
  if($owner)$body.='<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#ff6a00" style="border-radius:12px"><a href="'.$e($d['panel_url']).'" style="display:inline-block;padding:16px 24px;color:#1e1e1e;font-size:15px;font-weight:bold;text-decoration:none">Ver pedido</a></td></tr></table>';
  else{if(!empty($d['tracking_url']))$body.='<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#3b3029">Consulta el estado de tu pedido cuando quieras con tu número <strong>'.$e($d['ref']).'</strong>: <a href="'.$e($d['tracking_url']).'" style="color:#c2410c;font-weight:bold">Consultar mi pedido</a></p>';
  $body.='<p style="font-size:13px;line-height:1.6;margin:0;color:#75665c">¿Tienes preguntas? Responde a este correo y te atenderá '.$e($store).'.</p>';}
  $footer=$owner?'Tinbana · Ideas que toman vuelo.':$store.' · Enviado con Tinbana';
  $subject=$owner?'Nuevo pedido '.$ref.' · '.$d['product']:$title.' · '.$store;
  $text=$title."\n\n".$intro."\n\n".(!$owner&&trim((string)$d['message'])!==''?$d['message']."\n\n":'').($wa?$waText."\n".$wa['link']."\n\n":'')
   ."Pedido ".$ref."\nProducto: ".$d['product'].($d['variant']!==''?' · '.$d['variant']:'')."\nCantidad: ".$d['quantity']."\nPrecio por unidad: ".self::money($d['unit_price'])."\nEnvío: ".self::money($d['shipping'])."\nTotal: ".self::money($d['total'])
   ."\n\nEntrega: ".$d['address'].', '.$d['city'].($owner?"\n\nVer pedido: ".$d['panel_url']:(!empty($d['tracking_url'])?"\n\nConsulta tu pedido: ".$d['tracking_url']:''));
  return ['subject'=>$subject,'html'=>AccountMail::layout($title,$title.' · '.$ref,$body,$footer),'text'=>$text];
 }

 /** Sample order for the settings preview and test email. */
 public static function sample(string $owner): array {
  $s=self::settings($owner);
  return ['ref'=>'TB-7KQ2-MX9P','tracking_url'=>OrderLookup::url($owner,'TB-7KQ2-MX9P'),'order_id'=>'00000000-0000-4000-8000-000000000000','first_name'=>'Ana','last_name'=>'Pérez','email'=>'cliente@ejemplo.com','phone'=>'+573001234567','product'=>'Producto de ejemplo','variant'=>'','quantity'=>2,'unit_price'=>59900.0,'shipping'=>17000.0,'total'=>136800.0,
   'address'=>'Calle 10 # 20-30 Apto 301','city'=>'Bogotá, D.C., Bogotá, D.C.','store'=>$s['sender_name'],'reply_to'=>$s['reply_to'],'panel_url'=>rtrim(Support::env('APP_URL'),'/').'/panel/pedidos','message'=>''];
 }
 public static function preview(string $owner,string $kind,?array $settings=null): array {
  if(!in_array($kind,self::KINDS,true))throw new HttpError(404,'Correo no disponible.');
  $d=self::sample($owner);if($settings){$d['store']=self::senderName((string)($settings['sender_name']??$d['store']));$m=$settings['messages'][$kind]??'';$d['message']=is_string($m)?mb_substr($m,0,500):'';}else $d['message']=self::settings($owner)['messages'][$kind]??'';
  if($kind==='buyer_received'&&($act=WhatsAppOrderConfirm::active($owner))&&$act['phone'])$d['whatsapp']=['link'=>'https://wa.me/'.$act['phone'],'code'=>'TB-7KQ2-MX9P','sent'=>false];
  $r=self::render($kind,$d);$r['html']=str_replace('cid:tinvana-logo','/brand/tinvana-mail.png',$r['html']);return $r;
 }
 /** Sends the sample email to the owner's notification address right away. */
 public static function test(string $owner,string $kind): array {
  if(!in_array($kind,self::KINDS,true))throw new HttpError(404,'Correo no disponible.');AccountMail::ready();
  $s=self::settings($owner);$d=self::sample($owner);$d['message']=$s['messages'][$kind]??'';
  try{AccountMail::deliver($s['owner_email'],self::render($kind,$d),'order-mail-test-'.bin2hex(random_bytes(6)),$s['sender_name'],$s['reply_to']);}
  catch(\Throwable $e){error_log('Tinbana order mail test: '.AccountMail::describe($e));throw new HttpError(502,'No fue posible enviar el correo de prueba con el proveedor configurado.');}
  return ['message'=>'Correo de prueba enviado a '.$s['owner_email'].'. Revisa también la carpeta de correo no deseado.'];
 }

 public static function work(int $max=20): array {
  AccountMail::ready();$sent=0;$failed=0;$db=Database::connection();
  for($i=0;$i<$max;$i++){
   $db->beginTransaction();
   try{$r=Database::one("SELECT * FROM order_mail m WHERE (m.status='pending' AND m.next_attempt_at<=now()) OR (m.status='processing' AND m.locked_at<now()-interval '3 minutes') ORDER BY m.created_at FOR UPDATE OF m SKIP LOCKED LIMIT 1");if(!$r){$db->commit();break;}Database::query("UPDATE order_mail SET status='processing',locked_at=now(),updated_at=now() WHERE id=?",[$r['id']]);$db->commit();}
   catch(\Throwable $e){$db->rollBack();throw $e;}
   $attempt=(int)$r['attempts']+1;
   try{$d=json_decode(Crypto::decrypt((string)$r['payload_ciphertext'],'order-mail:'.$r['id']),true,32,JSON_THROW_ON_ERROR);if($r['kind']==='buyer_received')$d['whatsapp']=WhatsAppOrderConfirm::mailInfo((string)$r['user_id'],(string)$r['order_id']);AccountMail::deliver($d['to'],self::render($r['kind'],$d),'order-mail-'.$r['id'],$d['store'],$r['kind']==='owner_new_order'?'':$d['reply_to']);
    Database::query("UPDATE order_mail SET status='sent',payload_ciphertext=null,attempts=?,locked_at=null,last_error=null,updated_at=now() WHERE id=?",[$attempt,$r['id']]);$sent++;}
   catch(\Throwable $failure){error_log('Tinbana order mail: '.AccountMail::describe($failure));$final=$attempt>=5;
    Database::query("UPDATE order_mail SET status=?,attempts=?,locked_at=null,next_attempt_at=now()+(? * interval '1 second'),last_error='No fue posible enviar el correo con el proveedor configurado.',updated_at=now() WHERE id=?",[$final?'failed':'pending',$attempt,min(900,60*2**($attempt-1)),$r['id']]);
    if($final)Database::query('UPDATE order_mail SET payload_ciphertext=null WHERE id=?',[$r['id']]);$failed++;}
  }
  return ['sent'=>$sent,'failed'=>$failed];
 }
}
