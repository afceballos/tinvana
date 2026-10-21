<?php
declare(strict_types=1);
// Test-only interception of OpenAI transport. Never loaded by application code.
namespace App;
function curl_init(?string $url=null):\CurlHandle|false {$handle=\curl_init($url);if($handle)$GLOBALS['ai_test_handles'][spl_object_id($handle)]=['url'=>$url,'options'=>[]];return $handle;}
function curl_setopt_array(\CurlHandle $handle,array $options):bool {$GLOBALS['ai_test_handles'][spl_object_id($handle)]['options']+=$options;return \curl_setopt_array($handle,$options);}
function curl_setopt(\CurlHandle $handle,int $option,mixed $value):bool {$GLOBALS['ai_test_handles'][spl_object_id($handle)]['options'][$option]=$value;return \curl_setopt($handle,$option,$value);}
function curl_exec(\CurlHandle $handle):string|bool {
 $captured=$GLOBALS['ai_test_handles'][spl_object_id($handle)];$host=parse_url($captured['url'],PHP_URL_HOST);if(!in_array($host,['api.openai.com','api.anthropic.com'],true))return \curl_exec($handle);
 $provider=$host==='api.openai.com'?'openai':'anthropic';$o=$captured['options'];if(($o[CURLOPT_SSL_VERIFYPEER]??null)!==true||($o[CURLOPT_SSL_VERIFYHOST]??null)!==2||($o[CURLOPT_FOLLOWLOCATION]??null)!==false||($o[CURLOPT_TIMEOUT]??null)!==90)throw new \RuntimeException('Unsafe AI transport options.');
 $headers=implode("\n",$o[CURLOPT_HTTPHEADER]);if(str_contains($headers,'never-use-this-global'))throw new \RuntimeException('Global key must never be used.');
 $account=$_SERVER['HTTP_X_AI_TEST_EXPECT_ACCOUNT']??null;if($account&&!str_contains($headers,'test-key-'.$account.'-'.$provider.'-123456789'))throw new \RuntimeException('Wrong account credentials.');
 if($provider==='anthropic'&&(!str_contains($headers,'x-api-key: ')||!str_contains($headers,'anthropic-version: 2023-06-01')))throw new \RuntimeException('Incorrect Anthropic headers.');
 $mode=$_SERVER['HTTP_X_AI_TEST_MODE']??'success';$status=$mode==='401'?401:200;$GLOBALS['ai_test_status'][spl_object_id($handle)]=$status;
 if(str_contains($captured['url'],'/v1/models/')){$response=$status===401?['error'=>['message'=>'Never echo the secret test-key-owner-openai-123456789']]:['id'=>basename($captured['url'])];$o[CURLOPT_WRITEFUNCTION]($handle,Support::json($response));return true;}
 $payload=json_decode($o[CURLOPT_POSTFIELDS],true);
 if($provider==='openai'){if($payload['store']!==false||$payload['text']['format']['strict']!==true||$payload['max_output_tokens']!==6000)throw new \RuntimeException('Unsafe OpenAI payload.');$input=json_decode($payload['input'][0]['content'],true);}
 else {if($payload['output_config']['format']['type']!=='json_schema'||$payload['max_tokens']!==6000)throw new \RuntimeException('Unsafe Claude payload.');$input=json_decode($payload['messages'][0]['content'],true);}
 if(array_diff(array_keys($input),['mode','preferences','sources','productName','imageCount','availableBlocks','target']))throw new \RuntimeException('AI prompt exposes unexpected data.');
 $source=$input['sources'][0];$type=$input['target']['type']??'hero';$variant=$input['target']['variant']??Blocks::registry()[$type]['variants'][0];
 $block=['type'=>$type,'variant'=>$variant,'title'=>'Propuesta de prueba aislada','subtitle'=>'','paragraphs'=>[['text'=>$source,'sourceIds'=>[0]]],'items'=>[],'imageIndex'=>null];
 $proposal=['title'=>'Propuesta de prueba aislada','description'=>$source,'seoTitle'=>'Propuesta de prueba aislada','seoDescription'=>$source,'sourceIds'=>[0],'blocks'=>[$block],'notes'=>['Respuesta controlada exclusivamente para pruebas.']];
 $mode=$_SERVER['HTTP_X_AI_TEST_MODE']??'success';$status=$mode==='401'?401:200;$GLOBALS['ai_test_status'][spl_object_id($handle)]=$status;
 if($mode==='invalid')$proposal['blocks'][0]['type']='testimonials';
 $response=$status===401?['error'=>['message'=>'Must never echo the secret test-key-owner-openai-123456789']]:($provider==='openai'?['status'=>'completed','output'=>[['type'=>'message','content'=>[['type'=>'output_text','text'=>Support::json($proposal)]]]],'usage'=>['input_tokens'=>80,'output_tokens'=>120]]:['type'=>'message','stop_reason'=>'end_turn','content'=>[['type'=>'text','text'=>Support::json($proposal)]],'usage'=>['input_tokens'=>90,'output_tokens'=>130]]);
 $body=Support::json($response);$o[CURLOPT_WRITEFUNCTION]($handle,$body);return true;
}
function curl_getinfo(\CurlHandle $handle,?int $option=null):mixed {if($option===CURLINFO_RESPONSE_CODE&&isset($GLOBALS['ai_test_status'][spl_object_id($handle)]))return $GLOBALS['ai_test_status'][spl_object_id($handle)];return $option===null?\curl_getinfo($handle):\curl_getinfo($handle,$option);}
function curl_errno(\CurlHandle $handle):int {return \curl_errno($handle);}
function curl_close(\CurlHandle $handle):void {unset($GLOBALS['ai_test_handles'][spl_object_id($handle)],$GLOBALS['ai_test_status'][spl_object_id($handle)]);\curl_close($handle);}
