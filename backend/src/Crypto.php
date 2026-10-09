<?php
declare(strict_types=1);
namespace App;
final class Crypto {
 private static function key(): string { $k=base64_decode(Support::env('TOKEN_ENCRYPTION_KEY'),true); if($k===false||strlen($k)!==32) throw new \RuntimeException('Falta una clave de cifrado válida de 32 bytes.');return $k; }
 public static function encrypt(string $token,string $context): string { $iv=random_bytes(12);$tag='';$cipher=openssl_encrypt($token,'aes-256-gcm',self::key(),OPENSSL_RAW_DATA,$iv,$tag,$context,16);if($cipher===false)throw new \RuntimeException('Error de cifrado.');return 'v1:'.base64_encode($iv.$tag.$cipher); }
 public static function decrypt(string $value,string $context): string { if(!str_starts_with($value,'v1:'))throw new \RuntimeException('Formato de cifrado inválido.');$bin=base64_decode(substr($value,3),true);if($bin===false||strlen($bin)<29)throw new \RuntimeException('Token cifrado inválido.');$plain=openssl_decrypt(substr($bin,28),'aes-256-gcm',self::key(),OPENSSL_RAW_DATA,substr($bin,0,12),substr($bin,12,16),$context);if($plain===false)throw new \RuntimeException('No se puede autenticar el token cifrado.');return $plain; }
}
