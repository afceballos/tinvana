<?php
declare(strict_types=1);
namespace App;
use libphonenumber\{PhoneNumberUtil,PhoneNumberFormat,NumberParseException};
final class DeliveryAddress {
 public static function geography():array {static $data;return $data??=json_decode(file_get_contents(dirname(__DIR__).'/resources/geo/colombia.json'),true,512,JSON_THROW_ON_ERROR);}
 public static function phoneCountry():string {
  $country=Support::env('TRUST_COUNTRY_HEADER','false')==='true'?($_SERVER['HTTP_CF_IPCOUNTRY']??''):'';
  return is_string($country)&&in_array($country,PhoneNumberUtil::getInstance()->getSupportedRegions(),true)?$country:'CO';
 }
 public static function phone(string $phone,mixed $region):array {
  $region=strtoupper(Support::text($region,2));$util=PhoneNumberUtil::getInstance();if(!in_array($region,$util->getSupportedRegions(),true)||!preg_match('/^\+?[0-9 ()\-.]{7,30}$/D',$phone))throw new HttpError(422,'Verifica el teléfono y su país.');
  try{$parsed=$util->parse($phone,$region);}catch(NumberParseException){throw new HttpError(422,'El teléfono no tiene un formato válido para el país seleccionado.');}
  if(!$util->isValidNumber($parsed)&&!$parsed->hasExtension()){
   // The flag picker already shows the dial code, so visitors often type it again or add a trunk zero.
   $code=(string)$parsed->getCountryCode();$national=ltrim((string)$parsed->getNationalNumber(),'0');
   foreach(array_unique([$national,str_starts_with($national,$code)?substr($national,strlen($code)):'']) as $candidate){
    if(strlen($candidate)<4)continue;try{$retry=$util->parse('+'.$code.$candidate,$region);}catch(NumberParseException){continue;}
    if($util->isValidNumber($retry)){$parsed=$retry;break;}
   }
  }
  if(!$util->isValidNumber($parsed)||$parsed->hasExtension())throw new HttpError(422,'El teléfono no es válido para el país elegido (+'.$parsed->getCountryCode().'). Escribe solo tu número, sin el prefijo.');
  $actual=$util->getRegionCodeForNumber($parsed);if(!$actual||!preg_match('/^[A-Z]{2}$/D',$actual))throw new HttpError(422,'Usa un teléfono asociado a un país válido.');return ['phone'=>$util->format($parsed,PhoneNumberFormat::E164),'phone_country'=>$actual];
 }
 public static function validate(array $body):array {
  $country=strtoupper(Support::text($body['country_code']??null,2));if($country!=='CO')throw new HttpError(422,'Por ahora solo recibimos direcciones de entrega en Colombia.');
  $department=Support::text($body['department_code']??null,2);$city=Support::text($body['city_code']??null,5);$match=null;$region=null;
  foreach(self::geography()['departments'] as $d)if($d['id']===$department){$region=$d;foreach($d['cities'] as $c)if($c['id']===$city)$match=$c;}
  if(!$match||!$region)throw new HttpError(422,'Selecciona un municipio que pertenezca al departamento indicado.');
  $address=Support::text($body['address']??null,300);$extra=Support::text($body['address_details']??'',200,false);$postal=Support::text($body['postal_code']??'',6,false);
  if(mb_strlen($address)<5||preg_match('/[<>\x00-\x1f\x7f]/u',$address.$extra))throw new HttpError(422,'Escribe una dirección de entrega válida.');
  if($postal!==''&&!preg_match('/^[0-9]{6}$/D',$postal))throw new HttpError(422,'El código postal colombiano debe tener seis dígitos.');
  return ['country_code'=>'CO','country'=>'Colombia','department_code'=>$department,'state'=>$region['name'],'city_code'=>$city,'city'=>$match['name'],'address'=>$address,'address_details'=>$extra,'postal_code'=>$postal!==''?$postal:null];
 }
 public static function fields():string {
  $e=fn($s)=>Support::escape($s);$regions='';$cities='';foreach(self::geography()['departments'] as $d){$regions.='<option value="'.$d['id'].'">'.$e($d['name']).'</option>';$cities.='<optgroup label="'.$e($d['name']).'">';foreach($d['cities'] as $c)$cities.='<option value="'.$c['id'].'" data-department="'.$d['id'].'">'.$e($c['name']).'</option>';$cities.='</optgroup>';}
  return '<fieldset class="delivery-fields"><legend>Dirección de entrega</legend><p class="form-help">Por ahora recibimos solicitudes de entrega en Colombia. El equipo confirmará la cobertura.</p><div class="form-grid"><label>País de entrega<select name="country_code" required autocomplete="country"><option value="CO">Colombia</option></select></label><label>Departamento<select name="department_code" required autocomplete="address-level1"><option value="">Selecciona un departamento</option>'.$regions.'</select></label><label>Seleccionar ciudad<select name="city_code" required autocomplete="address-level2"><option value="">Seleccionar ciudad</option>'.$cities.'</select></label><label>Código postal (opcional)<input name="postal_code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="postal-code" placeholder="6 dígitos"></label><label class="delivery-full">Dirección<input name="address" required minlength="5" maxlength="300" autocomplete="address-line1" placeholder="Calle, carrera, número, barrio o vereda"></label><label class="delivery-full">Apartamento o indicaciones (opcional)<input name="address_details" maxlength="200" autocomplete="address-line2" placeholder="Torre, apartamento o indicaciones para ubicarte"></label></div><a class="geo-attribution" href="/datos-geograficos" target="_blank" rel="noopener noreferrer">Datos de ubicación</a></fieldset>';
 }
 public static function phoneField():string {
  $util=PhoneNumberUtil::getInstance();$country=self::phoneCountry();$options='';$codes=$util->getSupportedRegions();sort($codes);foreach($codes as $code)$options.='<option value="'.$code.'"'.($code===$country?' selected':'').'>'.$code.' (+'.$util->getCountryCodeForRegion($code).')</option>';
  return '<div class="phone-field"><label for="lead-phone">Teléfono</label><label class="phone-country-fallback">País del teléfono<select name="phone_country" required>'.$options.'</select></label><input id="lead-phone" name="phone" type="tel" required maxlength="30" autocomplete="tel-national" inputmode="tel" placeholder="300 123 4567" aria-describedby="phone-help"><small id="phone-help" class="form-help">Elige el país con la bandera y escribe tu número sin el prefijo.</small></div>';
 }
}
