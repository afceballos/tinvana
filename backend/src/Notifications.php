<?php
declare(strict_types=1);
namespace App;

/**
 * Store notifications: a feed for the panel bell (the panel adds sound and a browser notification while it is open)
 * and an optional email per notification, sent by the mail:work cron through the same transport and Tinbana layout
 * as account and order emails. Per-store settings choose which events notify and through which channels.
 */
final class Notifications {
 public const EVENTS=['handoff'=>'La IA pasó un chat a un asesor','ai_failure'=>'La IA no pudo responder','limit'=>'Se alcanzó el límite mensual de la IA','off_hours'=>'Mensaje fuera del horario de atención','new_chat'=>'Llegó un chat nuevo sin IA disponible','order_confirmed'=>'Un cliente confirmó su pedido por WhatsApp','order_change'=>'Un cliente pidió cambios en su pedido por WhatsApp','chat_order'=>'Un cliente armó un pedido en el chat de WhatsApp','order_novelty'=>'Un pedido tiene una novedad en la entrega (Dropi)','order_no_answer'=>'Un cliente no respondió la confirmación de su pedido'];
 public const CHANNELS=['panel'=>'Campanita en el panel','sound'=>'Sonido mientras Tinbana está abierto','browser'=>'Notificación del navegador','email'=>'Correo'];
 private const DEFAULTS=['events'=>['handoff'=>true,'ai_failure'=>true,'limit'=>true,'off_hours'=>true,'new_chat'=>true,'order_confirmed'=>true,'order_change'=>true,'chat_order'=>true,'order_novelty'=>true,'order_no_answer'=>true],'channels'=>['panel'=>true,'sound'=>true,'browser'=>true,'email'=>true],'email'=>''];

 private static function accountEmail(string $owner): string {return (string)(Database::one('SELECT email FROM users WHERE id=?',[$owner])['email']??'');}
 public static function settings(string $owner): array {
  $row=Database::one('SELECT settings FROM notification_settings WHERE user_id=?',[$owner]);$s=self::DEFAULTS;
  $saved=$row?json_decode((string)$row['settings'],true):null;
  if(is_array($saved)){foreach(['events','channels'] as $g)foreach($s[$g] as $k=>$_)if(is_bool($saved[$g][$k]??null))$s[$g][$k]=$saved[$g][$k];if(is_string($saved['email']??null))$s['email']=$saved['email'];}
  return $s;
 }
 public static function view(string $owner): array {
  return ['settings'=>self::settings($owner),'events'=>self::EVENTS,'channels'=>self::CHANNELS,'account_email'=>self::accountEmail($owner)];
 }
 public static function save(string $owner,array $b): array {
  $s=self::DEFAULTS;
  foreach(['events','channels'] as $g)foreach($s[$g] as $k=>$_){$v=$b[$g][$k]??null;if(!is_bool($v))throw new HttpError(422,'Ajuste de notificaciones inválido.');$s[$g][$k]=$v;}
  $email=trim(is_string($b['email']??null)?$b['email']:'');
  if($email!==''&&(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254))throw new HttpError(422,'Escribe un correo válido o déjalo vacío para usar el de tu cuenta.');
  $s['email']=$email;$value=Support::json($s);
  if(Database::one('SELECT user_id FROM notification_settings WHERE user_id=?',[$owner]))Database::query('UPDATE notification_settings SET settings=?::jsonb,updated_at=now() WHERE user_id=?',[$value,$owner]);
  else Database::query('INSERT INTO notification_settings(user_id,settings) VALUES(?,?::jsonb)',[$owner,$value]);
  return self::view($owner);
 }

 /** Records a notification if the event is enabled; queues its email when that channel is on. */
 public static function notify(string $owner,string $kind,string $title,string $body,?string $link=null,?string $conversationId=null): void {
  if(!isset(self::EVENTS[$kind]))return;$s=self::settings($owner);if(!$s['events'][$kind])return;
  if(!in_array(true,$s['channels'],true))return;
  $to=$s['channels']['email']?($s['email']!==''?$s['email']:self::accountEmail($owner)):'';
  Database::query('INSERT INTO notifications(id,user_id,kind,title,body,link,conversation_id,email_status,email_to) VALUES(?,?,?,?,?,?,?,?,?)',
   [Support::uuid(),$owner,$kind,mb_substr($title,0,200),mb_substr($body,0,500),$link,$conversationId,filter_var($to,FILTER_VALIDATE_EMAIL)?'pending':'skipped',filter_var($to,FILTER_VALIDATE_EMAIL)?$to:null]);
 }
 /** Latest notifications and the unread count, for the bell (polled without renewing the session). */
 public static function feed(string $owner,array $q): array {
  $s=self::settings($owner);
  $unread=(int)(Database::one('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL',[$owner])['n']??0);
  $latest=Database::one('SELECT MAX(created_at) AS t FROM notifications WHERE user_id=?',[$owner])['t']??null;
  $stamp=hash('sha256',$unread.'|'.$latest);
  if(($q['stamp']??'')===$stamp)return ['unchanged'=>true,'stamp'=>$stamp];
  $items=array_map(fn($r)=>['id'=>$r['id'],'kind'=>$r['kind'],'title'=>$r['title'],'body'=>$r['body'],'link'=>$r['link'],'read'=>$r['read_at']!==null,'created_at'=>$r['created_at']],
   Database::all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 30',[$owner]));
  return ['stamp'=>$stamp,'unread'=>$unread,'items'=>$items,'channels'=>$s['channels']];
 }
 public static function markRead(string $owner,array $b): array {
  $ids=$b['ids']??null;
  if($ids==='all')Database::query('UPDATE notifications SET read_at=now() WHERE user_id=? AND read_at IS NULL',[$owner]);
  elseif(is_array($ids)){$ids=array_values(array_filter($ids,fn($i)=>is_string($i)&&Support::isUuid($i)));if($ids)Database::query('UPDATE notifications SET read_at=now() WHERE user_id=? AND read_at IS NULL AND id IN ('.implode(',',array_fill(0,count($ids),'?')).')',array_merge([$owner],array_slice($ids,0,100)));}
  else throw new HttpError(422,'Indica qué notificaciones marcar como leídas.');
  return self::feed($owner,[]);
 }
 /** @return array{subject:string,html:string,text:string} */
 public static function render(array $n): array {
  $e=fn($v)=>Support::escape((string)$v);$url=rtrim(Support::env('APP_URL'),'/').($n['link']??'/panel');
  $body='<p style="font-size:16px;line-height:1.7;margin:0 0 22px;color:#3b3029">'.$e($n['body']).'</p>'
   .'<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#ff6a00" style="border-radius:12px"><a href="'.$e($url).'" style="display:inline-block;padding:16px 24px;color:#1e1e1e;font-size:15px;font-weight:bold;text-decoration:none">Abrir en Tinbana</a></td></tr></table>'
   .'<p style="font-size:13px;line-height:1.6;margin:22px 0 0;color:#75665c">Puedes cambiar qué te avisamos en Tinbana → Notificaciones.</p>';
  return ['subject'=>$n['title'].' · Tinbana','html'=>AccountMail::layout($n['title'],$n['body'],$body),'text'=>$n['title']."\n\n".$n['body']."\n\nAbrir en Tinbana: ".$url."\n"];
 }
 /** Sends pending notification emails (called by mail:work). Up to 5 attempts with backoff; nothing is resent once sent. */
 public static function work(int $max=20): array {
  $sent=0;$failed=0;try{AccountMail::ready();}catch(HttpError){return ['sent'=>0,'failed'=>0,'skipped'=>'mail not configured'];}
  $db=Database::connection();
  for($i=0;$i<$max;$i++){
   $db->beginTransaction();
   try{$r=Database::one("SELECT * FROM notifications n WHERE (n.email_status='pending' AND n.next_attempt_at<=now()) OR (n.email_status='processing' AND n.locked_at<now()-interval '3 minutes') ORDER BY n.created_at FOR UPDATE OF n SKIP LOCKED LIMIT 1");
    if(!$r){$db->commit();break;}Database::query("UPDATE notifications SET email_status='processing',locked_at=now() WHERE id=?",[$r['id']]);$db->commit();}
   catch(\Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
   $attempt=(int)$r['attempts']+1;
   try{AccountMail::deliver((string)$r['email_to'],self::render($r),'notification-'.$r['id']);Database::query("UPDATE notifications SET email_status='sent',attempts=?,locked_at=NULL WHERE id=?",[$attempt,$r['id']]);$sent++;}
   catch(\Throwable $t){error_log('Tinbana notification mail: '.AccountMail::describe($t));
    Database::query("UPDATE notifications SET email_status=?,attempts=?,locked_at=NULL,next_attempt_at=now()+(? * interval '1 second') WHERE id=?",[$attempt>=5?'failed':'pending',$attempt,min(900,60*2**($attempt-1)),$r['id']]);$failed++;}
  }
  return ['sent'=>$sent,'failed'=>$failed];
 }
}
