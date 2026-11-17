<?php
declare(strict_types=1);
namespace App;

/**
 * Phase 0 of Wompi payments (console: wompi:probe). Sandbox only: it refuses production keys.
 *  selftest            Signature formulas against the official examples (offline).
 *  sandbox             Checks the four test keys: merchant (public key), a single-use payment link (private key)
 *                      and a signed Web Checkout address to pay with the sandbox test data.
 *  transaction <id>    Reads a sandbox transaction (the ?id= of the return page) and checks status, amount and reference.
 * Keys come from WOMPI_TEST_PUBLIC_KEY, WOMPI_TEST_PRIVATE_KEY, WOMPI_TEST_EVENTS_SECRET and WOMPI_TEST_INTEGRITY_SECRET
 * (local, ignored env); output never shows them.
 */
final class WompiProbe {
 public static function run(string $mode='selftest',string $arg=''): string {
  return match($mode){'selftest'=>self::selftest(),'sandbox'=>self::sandbox(),'transaction'=>self::transaction($arg),default=>"Uso: wompi:probe selftest | sandbox | transaction <id>\n"};
 }

 private static function selftest(): string {
  // Examples published in the Wompi docs (sample secrets, not real ones). The events page shows the chain
  // «1234-1610641025-49201APPROVED44900001530291411prod_events_…» but its printed hash (3476DDA5…) is not the SHA256 of
  // that chain (5a18ec5e…, checked 2026-11-17), so the test uses the chain's real hash; a sandbox event confirms it.
  $integrity=Wompi::integrity('sk8-438k4-xmxm392-sn2m',2490000,'COP','prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6');
  $event=['event'=>'transaction.updated','data'=>['transaction'=>['id'=>'1234-1610641025-49201','status'=>'APPROVED','amount_in_cents'=>4490000]],
   'signature'=>['properties'=>['transaction.id','transaction.status','transaction.amount_in_cents'],'checksum'=>strtoupper(hash('sha256','1234-1610641025-49201APPROVED44900001530291411prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z'))],'timestamp'=>1530291411];
  $secret='prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z';
  $tampered=$event;$tampered['data']['transaction']['amount_in_cents']=100;
  $checks=[
   'Firma de integridad igual al ejemplo oficial'=>$integrity==='37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5',
   'Firma de evento válida (ejemplo oficial)'=>Wompi::eventValid($event,$secret),
   'Firma de evento válida desde el encabezado X-Event-Checksum'=>Wompi::eventValid($event,$secret,strtolower($event['signature']['checksum'])),
   'Evento con monto alterado rechazado'=>!Wompi::eventValid($tampered,$secret),
   'Evento con otro secreto rechazado'=>!Wompi::eventValid($event,'prod_events_otro'),
   'Evento sin propiedades rechazado'=>!Wompi::eventValid(['signature'=>['properties'=>[],'checksum'=>'x'],'timestamp'=>1,'data'=>[]],$secret),
   'Llaves de prueba reconocidas como sandbox'=>Wompi::environment('pub_test_a','prv_test_b','test_events_c','test_integrity_d')==='test',
   'Llaves mezcladas (prueba y producción) rechazadas'=>Wompi::environment('pub_test_a','prv_prod_b','test_events_c','test_integrity_d')===null,
  ];
  $out=['== Wompi selftest (sin red)'];$ok=true;foreach($checks as $name=>$pass){$out[]=($pass?'PASS ':'FAIL ').$name;$ok=$ok&&$pass;}
  $out[]=$ok?'OK '.count($checks).' comprobaciones':'HAY FALLAS';return implode("\n",$out)."\n";
 }

 /** @return array{0:string,1:string,2:string,3:string} */
 private static function keys(): array {
  $k=[Support::env('WOMPI_TEST_PUBLIC_KEY'),Support::env('WOMPI_TEST_PRIVATE_KEY'),Support::env('WOMPI_TEST_EVENTS_SECRET'),Support::env('WOMPI_TEST_INTEGRITY_SECRET')];
  if(in_array('',$k,true))throw new \RuntimeException('Faltan llaves de prueba: WOMPI_TEST_PUBLIC_KEY, WOMPI_TEST_PRIVATE_KEY, WOMPI_TEST_EVENTS_SECRET y WOMPI_TEST_INTEGRITY_SECRET.');
  if(Wompi::environment(...$k)!=='test')throw new \RuntimeException('Solo se aceptan las cuatro llaves de prueba (pub_test_, prv_test_, test_events_, test_integrity_).');
  return $k;
 }

 private static function sandbox(): string {
  [$public,$private,,$integrity]=self::keys();$out=['== Wompi sandbox '.gmdate('c')];
  [$s,$m]=Wompi::request(Wompi::SANDBOX,'GET','/merchants/'.rawurlencode($public));$d=$m['data']??[];
  $out[]='Comercio (llave pública): HTTP '.$s.($s===200?' | nombre: '.($d['name']??'?').' | medios: '.implode(', ',array_map(fn($x)=>is_array($x)?($x['name']??'?'):(string)$x,(array)($d['accepted_payment_methods']??[]))).' | token de aceptación: '.(!empty($d['presigned_acceptance']['acceptance_token'])?'sí':'no'):' | '.Support::json($m['error']??$m));
  // A single-use sandbox link: proves the private key and the phase 3 contract. It moves no money.
  [$s,$l]=Wompi::request(Wompi::SANDBOX,'POST','/payment_links',$private,['name'=>'Prueba Tinbana','description'=>'Verificación de la fase 0 (sandbox)','single_use'=>true,'collect_shipping'=>false,'currency'=>'COP','amount_in_cents'=>1500000,'expires_at'=>gmdate('Y-m-d\TH:i:s',time()+3600)]);
  $out[]='Link de pago (llave privada): HTTP '.$s.($s>=200&&$s<300&&isset($l['data']['id'])?' | https://checkout.wompi.co/l/'.$l['data']['id']:' | '.Support::json($l['error']??$l));
  $reference='tb-probe-'.bin2hex(random_bytes(6));
  $out[]='Referencia de prueba: '.$reference.' ($15.000)';
  $out[]='Web Checkout firmado (secreto de integridad): '.Wompi::checkoutUrl($public,$reference,1500000,$integrity,['redirect-url'=>'https://tinbana.com/']);
  $out[]='Siguiente: abre el Web Checkout, paga con los datos de prueba del sandbox y ejecuta wompi:probe transaction <id> con el id que trae la dirección de regreso.';
  return implode("\n",$out)."\n";
 }

 private static function transaction(string $id): string {
  if(!preg_match('/^[0-9A-Za-z-]{6,80}$/D',$id))throw new \RuntimeException('Id de transacción inválido.');self::keys();
  [$s,$t]=Wompi::request(Wompi::SANDBOX,'GET','/transactions/'.rawurlencode($id));$d=$t['data']??[];
  if($s!==200)return 'Transacción: HTTP '.$s.' | '.Support::json($t['error']??$t)."\n";
  return implode("\n",['== Transacción sandbox '.$id,'Estado: '.($d['status']??'?').' | monto: '.($d['amount_in_cents']??'?').' '.($d['currency']??'').' | referencia: '.($d['reference']??'?').' | medio: '.($d['payment_method_type']??'?'),
   'Campos: '.implode(',',array_keys($d))])."\n";
 }
}
