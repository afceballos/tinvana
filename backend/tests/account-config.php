<?php
foreach(json_decode(file_get_contents(dirname(__DIR__,2).'/.tools/test-env.json'),true) as $key=>$value)$_ENV[$key]=(string)$value;
if($_ENV['DB_HOST']!=='127.0.0.1'||$_ENV['DB_DATABASE']!=='zenzales_test')throw new RuntimeException('Account tests require isolated local PostgreSQL.');
$_ENV['APP_URL']='http://127.0.0.1:8084';$_ENV['APP_ENV']='test';$_ENV['MAIL_TRANSPORT']='smtp';$_ENV['MAIL_FROM_ADDRESS']='no-reply@example.test';$_ENV['SMTP_HOST']='127.0.0.1';$_ENV['SMTP_PORT']='2525';$_ENV['SMTP_ENCRYPTION']='smtps';$_ENV['SMTP_USERNAME']='test-user';$_ENV['SMTP_PASSWORD']='test-only-password';
require_once dirname(__DIR__).'/bootstrap.php';
