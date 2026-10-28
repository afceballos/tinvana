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
  if($path==='/api/whatsapp/agent'||str_starts_with($path,'/api/whatsapp/sheets')||str_starts_with($path,'/api/whatsapp/knowledge'))return self::agent($owner,$path,$method);
  if($path==='/api/whatsapp/ads'){
   if($method==='GET')return WhatsAppOffers::list($owner);
   if($method==='POST'){Auth::limit('whatsapp-ads:'.$owner,60,600);return WhatsAppOffers::addAd($owner,Api::body());}
  }
  if(preg_match('~^/api/whatsapp/ads/([a-f0-9-]{36})$~D',$path,$m)){
   if($method==='PUT'){Auth::limit('whatsapp-ads:'.$owner,60,600);return WhatsAppOffers::updateAd($owner,$m[1],Api::body());}
   if($method==='DELETE')return WhatsAppOffers::deleteAd($owner,$m[1]);
  }
  if($path==='/api/whatsapp/offers'&&$method==='POST'){Auth::limit('whatsapp-offers:'.$owner,60,600);return WhatsAppOffers::saveOffer($owner,null,Api::body());}
  if(preg_match('~^/api/whatsapp/offers/([a-f0-9-]{36})$~D',$path,$m)){
   if($method==='PUT'){Auth::limit('whatsapp-offers:'.$owner,60,600);return WhatsAppOffers::saveOffer($owner,$m[1],Api::body());}
   if($method==='DELETE')return WhatsAppOffers::archiveOffer($owner,$m[1]);
  }
  if($path==='/api/whatsapp/templates'){if($method==='GET')return WhatsAppTemplates::list($owner);if($method==='POST')return WhatsAppTemplates::create($owner,Api::body());}
  if($path==='/api/whatsapp/templates/sync'&&$method==='POST'){Auth::limit('whatsapp-template-sync:'.$owner,30,600);return WhatsAppTemplates::sync($owner);}
  if(preg_match('~^/api/whatsapp/templates/([a-f0-9-]{36})$~D',$path,$m)&&$method==='DELETE')return WhatsAppTemplates::delete($owner,$m[1]);
  if($path==='/api/whatsapp/confirmations'){if($method==='GET')return WhatsAppOrderConfirm::view($owner);if($method==='PUT'){Auth::limit('whatsapp-confirm-settings:'.$owner,30,600);return WhatsAppOrderConfirm::save($owner,Api::body());}}
  if($path==='/api/whatsapp/chats'&&$method==='POST')return WhatsAppInbox::sendTemplate($owner,Api::body());
  if($path==='/api/whatsapp/conversations'&&$method==='GET')return WhatsAppInbox::list($owner,$_GET);
  if(preg_match('~^/api/whatsapp/conversations/([a-f0-9-]{36})(?:/(read|take|release|messages|template))?$~D',$path,$m)){
   $id=$m[1];$action=$m[2]??'';
   if($action===''&&$method==='GET')return WhatsAppInbox::detail($owner,$id,$_GET);
   if($action==='read'&&$method==='POST')return WhatsAppInbox::markRead($owner,$id);
   if(($action==='take'||$action==='release')&&$method==='POST')return WhatsAppInbox::assign($owner,$id,$action==='take'?'human':'ai',Api::body()['version']??null);
   if($action==='messages'&&$method==='POST')return WhatsAppInbox::reply($owner,$id,Api::body());
   if($action==='template'&&$method==='POST')return WhatsAppInbox::sendTemplate($owner,Api::body(),$id);
  }
  throw new HttpError(404,'Ruta no encontrada.');
 }
 /** Agent settings and approved product sheets; they require the "whatsapp_ai" feature. */
 private static function agent(string $owner,string $path,string $method): array {
  Entitlements::require($owner,'whatsapp_ai');
  if($path==='/api/whatsapp/agent'){
   if($method==='PUT'){Auth::limit('whatsapp-agent:'.$owner,30,600);WhatsAppAgentSettings::save($owner,Api::body());}
   elseif($method==='DELETE')WhatsAppAgentSettings::restore($owner);
   elseif($method!=='GET')throw new HttpError(405,'Método no permitido.');
   $e=Entitlements::of($owner);
   return WhatsAppAgentSettings::forUser($owner)+['defaults'=>WhatsAppAgentSettings::defaults(),'catalog'=>WhatsAppAgentSettings::catalog(),
    'status'=>['unavailable'=>WhatsAppAgent::unavailable($owner),'provider'=>AiConnections::activeProvider($owner),'used_this_month'=>Entitlements::aiConversationsThisMonth($owner),'monthly_limit'=>$e['limits']['whatsapp_ai_conversations']??null,'sellable'=>count(WhatsAppSheets::sellable($owner))]];
  }
  // Learnings of the store (question → answer), also saved from an advisor's message in the chat.
  if($path==='/api/whatsapp/knowledge'){if($method==='GET')return WhatsAppKnowledge::list($owner);if($method==='POST'){Auth::limit('whatsapp-knowledge:'.$owner,120,600);return WhatsAppKnowledge::save($owner,null,Api::body(),$owner);}}
  if(preg_match('~^/api/whatsapp/knowledge/([a-f0-9-]{36})$~D',$path,$m)){if($method==='PUT')return WhatsAppKnowledge::save($owner,$m[1],Api::body(),$owner);if($method==='DELETE')return WhatsAppKnowledge::delete($owner,$m[1]);}
  if($path==='/api/whatsapp/sheets'&&$method==='GET')return WhatsAppSheets::list($owner);
  if(preg_match('~^/api/whatsapp/sheets/([a-f0-9-]{36})(?:/(approve|generate))?$~D',$path,$m)){
   $action=$m[2]??'';
   if($action===''&&$method==='GET')return WhatsAppSheets::get($owner,$m[1]);
   if($action===''&&$method==='PUT'){Auth::limit('whatsapp-sheet:'.$owner,60,600);return WhatsAppSheets::saveDraft($owner,$m[1],Api::body());}
   if($action==='approve'&&$method==='POST')return WhatsAppSheets::approve($owner,$m[1]);
   if($action==='generate'&&$method==='POST'){Auth::limit('whatsapp-sheet-ai:'.$owner,10,600);return WhatsAppSheets::generate($owner,$m[1]);}
  }
  throw new HttpError(404,'Ruta no encontrada.');
 }
}
