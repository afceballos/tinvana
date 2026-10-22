<?php
declare(strict_types=1);
// Runs AccountMail::diagnose against the local test SMTP server (see tests/mail-local.mjs). No external service is contacted.
namespace App;
require __DIR__.'/account-config.php';
$_ENV['MAIL_FROM_ADDRESS']=$argv[2]??'admin@tinbana.test';
$result=AccountMail::diagnose($argv[1]??'admin@tinbana.test');
echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),PHP_EOL;
