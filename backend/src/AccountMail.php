<?php
declare(strict_types=1);
namespace App;
use PHPMailer\PHPMailer\PHPMailer;
final class AccountMail {
 public static function configured():bool {
  if(Support::env('MAIL_TRANSPORT','smtp')==='resend')return Support::env('RESEND_API_KEY')!==''&&filter_var(Support::env('MAIL_FROM_ADDRESS'),FILTER_VALIDATE_EMAIL);
  if(Support::env('MAIL_TRANSPORT','smtp')!=='smtp')return false;
  return Support::env('SMTP_HOST')!==''&&Support::env('SMTP_USERNAME')!==''&&Support::env('SMTP_PASSWORD')!==''&&filter_var(Support::env('MAIL_FROM_ADDRESS'),FILTER_VALIDATE_EMAIL)&&in_array(Support::env('SMTP_ENCRYPTION','tls'),['tls','smtps'],true)&&in_array((int)Support::env('SMTP_PORT','587'),[465,587,2525],true);
 }
 public static function ready():void {if(!self::configured())throw new HttpError(503,'El envío de correos de cuenta todavía no está configurado. Contacta al administrador.');}
 public static function template(string $purpose,string $url):array {
  $e=fn($v)=>Support::escape($v);
  $map=[
   'verify'=>['Confirma tu correo','Estás a un paso de crear tu espacio en Tinvana. Confirma tu correo y elige tu contraseña para comenzar.','Verificar correo y crear contraseña','24 horas'],
   'reset'=>['Restablece tu contraseña','Recibimos una solicitud para cambiar la contraseña de tu cuenta de Tinvana.','Crear nueva contraseña','30 minutos'],
   'test'=>['Correo de prueba','Si recibes este mensaje, el envío de correos de Tinvana funciona correctamente.','Abrir Tinvana','']
  ];
  [$title,$text,$action,$expires]=$map[$purpose]??$map['reset'];$test=$purpose==='test';
  $note=$test?'Este es un mensaje de prueba. No necesitas hacer nada.':'Enlace de un solo uso, válido por '.$expires.'. Si no lo solicitaste, ignora este correo.';
  $preheader=$test?$title.' de Tinvana.':$title.' en Tinvana. Tu enlace vence en '.$expires.'.';
  $html='<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>'.$e($title).'</title></head>'
   .'<body style="margin:0;background:#fff8f1;color:#1e1e1e;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">'.$e($preheader).'</div>'
   .'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">'
   .'<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #ffe0cd;border-radius:20px;overflow:hidden">'
   .'<tr><td align="center" bgcolor="#1e1e1e" style="background:#1e1e1e;padding:26px 28px"><img src="cid:tinvana-logo" width="170" height="40" alt="Tinvana" style="display:block;border:0;width:170px;height:40px"></td></tr>'
   .'<tr><td style="height:4px;line-height:4px;font-size:0;background:#ff6a00">&nbsp;</td></tr>'
   .'<tr><td style="padding:34px 30px 30px"><h1 style="font-size:26px;line-height:1.3;letter-spacing:-.5px;margin:0 0 18px;color:#1e1e1e">'.$e($title).'</h1>'
   .'<p style="font-size:16px;line-height:1.7;margin:0 0 26px;color:#3b3029">'.$e($text).'</p>'
   .'<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#ff6a00" style="border-radius:12px"><a href="'.$e($url).'" style="display:inline-block;padding:16px 24px;color:#1e1e1e;font-size:15px;font-weight:bold;text-decoration:none">'.$e($action).'</a></td></tr></table>'
   .'<p style="font-size:13px;line-height:1.6;margin:26px 0 0;color:#75665c">'.$e($note).'</p>'
   .($test?'':'<p style="font-size:12px;line-height:1.6;margin:18px 0 0;color:#75665c;word-break:break-all">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="'.$e($url).'" style="color:#974000">'.$e($url).'</a></p>')
   .'</td></tr>'
   .'<tr><td align="center" style="padding:18px 30px;background:#fff8f1;border-top:1px solid #ffe0cd;font-size:12px;color:#75665c">Tinvana · Ideas que toman vuelo.</td></tr>'
   .'</table></td></tr></table></body></html>';
  return ['subject'=>$title.' · Tinvana','html'=>$html,'text'=>$title."\n\n".$text."\n\n".$url."\n\n".$note];
 }
 // Safe one-line description of a failure: class and message without addresses, links or credentials.
 public static function describe(\Throwable $e):string {
  $m=preg_replace('~https?://\S+~i','[url]',$e->getMessage())??'';$m=preg_replace('~[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}~i','[email]',$m)??'';
  foreach(['SMTP_PASSWORD','RESEND_API_KEY','SMTP_USERNAME'] as $key){$secret=Support::env($key);if($secret!=='')$m=str_replace($secret,'[hidden]',$m);}
  return (new \ReflectionClass($e))->getShortName().': '.mb_substr(trim(preg_replace('/\s+/',' ',$m)??''),0,240);
 }
 // Configuration and delivery check for the console and one-off scripts. Never prints secret values.
 public static function diagnose(string $to):array {
  $lines=[];$ok=true;$add=function(string $text) use(&$lines){$lines[]=$text;};$flag=fn(bool $v)=>$v?'ok':'FALTA';
  $transport=Support::env('MAIL_TRANSPORT','smtp');$from=Support::env('MAIL_FROM_ADDRESS');
  $add('Transporte: '.$transport);$add('MAIL_FROM_ADDRESS válido: '.$flag((bool)filter_var($from,FILTER_VALIDATE_EMAIL)));$add('APP_URL con https: '.$flag(str_starts_with(Support::env('APP_URL'),'https://')));
  if($transport==='resend'){$add('RESEND_API_KEY definido: '.$flag(Support::env('RESEND_API_KEY')!==''));$errno=0;$err='';$t=microtime(true);$socket=@stream_socket_client('ssl://api.resend.com:443',$errno,$err,8,STREAM_CLIENT_CONNECT,stream_context_create(['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]));if($socket){fclose($socket);$add('Conexión HTTPS con api.resend.com: ok ('.round((microtime(true)-$t)*1000).' ms)');}else{$ok=false;$add('Conexión HTTPS con api.resend.com: FALLA ('.($err!==''?preg_replace('/\s+/',' ',$err):'sin detalle').'). Si el hosting bloquea la salida o falta el certificado raíz, define HTTP_CA_BUNDLE.');}}
  elseif($transport==='smtp'){
   $host=Support::env('SMTP_HOST');$port=(int)Support::env('SMTP_PORT','587');$enc=Support::env('SMTP_ENCRYPTION','tls');
   $add('SMTP_HOST definido: '.$flag($host!==''));$add('SMTP_PORT permitido (465, 587 o 2525): '.$flag(in_array($port,[465,587,2525],true)).' ('.$port.')');$add('SMTP_ENCRYPTION (tls o smtps): '.$flag(in_array($enc,['tls','smtps'],true)).' ('.$enc.')');
   $add('SMTP_USERNAME definido: '.$flag(Support::env('SMTP_USERNAME')!==''));$add('SMTP_PASSWORD definido: '.$flag(Support::env('SMTP_PASSWORD')!==''));
   if($host!==''&&$port>0){$errno=0;$err='';$t=microtime(true);$socket=@stream_socket_client(($enc==='smtps'?'ssl://':'tcp://').$host.':'.$port,$errno,$err,8,STREAM_CLIENT_CONNECT,stream_context_create(['ssl'=>['verify_peer'=>false,'verify_peer_name'=>false]]));
    if($socket){fclose($socket);$add('Conexión al servidor SMTP: ok ('.round((microtime(true)-$t)*1000).' ms)');}else{$ok=false;$add('Conexión al servidor SMTP: FALLA ('.($err!==''?preg_replace('/\s+/',' ',$err):'sin detalle').'). Revisa host, puerto y si el hosting bloquea la salida.');}
    if($socket&&$enc==='smtps'&&!in_array(strtolower($host),['localhost','127.0.0.1','::1'],true)){$verified=@stream_socket_client('ssl://'.$host.':'.$port,$errno,$err,8,STREAM_CLIENT_CONNECT,stream_context_create(['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]));if($verified){fclose($verified);$add('Certificado TLS del servidor: válido');}else{$ok=false;$add('Certificado TLS del servidor: NO VÁLIDO para '.$host.'. Usa el nombre que figura en el certificado o SMTP_HOST=localhost.');}}
   }
  }else{$ok=false;$add('MAIL_TRANSPORT debe ser smtp o resend.');}
  if(!self::configured()){$ok=false;$add('Configuración completa: NO. Corrige lo marcado como FALTA.');}
  else{
   try{self::send($to,'test',rtrim(Support::env('APP_URL'),'/').'/login','mail-test-'.bin2hex(random_bytes(6)));$add('Envío de prueba a '.$to.': aceptado por el proveedor. Revisa la bandeja de entrada y el correo no deseado.');}
   catch(\Throwable $e){$ok=false;$add('Envío de prueba: FALLA ('.self::describe($e).')');}
  }
  try{$rows=Database::all('SELECT status,COUNT(*) AS n FROM account_mail GROUP BY status');$add('Cola de correos: '.($rows?implode(', ',array_map(fn($r)=>$r['status'].'='.$r['n'],$rows)):'vacía').'. Se envía con el cron "mail:work" cada minuto.');}
  catch(\Throwable $e){$add('Cola de correos: no se pudo consultar ('.self::describe($e).')');}
  return ['ok'=>$ok,'lines'=>$lines];
 }
 public static function send(string $email,string $purpose,string $url,string $id=''):void {
  if(Support::env('MAIL_TRANSPORT','smtp')==='resend'){
   self::ready();$content=self::template($purpose,$url);$html=str_replace('cid:tinvana-logo',Support::escape(rtrim(Support::env('APP_URL'),'/').'/brand/tinvana-mail.png'),$content['html']);$curl=curl_init('https://api.resend.com/emails');$data=['from'=>'Tinvana <'.Support::env('MAIL_FROM_ADDRESS').'>','to'=>[$email],'subject'=>$content['subject'],'html'=>$html,'text'=>$content['text']];
   curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>Support::json($data),CURLOPT_HTTPHEADER=>['Content-Type: application/json','Authorization: Bearer '.Support::env('RESEND_API_KEY'),'Idempotency-Key: account-mail-'.$id],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>20,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);
   if(Support::env('HTTP_CA_BUNDLE'))curl_setopt($curl,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
   $result=curl_exec($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);if($result===false||$status<200||$status>=300||!is_string(json_decode($result,true)['id']??null)){$detail=is_string($result)?(string)(json_decode($result,true)['message']??''):'';$key=Support::env('RESEND_API_KEY');if($key!=='')$detail=str_replace($key,'[hidden]',$detail);$detail=mb_substr(trim(preg_replace('/\s+/',' ',$detail)??''),0,160);throw new \RuntimeException('El proveedor no aceptó el correo (HTTP '.$status.($detail!==''?': '.$detail:'').').');}return;
  }
  self::ready();$m=new PHPMailer(true);$m->isSMTP();$m->Host=Support::env('SMTP_HOST');$m->Port=(int)Support::env('SMTP_PORT','587');$m->SMTPAuth=true;$m->Username=Support::env('SMTP_USERNAME');$m->Password=Support::env('SMTP_PASSWORD');$m->SMTPSecure=Support::env('SMTP_ENCRYPTION','tls')==='smtps'?PHPMailer::ENCRYPTION_SMTPS:PHPMailer::ENCRYPTION_STARTTLS;$m->Timeout=15;if(in_array(strtolower(Support::env('SMTP_HOST')),['localhost','127.0.0.1','::1'],true))$m->SMTPOptions=['ssl'=>['verify_peer'=>false,'verify_peer_name'=>false,'allow_self_signed'=>true]];$m->getSMTPInstance()->Timelimit=20;$m->SMTPDebug=0;$m->CharSet='UTF-8';$m->setFrom(Support::env('MAIL_FROM_ADDRESS'),'Tinvana');$m->addAddress($email);$m->addEmbeddedImage(dirname(__DIR__).'/public/brand/tinvana-mail.png','tinvana-logo','tinvana.png');$content=self::template($purpose,$url);$m->isHTML(true);$m->Subject=$content['subject'];$m->Body=$content['html'];$m->AltBody=$content['text'];$m->send();
 }
 public static function work(int $max=20):array {
  self::ready();$sent=0;$failed=0;$db=Database::connection();
  for($i=0;$i<$max;$i++){
   $db->beginTransaction();try{$r=Database::one("SELECT m.*,t.user_id,t.purpose,t.expires_at,t.used_at,u.email FROM account_mail m JOIN account_tokens t ON t.id=m.token_id JOIN users u ON u.id=t.user_id WHERE (m.status='pending' AND m.next_attempt_at<=now()) OR (m.status='processing' AND m.locked_at<now()-interval '3 minutes') ORDER BY m.created_at FOR UPDATE OF m SKIP LOCKED LIMIT 1");if(!$r){$db->commit();break;}if($r['used_at']||strtotime($r['expires_at'])<=time()) {Database::query("UPDATE account_mail SET status='cancelled',payload_ciphertext=null,updated_at=now() WHERE id=?",[$r['id']]);$db->commit();continue;}Database::query("UPDATE account_mail SET status='processing',locked_at=now(),updated_at=now() WHERE id=?",[$r['id']]);$db->commit();}catch(\Throwable $e){$db->rollBack();throw $e;}
   $attempt=(int)$r['attempts']+1;try{$payload=json_decode(Crypto::decrypt($r['payload_ciphertext'],'account-mail:'.$r['id']),true,32,JSON_THROW_ON_ERROR);self::send($r['email'],$r['purpose'],$payload['url'],$r['id']);Database::query("UPDATE account_mail SET status='sent',payload_ciphertext=null,attempts=?,locked_at=null,last_error=null,updated_at=now() WHERE id=?",[$attempt,$r['id']]);$sent++;}catch(\Throwable $failure){error_log('Zenzales mail: '.self::describe($failure));$clearPayload=Database::driver()==='mysql'?($attempt>=5?1:0):($attempt>=5?'true':'false');Database::query("UPDATE account_mail SET status=?,attempts=?,locked_at=null,next_attempt_at=now()+(? * interval '1 second'),last_error='No fue posible enviar el correo con el proveedor configurado.',updated_at=now(),payload_ciphertext=CASE WHEN ? THEN null ELSE payload_ciphertext END WHERE id=?",[$attempt>=5?'failed':'pending',$attempt,min(900,60*2**($attempt-1)),$clearPayload,$r['id']]);$failed++;}
  }return ['sent'=>$sent,'failed'=>$failed];
 }
}
