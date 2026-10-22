<?php
declare(strict_types=1);
namespace App;

/** Each user is a store: an optional <name>.<domain> address under which their published landings live as /p/<slug>. */
final class Store {
 private const RESERVED=['www','mail','smtp','imap','pop','pop3','ftp','cpanel','webmail','webdisk','whm','cpcalendars','cpcontacts','autodiscover','autoconfig','ns','ns1','ns2','api','app','admin','panel','login','static','cdn','assets','media','p','tinvana','tinbana','soporte','ayuda','blog','tienda'];
 public static function isReserved(string $label): bool { return in_array($label,self::RESERVED,true); }
 /** Normalizes the chosen name: empty means "no store address" (landings stay under /p/ on the main domain). */
 public static function validate(mixed $v): ?string {
  if($v===null)return null;if(!is_string($v))throw new HttpError(422,'Subdominio inválido.');$v=trim($v);if($v==='')return null;
  if(!preg_match('/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/',$v)||str_contains($v,'--'))throw new HttpError(422,'El subdominio debe tener de 3 a 40 caracteres: minúsculas, números y guiones, sin espacios, y sin empezar ni terminar en guion.');
  if(self::isReserved($v))throw new HttpError(422,'Ese subdominio está reservado. Elige otro nombre.');return $v;
 }
 /** Host used for store subdomains, or null when APP_URL is an IP/localhost (no wildcard DNS there). */
 public static function base(): ?string {
  $host=strtolower((string)parse_url((string)Support::env('APP_URL'),PHP_URL_HOST));
  if($host===''||!str_contains($host,'.')||filter_var($host,FILTER_VALIDATE_IP)!==false)return null;return $host;
 }
 public static function check(?string $subdomain,string $owner): void {
  if($subdomain===null)return;
  if(Database::one('SELECT id FROM users WHERE id<>? AND store_subdomain=?',[$owner,$subdomain]))throw new HttpError(409,'Ese subdominio ya está en uso. Elige otro nombre.');
 }
 public static function subdomainOf(string $owner): ?string {
  $r=Database::one('SELECT store_subdomain FROM users WHERE id=?',[$owner]);$v=$r['store_subdomain']??null;return is_string($v)&&$v!==''?$v:null;
 }
 /** Owner id of the store with this subdomain, or null. */
 public static function owner(string $subdomain): ?string {
  $r=Database::one('SELECT id FROM users WHERE store_subdomain=?',[$subdomain]);return $r?(string)$r['id']:null;
 }
 /** Origin of the store (https://name.domain), or null when the user has none or the environment has no public domain. */
 public static function origin(?string $subdomain): ?string {
  $base=self::base();if($subdomain===null||$subdomain===''||$base===null)return null;
  $scheme=(string)parse_url((string)Support::env('APP_URL'),PHP_URL_SCHEME);return ($scheme!==''?$scheme:'https').'://'.$subdomain.'.'.$base;
 }
 /** Public address of a landing: inside the store when its owner has one, otherwise APP_URL/p/<slug>. */
 public static function landingUrl(string $slug,?string $subdomain): string {
  return (self::origin($subdomain)??rtrim((string)Support::env('APP_URL'),'/')).'/p/'.$slug;
 }
 /** Adds public_url to a landing row (published address when it has one, otherwise the draft slug). */
 public static function decorate(array $landing): array {
  $landing['public_url']=self::landingUrl((string)(!empty($landing['published_slug'])?$landing['published_slug']:$landing['slug']),self::subdomainOf((string)$landing['user_id']));return $landing;
 }
 public static function view(string $owner): array {
  $subdomain=self::subdomainOf($owner);return ['subdomain'=>$subdomain,'base'=>self::base(),'url'=>self::origin($subdomain)];
 }
 public static function save(string $owner,array $body): array {
  if(array_diff(array_keys($body),['subdomain']))throw new HttpError(422,'Solo puedes modificar el subdominio de tu tienda.');
  $subdomain=self::validate($body['subdomain']??null);
  if($subdomain!==null&&self::base()===null)throw new HttpError(422,'El subdominio no está disponible en este entorno.');
  self::check($subdomain,$owner);
  try{Database::query('UPDATE users SET store_subdomain=?,updated_at=now() WHERE id=?',[$subdomain,$owner]);}
  catch(\PDOException $e){if(in_array((string)$e->getCode(),['23505','23000'],true))throw new HttpError(409,'Ese subdominio ya está en uso. Elige otro nombre.');throw $e;}
  return Profile::view($owner);
 }
}
