<?php
declare(strict_types=1);
namespace App;

/** Panel routes of the WhatsApp sales module (/api/whatsapp/...). Every route requires the "whatsapp" feature. */
final class WhatsAppApi {
 public static function handle(string $owner,string $path,string $method): array {
  Entitlements::require($owner,'whatsapp');
  if($path==='/api/whatsapp/account'){
   if($method==='GET')return WhatsAppAccount::view($owner);
   if($method==='PUT'){Auth::limit('whatsapp-account:'.$owner,20,600);return WhatsAppAccount::save($owner,Api::body());}
   if($method==='DELETE')return WhatsAppAccount::remove($owner);
  }
  if($path==='/api/whatsapp/account/test'&&$method==='POST'){Auth::limit('whatsapp-test:'.$owner,10,600);return WhatsAppAccount::test($owner);}
  throw new HttpError(404,'Ruta no encontrada.');
 }
}
