<?php
// Isolated HTTP integration test server; never part of the public directory.
foreach(json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-env.json'),true) as $key=>$value)$_ENV[$key]=(string)$value;
if($_ENV['DB_HOST']!=='127.0.0.1'||$_ENV['DB_DATABASE']!=='zenzales_test')throw new RuntimeException('AI fixtures require isolated local PostgreSQL.');
$_ENV['OPENAI_API_KEY']='never-use-this-global-test-key';$_ENV['AI_DAILY_LIMIT']='4';$_ENV['APP_URL']='http://127.0.0.1:8083';
require __DIR__.'/ai-transport.php';
return require dirname(__DIR__).'/router.php';
