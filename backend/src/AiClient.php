<?php
declare(strict_types=1);
namespace App;
final class AiClient {
 public static function model(string $provider='openai'):string {AiConnections::provider($provider);return $provider==='openai'?Support::env('OPENAI_MODEL','gpt-4.1-mini'):Support::env('CLAUDE_MODEL','claude-haiku-5-5');}
 public static function request(array $input,array $schema,array $credentials):array {
  $provider=AiConnections::provider($credentials['provider']??null);$key=AiConnections::key($credentials['key']??null);
  if($provider==='openai')$payload=['model'=>self::model($provider),'store'=>false,'max_output_tokens'=>6000,'instructions'=>AiLanding::instructions(),'input'=>[['role'=>'user','content'=>Support::json($input)]],'text'=>['format'=>['type'=>'json_schema','name'=>'landing_proposal','strict'=>true,'schema'=>$schema]]];
  else $payload=['model'=>self::model($provider),'max_tokens'=>6000,'system'=>AiLanding::instructions(),'messages'=>[['role'=>'user','content'=>Support::json($input)]],'output_config'=>['format'=>['type'=>'json_schema','schema'=>$schema]]];
  $json=self::send($provider,$key,$provider==='openai'?'/v1/responses':'/v1/messages',$payload);
  return $provider==='openai'?self::parse($json):self::parseClaude($json);
 }
 public static function test(string $provider,string $key):void {$json=self::send($provider,AiConnections::key($key),'/v1/models/'.rawurlencode(self::model($provider)),null);if(!is_string($json['id']??null))throw new HttpError(502,'El proveedor no confirmó acceso al modelo configurado.');}
 private static function send(string $provider,string $key,string $path,?array $payload):array {
  AiConnections::provider($provider);$name=$provider==='openai'?'OpenAI':'Claude';
  if(!extension_loaded('curl'))throw new HttpError(503,'El servidor necesita PHP cURL para conectar con la IA.');
  $curl=curl_init(($provider==='openai'?'https://api.openai.com':'https://api.anthropic.com').$path);$body='';$tooLarge=false;
  $headers=['Content-Type: application/json','Accept: application/json'];if($provider==='openai')$headers[]='Authorization: Bearer '.$key;else {$headers[]='x-api-key: '.$key;$headers[]='anthropic-version: 2023-06-01';}
  curl_setopt_array($curl,[CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>90,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_HTTPHEADER=>$headers,CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use(&$body,&$tooLarge){if(strlen($body)+strlen($chunk)>1000000){$tooLarge=true;return 0;}$body.=$chunk;return strlen($chunk);}]);
  if($payload!==null)curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>Support::json($payload)]);
  if(Support::env('HTTP_CA_BUNDLE')!=='')curl_setopt($curl,CURLOPT_CAINFO,Support::env('HTTP_CA_BUNDLE'));
  $ok=curl_exec($curl);$status=(int)curl_getinfo($curl,CURLINFO_RESPONSE_CODE);$code=curl_errno($curl);curl_close($curl);
  if($tooLarge)throw new HttpError(502,'La IA devolvió una respuesta demasiado grande.');
  if($ok===false)throw new HttpError(502,$code===CURLE_OPERATION_TIMEDOUT?'La IA tardó demasiado. No se cambiaron tus datos. Revisa tu consumo antes de volver a intentar.':'No fue posible conectar con la IA. No se cambiaron tus datos.',['transport_code'=>$code]);
  $json=json_decode($body,true);
  if($status<200||$status>=300){$messages=[401=>'La clave de '.$name.' fue rechazada.',403=>$name.' no permite esta solicitud para la cuenta configurada.',429=>$name.' rechazó la solicitud por cuota o límites. Revisa el saldo y los límites de tu cuenta.'];throw new HttpError(502,$messages[$status]??($name.' respondió HTTP '.$status.'. Revisa la configuración del modelo o intenta más tarde.'),['upstream_status'=>$status]);}
  if(!is_array($json))throw new HttpError(502,$name.' no devolvió JSON válido.');
  return $json;
 }
 public static function parseClaude(array $response):array {
  if(($response['stop_reason']??'')==='refusal')throw new HttpError(422,'Claude no pudo generar contenido para esta solicitud.');
  if(($response['stop_reason']??'')!=='end_turn')throw new HttpError(502,'Claude no completó la generación. No se aplicaron cambios.');
  $parts=[];foreach($response['content']??[] as $part)if(($part['type']??'')==='text')$parts[]=['type'=>'output_text','text'=>$part['text']??''];
  return self::parse(['status'=>'completed','output'=>[['content'=>$parts]],'usage'=>$response['usage']??[]]);
 }
 public static function parse(array $response):array {
  if(($response['status']??'')!=='completed')throw new HttpError(502,'La generación no se completó. No se aplicaron cambios.');
  $text='';foreach($response['output']??[] as $item)foreach($item['content']??[] as $part){if(($part['type']??'')==='refusal')throw new HttpError(422,'La IA no pudo generar contenido para esta solicitud.');if(($part['type']??'')==='output_text')$text.=$part['text']??'';}
  try{$data=json_decode($text,true,64,JSON_THROW_ON_ERROR);}catch(\JsonException){throw new HttpError(502,'La IA devolvió contenido estructurado inválido.');}
  if(!is_array($data)||array_is_list($data))throw new HttpError(502,'La IA no devolvió una propuesta válida.');
  return ['proposal'=>$data,'usage'=>['inputTokens'=>(int)($response['usage']['input_tokens']??0),'outputTokens'=>(int)($response['usage']['output_tokens']??0)]];
 }
}
