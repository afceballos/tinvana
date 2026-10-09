<?php
declare(strict_types=1);
namespace App;

final class Support {
 public static function uuid(): string { $b=random_bytes(16); $b[6]=chr((ord($b[6])&15)|64); $b[8]=chr((ord($b[8])&63)|128); $h=bin2hex($b); return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20); }
 public static function isUuid(string $s): bool { return (bool)preg_match('/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i',$s); }
 public static function json(mixed $v): string { return json_encode($v,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); }
 public static function env(string $key,string $default=''): string { return (string)($_ENV[$key]??getenv($key)?:$default); }
 public static function text(mixed $v,int $max=200,bool $required=true): string { if(!is_string($v)||strlen($v)>$max||($required&&trim($v)==='')) throw new HttpError(422,'Campo de texto inválido.'); return trim($v); }
 public static function escape(mixed $s): string { return htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
 public static function url(string $s): bool { return filter_var($s,FILTER_VALIDATE_URL)!==false && in_array(strtolower((string)parse_url($s,PHP_URL_SCHEME)),['http','https'],true); }
}
