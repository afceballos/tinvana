<?php
declare(strict_types=1);
namespace App;
final class Geography {
 public static function countries():array {return json_decode(file_get_contents(dirname(__DIR__).'/resources/geo/world/countries.json'),true,512,JSON_THROW_ON_ERROR);}
 public static function country(string $country):array {foreach(self::countries() as $c)if($c['id']===$country)return $c;throw new HttpError(422,'Selecciona un país válido.');}
 public static function regions(string $country):array {
  self::country($country);if($country==='CO')return array_map(fn($d)=>['id'=>$d['id'],'name'=>$d['name'],'cities'=>$d['cities']],DeliveryAddress::geography()['departments']);
  return json_decode(file_get_contents(dirname(__DIR__).'/resources/geo/world/'.$country.'.json'),true,512,JSON_THROW_ON_ERROR);
 }
 public static function region(string $country,string $id):array {foreach(self::regions($country) as $r)if($r['id']===$id)return $r;throw new HttpError(422,'El departamento o provincia no pertenece al país seleccionado.');}
 public static function city(string $country,string $region,string $id):array {foreach(self::region($country,$region)['cities'] as $c)if($c['id']===$id)return $c;throw new HttpError(422,'La ciudad no pertenece al departamento o provincia seleccionado.');}
 public static function listing(string $kind,array $query):array {
  if($kind==='countries')return ['options'=>self::countries()];
  $country=Support::text($query['country']??null,2);if($kind==='states')return ['options'=>array_map(fn($r)=>['id'=>$r['id'],'name'=>$r['name']],self::regions($country))];
  $state=Support::text($query['state']??null,10);return ['options'=>self::region($country,$state)['cities']];
 }
}
