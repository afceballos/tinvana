<?php
foreach(json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-env.json'),true) as $key=>$value)$_ENV[$key]=(string)$value;
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Database,Crypto};
if(Support::env('DB_DATABASE')!=='zenzales_test'||Support::env('DB_HOST')!=='127.0.0.1')throw new RuntimeException('Only isolated test database allowed.');
$f=json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-fixture.json'),true);$row=Database::one('SELECT key_ciphertext FROM ai_connections WHERE user_id=? AND provider=?',[$f['owner'],'openai']);
if(str_contains($row['key_ciphertext'],'test-key-')||Crypto::decrypt($row['key_ciphertext'],'ai-key:openai:'.$f['owner'])!=='test-key-owner-openai-123456789')throw new RuntimeException('Key not encrypted correctly.');
foreach(['ai-key:openai:'.$f['otherOwner'],'ai-key:anthropic:'.$f['owner']] as $context){$rejected=false;try{Crypto::decrypt($row['key_ciphertext'],$context);}catch(RuntimeException){$rejected=true;}if(!$rejected)throw new RuntimeException('Key context not authenticated.');}
echo "PASS encrypted AI key authenticated by owner and provider.\n";
