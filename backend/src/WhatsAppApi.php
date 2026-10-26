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
  if($path==='/api/whatsapp/account/subscribe'&&$method==='POST'){Auth::limit('whatsapp-subscribe:'.$owner,10,600);return WhatsAppAccount::subscribe($owner);}
  if($path==='/api/whatsapp/conversations'&&$method==='GET')return WhatsAppInbox::list($owner,$_GET);
  if(preg_match('~^/api/whatsapp/conversations/([a-f0-9-]{36})(?:/(read|take|release|messages))?$~D',$path,$m)){
   $id=$m[1];$action=$m[2]??'';
   if($action===''&&$method==='GET')return WhatsAppInbox::detail($owner,$id,$_GET);
   if($action==='read'&&$method==='POST')return WhatsAppInbox::markRead($owner,$id);
   if(($action==='take'||$action==='release')&&$method==='POST')return WhatsAppInbox::assign($owner,$id,$action==='take'?'human':'ai',Api::body()['version']??null);
   if($action==='messages'&&$method==='POST')return WhatsAppInbox::reply($owner,$id,Api::body());
  }
  throw new HttpError(404,'Ruta no encontrada.');
 }
}
