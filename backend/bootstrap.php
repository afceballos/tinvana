<?php
declare(strict_types=1);
require __DIR__.'/vendor/autoload.php';
Dotenv\Dotenv::createImmutable(__DIR__)->safeLoad();
if(PHP_VERSION_ID<80200)throw new RuntimeException('Se requiere PHP 8.2 o superior.');
date_default_timezone_set('UTC');
