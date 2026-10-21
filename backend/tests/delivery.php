<?php
require dirname(__DIR__).'/bootstrap.php';
use App\{DeliveryAddress,Leads,Support,HttpError};
$passed=0;function deliveryCheck($name,$ok){global $passed;if(!$ok)throw new RuntimeException($name);$passed++;echo "PASS $name\n";}function deliveryReject($name,$fn){try{$fn();}catch(HttpError $e){deliveryCheck($name,$e->status===422);return;}throw new RuntimeException($name);}
$input=['country_code'=>'CO','department_code'=>'11','city_code'=>'11001','address'=>'Calle 123 # 45-67','address_details'=>'Torre A, apto 301','postal_code'=>'110111'];$value=DeliveryAddress::validate($input);
deliveryCheck('official Colombia geography loaded',count(DeliveryAddress::geography()['departments'])===33);
deliveryCheck('city names derived from official codes',$value['city']==='Bogotá, D.C.'&&$value['country']==='Colombia');
deliveryCheck('postal leading zero retained',DeliveryAddress::validate([...$input,'department_code'=>'05','city_code'=>'05001','postal_code'=>'050001'])['postal_code']==='050001');
deliveryCheck('postal code optional with no fabricated default',DeliveryAddress::validate([...$input,'postal_code'=>''])['postal_code']===null);
deliveryReject('foreign delivery country refused',fn()=>DeliveryAddress::validate([...$input,'country_code'=>'US']));
deliveryReject('city must belong to department',fn()=>DeliveryAddress::validate([...$input,'department_code'=>'05']));
deliveryReject('unknown city rejected',fn()=>DeliveryAddress::validate([...$input,'city_code'=>'11999']));
deliveryReject('blank address refused',fn()=>DeliveryAddress::validate([...$input,'address'=>'']));
deliveryReject('HTML address rejected',fn()=>DeliveryAddress::validate([...$input,'address'=>'<script>bad</script>']));
deliveryReject('six digit Colombian postal code required if provided',fn()=>DeliveryAddress::validate([...$input,'postal_code'=>'12345']));
deliveryReject('alphabetic postal code rejected',fn()=>DeliveryAddress::validate([...$input,'postal_code'=>'ABCDEF']));
deliveryCheck('Colombia national phone normalized',DeliveryAddress::phone('300 123 4567','CO')['phone']==='+573001234567');
deliveryCheck('international phone normalized',DeliveryAddress::phone('(202) 555-0123','US')['phone']==='+12025550123');
deliveryCheck('full international prefix respected',DeliveryAddress::phone('+1 202 555 0123','CO')['phone_country']==='US');
deliveryReject('invalid phone region rejected',fn()=>DeliveryAddress::phone('3001234567','ZZ'));
deliveryReject('invalid phone rejected',fn()=>DeliveryAddress::phone('1234567','CO'));
$_ENV['TRUST_COUNTRY_HEADER']='false';$_SERVER['HTTP_CF_IPCOUNTRY']='US';deliveryCheck('untrusted country header ignored',DeliveryAddress::phoneCountry()==='CO');$_ENV['TRUST_COUNTRY_HEADER']='true';deliveryCheck('trusted header can suggest visitor phone country',DeliveryAddress::phoneCountry()==='US');$_SERVER['HTTP_CF_IPCOUNTRY']='XX';deliveryCheck('unknown detected country falls back to CO',DeliveryAddress::phoneCountry()==='CO');
$html=DeliveryAddress::fields();deliveryCheck('SSR address fields exist without JavaScript',str_contains($html,'name="address"')&&str_contains($html,'value="11001"')&&str_contains($html,'name="postal_code"'));
echo "$passed delivery checks passed. No external requests made.\n";
