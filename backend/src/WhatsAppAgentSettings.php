<?php
declare(strict_types=1);
namespace App;

/**
 * WhatsApp AI agent settings. Built-in defaults <- platform defaults set by a superadmin (app_settings
 * 'whatsapp_agent_defaults') <- the store's own settings. A store that never saved inherits later changes of the
 * platform defaults; "restore" deletes its own row.
 */
final class WhatsAppAgentSettings {
 public const TONES=['cercano'=>'Cercano y amable','profesional'=>'Profesional','entusiasta'=>'Entusiasta'];
 public const LENGTHS=['breve'=>'Breve y al punto','normal'=>'Normal'];
 public const BUILT_IN=[
  'enabled'=>true,'tone'=>'cercano','instructions'=>'','length'=>'breve',
  'handoff'=>['customer_asks'=>true,'complaint'=>true,'unknown'=>true,'no_sheet'=>true,'custom'=>''],
  'schedule'=>['days'=>[1,2,3,4,5,6],'start'=>'08:00','end'=>'20:00','off_hours'=>'reply'],
  'messages'=>[
   'off_hours'=>'¡Gracias por escribirnos! Estamos fuera de horario. Un asesor te responderá apenas abramos.',
   'fallback'=>'Gracias por tu mensaje. En un momento un asesor te ayuda.',
   'unsupported'=>'Por ahora solo puedo leer mensajes de texto. ¿Me lo escribes, por favor?',
  ],
 ];

 private static function str(mixed $v,int $max,string $label,bool $required=false): string {
  if($v===null)$v='';if(!is_string($v))throw new HttpError(422,'Texto inválido en «'.$label.'».');
  $v=trim($v);if(mb_strlen($v)>$max)throw new HttpError(422,'«'.$label.'» admite hasta '.$max.' caracteres.');
  if($required&&$v==='')throw new HttpError(422,'Escribe «'.$label.'».');return $v;
 }
 private static function time(mixed $v,string $label): string {
  if(!is_string($v)||!preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/D',$v))throw new HttpError(422,'Hora inválida en «'.$label.'». Usa el formato 08:00.');return $v;
 }
 /** Validates a complete settings object. */
 public static function clean(mixed $b): array {
  if(!is_array($b))throw new HttpError(422,'Ajustes inválidos.');
  $tone=$b['tone']??null;if(!is_string($tone)||!isset(self::TONES[$tone]))throw new HttpError(422,'Elige un tono.');
  $length=$b['length']??null;if(!is_string($length)||!isset(self::LENGTHS[$length]))throw new HttpError(422,'Elige el largo de las respuestas.');
  $h=is_array($b['handoff']??null)?$b['handoff']:[];$s=is_array($b['schedule']??null)?$b['schedule']:[];$m=is_array($b['messages']??null)?$b['messages']:[];
  $days=$s['days']??null;if(!is_array($days))throw new HttpError(422,'Elige los días de atención.');
  $days=array_values(array_unique(array_map(fn($d)=>is_int($d)&&$d>=1&&$d<=7?$d:throw new HttpError(422,'Día inválido.'),$days)));sort($days);
  $start=self::time($s['start']??null,'Desde');$end=self::time($s['end']??null,'Hasta');
  if($start>=$end)throw new HttpError(422,'La hora de cierre debe ser posterior a la de apertura.');
  $off=$s['off_hours']??null;if(!in_array($off,['reply','handoff'],true))throw new HttpError(422,'Elige qué hace la IA fuera de horario.');
  $bool=fn($v)=>is_bool($v)?$v:throw new HttpError(422,'Valor inválido en los motivos para pasar a un asesor.');
  return [
   'enabled'=>is_bool($b['enabled']??null)?$b['enabled']:throw new HttpError(422,'Indica si el agente está activo.'),
   'tone'=>$tone,'instructions'=>self::str($b['instructions']??'',600,'Instrucciones adicionales'),'length'=>$length,
   'handoff'=>['customer_asks'=>$bool($h['customer_asks']??null),'complaint'=>$bool($h['complaint']??null),'unknown'=>$bool($h['unknown']??null),'no_sheet'=>$bool($h['no_sheet']??null),'custom'=>self::str($h['custom']??'',400,'Otros motivos')],
   'schedule'=>['days'=>$days,'start'=>$start,'end'=>$end,'off_hours'=>$off],
   'messages'=>['off_hours'=>self::str($m['off_hours']??null,300,'Mensaje fuera de horario',true),'fallback'=>self::str($m['fallback']??null,300,'Mensaje si la IA falla',true),'unsupported'=>self::str($m['unsupported']??null,300,'Mensaje para archivos no compatibles',true)],
  ];
 }
 /** Platform defaults (built-in values when the superadmin never saved). */
 public static function defaults(): array {
  $row=Database::one("SELECT value FROM app_settings WHERE setting_key='whatsapp_agent_defaults'");
  if(!$row)return self::BUILT_IN;
  try{return self::clean(json_decode((string)$row['value'],true));}catch(HttpError){return self::BUILT_IN;}
 }
 /** Effective settings of a store and whether they are its own. */
 public static function forUser(string $owner): array {
  $row=Database::one('SELECT settings FROM whatsapp_agent_settings WHERE user_id=?',[$owner]);
  if($row){try{return ['settings'=>self::clean(json_decode((string)$row['settings'],true)),'custom'=>true];}catch(HttpError){}}
  return ['settings'=>self::defaults(),'custom'=>false];
 }
 public static function save(string $owner,array $b): array {
  $value=Support::json(self::clean($b));
  if(Database::one('SELECT user_id FROM whatsapp_agent_settings WHERE user_id=?',[$owner]))Database::query('UPDATE whatsapp_agent_settings SET settings=?::jsonb,updated_at=now() WHERE user_id=?',[$value,$owner]);
  else Database::query('INSERT INTO whatsapp_agent_settings(user_id,settings) VALUES(?,?::jsonb)',[$owner,$value]);
  return self::forUser($owner);
 }
 public static function restore(string $owner): array {Database::query('DELETE FROM whatsapp_agent_settings WHERE user_id=?',[$owner]);return self::forUser($owner);}
 /** Superadmin: change the platform defaults (audited by the caller). */
 public static function saveDefaults(array $b): array {
  $value=Support::json(self::clean($b));
  if(Database::one("SELECT setting_key FROM app_settings WHERE setting_key='whatsapp_agent_defaults'"))Database::query("UPDATE app_settings SET value=?::jsonb,updated_at=now() WHERE setting_key='whatsapp_agent_defaults'",[$value]);
  else Database::query("INSERT INTO app_settings(setting_key,value) VALUES('whatsapp_agent_defaults',?::jsonb)",[$value]);
  return self::defaults();
 }
 /** Whether the agent may answer now (Colombia time). */
 public static function inHours(array $s,?\DateTimeImmutable $now=null): bool {
  $now=($now??new \DateTimeImmutable('now'))->setTimezone(new \DateTimeZone('America/Bogota'));
  return in_array((int)$now->format('N'),$s['schedule']['days'],true)&&$now->format('H:i')>=$s['schedule']['start']&&$now->format('H:i')<$s['schedule']['end'];
 }
 public static function catalog(): array {return ['tones'=>self::TONES,'lengths'=>self::LENGTHS,'built_in'=>self::BUILT_IN];}
}
