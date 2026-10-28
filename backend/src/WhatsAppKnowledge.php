<?php
declare(strict_types=1);
namespace App;

/**
 * What the WhatsApp agent knows besides the product sheets:
 * - general instructions of the platform (superadmin, app_settings 'whatsapp_agent_prompt'), added to every store's;
 * - approved learnings (question → answer) of a store or of the whole platform (user_id NULL). A store can save an
 *   advisor's answer as a learning from the chat. The agent does not change by itself: it reuses what was approved.
 * Each answer receives the learnings that share the most words with the customer's last message and the memory.
 */
final class WhatsAppKnowledge {
 private const MAX_STORE=500;
 private const MAX_PLATFORM=1000;
 private const MAX_PROMPT=4000;
 private const PER_ANSWER=12;

 public static function prompt(): string {
  $row=Database::one("SELECT value FROM app_settings WHERE setting_key='whatsapp_agent_prompt'");
  $v=$row?json_decode((string)$row['value'],true):null;return is_string($v['text']??null)?$v['text']:'';
 }
 public static function savePrompt(mixed $text): string {
  if(!is_string($text))throw new HttpError(422,'Instrucciones inválidas.');$text=trim($text);
  if(mb_strlen($text)>self::MAX_PROMPT)throw new HttpError(422,'Las instrucciones generales admiten hasta '.self::MAX_PROMPT.' caracteres.');
  $value=Support::json(['text'=>$text]);
  if(Database::one("SELECT setting_key FROM app_settings WHERE setting_key='whatsapp_agent_prompt'"))Database::query("UPDATE app_settings SET value=?::jsonb,updated_at=now() WHERE setting_key='whatsapp_agent_prompt'",[$value]);
  else Database::query("INSERT INTO app_settings(setting_key,value) VALUES('whatsapp_agent_prompt',?::jsonb)",[$value]);
  return $text;
 }
 private static function view(array $r): array {return ['id'=>$r['id'],'question'=>$r['question'],'answer'=>$r['answer'],'from_chat'=>$r['source_conversation_id']!==null,'updated_at'=>$r['updated_at']];}
 /** Learnings of a store, or of the platform when $owner is null. */
 public static function list(?string $owner): array {
  $rows=$owner?Database::all('SELECT * FROM whatsapp_knowledge WHERE user_id=? ORDER BY updated_at DESC',[$owner]):Database::all('SELECT * FROM whatsapp_knowledge WHERE user_id IS NULL ORDER BY updated_at DESC');
  return ['items'=>array_map(self::view(...),$rows),'max'=>$owner?self::MAX_STORE:self::MAX_PLATFORM];
 }
 private static function text(mixed $v,int $max,string $label): string {
  if(!is_string($v))throw new HttpError(422,'Escribe '.$label.'.');$v=trim(preg_replace('/[ \t]+/',' ',$v)??'');
  if($v==='')throw new HttpError(422,'Escribe '.$label.'.');if(mb_strlen($v)>$max)throw new HttpError(422,ucfirst($label).' admite hasta '.$max.' caracteres.');return $v;
 }
 /** Creates ($id null) or updates a learning. $actor is who wrote it. */
 public static function save(?string $owner,?string $id,array $b,?string $actor): array {
  $q=self::text($b['question']??null,300,'la pregunta');$a=self::text($b['answer']??null,1500,'la respuesta');
  $source=$b['conversation_id']??null;
  if($source!==null&&(!is_string($source)||!Support::isUuid($source)||!$owner||!Database::one('SELECT id FROM whatsapp_conversations WHERE id=? AND user_id=?',[$source,$owner])))$source=null;
  if($id!==null){
   $row=self::owned($owner,$id);
   Database::query('UPDATE whatsapp_knowledge SET question=?,answer=?,updated_at=now() WHERE id=?',[$q,$a,$row['id']]);
  }else{
   $count=(int)(Database::one('SELECT COUNT(*) AS n FROM whatsapp_knowledge WHERE '.($owner?'user_id=?':'user_id IS NULL'),$owner?[$owner]:[])['n']??0);
   if($count>=($owner?self::MAX_STORE:self::MAX_PLATFORM))throw new HttpError(422,'Llegaste al máximo de aprendizajes. Elimina o une algunos antes de agregar más.');
   Database::query('INSERT INTO whatsapp_knowledge(id,user_id,question,answer,source_conversation_id,created_by) VALUES(?,?,?,?,?,?)',[Support::uuid(),$owner,$q,$a,$source,$actor]);
  }
  return self::list($owner)+['message'=>$id?'Aprendizaje actualizado.':'Aprendizaje guardado. El agente ya lo usa.'];
 }
 private static function owned(?string $owner,string $id): array {
  if(!Support::isUuid($id))throw new HttpError(404,'Aprendizaje no encontrado.');
  $row=$owner?Database::one('SELECT * FROM whatsapp_knowledge WHERE id=? AND user_id=?',[$id,$owner]):Database::one('SELECT * FROM whatsapp_knowledge WHERE id=? AND user_id IS NULL',[$id]);
  if(!$row)throw new HttpError(404,'Aprendizaje no encontrado.');return $row;
 }
 public static function delete(?string $owner,string $id): array {$row=self::owned($owner,$id);Database::query('DELETE FROM whatsapp_knowledge WHERE id=?',[$row['id']]);return self::list($owner)+['message'=>'Aprendizaje eliminado.'];}

 /** Lowercase words without accents, 4 letters or more (plus numbers), for a simple relevance score. */
 private static function words(string $text): array {
  $t=mb_strtolower(strtr($text,['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n','Á'=>'a','É'=>'e','Í'=>'i','Ó'=>'o','Ú'=>'u','Ñ'=>'n']));
  preg_match_all('/[a-z0-9]+/',$t,$m);
  $stop=['para','como','esta','este','tiene','tengo','quiero','puedo','donde','cuando','cual','cuales','sobre','hola','gracias','favor','pero','porque','también','tambien','ustedes','usted'];
  return array_values(array_unique(array_filter($m[0],fn($w)=>(strlen($w)>=4||ctype_digit($w))&&!in_array($w,$stop,true))));
 }
 /**
  * Learnings for one answer: store and platform ones that share words with the customer's message (and the memory),
  * best first. With few learnings (up to the limit) all are sent.
  * @return list<array{q:string,a:string}>
  */
 public static function relevant(string $owner,string $text): array {
  $rows=Database::all('SELECT question,answer,user_id FROM whatsapp_knowledge WHERE user_id=? OR user_id IS NULL ORDER BY updated_at DESC LIMIT 1500',[$owner]);
  if(count($rows)<=self::PER_ANSWER)return array_map(fn($r)=>['q'=>$r['question'],'a'=>$r['answer']],$rows);
  $want=self::words($text);if(!$want)return [];$scored=[];
  foreach($rows as $i=>$r){$have=self::words($r['question'].' '.$r['answer']);$hit=count(array_intersect($want,$have));
   // The store's own learnings win over the platform's on a tie.
   if($hit>0)$scored[]=[$hit+($r['user_id']!==null?0.5:0),-$i,$r];}
  rsort($scored);
  return array_map(fn($s)=>['q'=>$s[2]['question'],'a'=>$s[2]['answer']],array_slice($scored,0,self::PER_ANSWER));
 }
}
