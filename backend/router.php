<?php
declare(strict_types=1);
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
// Development only. Serve known public files, never backend config or source.
$file=realpath(__DIR__.'/public/'.$path);$root=realpath(__DIR__.'/public');
if($file&&str_starts_with($file,$root.DIRECTORY_SEPARATOR)&&is_file($file)&&pathinfo($file,PATHINFO_EXTENSION)!=='php')return false;
require __DIR__.'/public/index.php';
