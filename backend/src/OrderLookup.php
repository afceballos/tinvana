<?php
declare(strict_types=1);
namespace App;

/**
 * Order look-up by its public number (TB-XXXX-XXXX), for the buyer: the /pedido page of the store and a WhatsApp
 * message with the number. Shows the status, product and delivery address; name, phone and email only partly
 * (whoever has the number may read it). On a store subdomain only that store's orders are found.
 */
final class OrderLookup {
 public const STEPS=['received'=>'Recibido','confirmed'=>'Confirmado','preparing'=>'En preparación','transit'=>'En camino','delivered'=>'Entregado'];

 public static function find(string $raw,?string $owner=null): ?array {
  $n=Orders::normalizeNumber($raw);if(!$n)return null;
  return Database::one('SELECT * FROM orders WHERE order_number=?'.($owner?' AND user_id=?':''),$owner?[$n,$owner]:[$n]);
 }
 /** «Laura Pérez» → «La••• Pé•••». */
 public static function maskName(string $v): string {
  return implode(' ',array_map(fn($w)=>mb_substr($w,0,mb_strlen($w)>2?2:1).'•••',preg_split('/\s+/u',trim($v),-1,PREG_SPLIT_NO_EMPTY)?:[]));
 }
 /** «laura.perez@gmail.com» → «la•••@gm•••.com». */
 public static function maskEmail(string $v): string {
  if(!str_contains($v,'@'))return '';[$local,$domain]=explode('@',$v,2);$dot=strrpos($domain,'.');
  return mb_substr($local,0,2).'•••@'.mb_substr($domain,0,2).'•••'.($dot!==false?substr($domain,$dot):'');
 }
 /** «+573001234567» → «+57 300 ••• ••67». */
 public static function maskPhone(string $v): string {
  $d=preg_replace('/\D/','',$v)??'';if(strlen($d)<6)return '';
  if(str_starts_with($d,'57')&&strlen($d)===12)return '+57 '.substr($d,2,3).' ••• ••'.substr($d,-2);
  return '+'.substr($d,0,4).' ••• ••'.substr($d,-2);
 }
 /** Where the order is, from the sale, the submission to Dropi and the carrier status. */
 public static function status(array $o): array {
  $l=(string)($o['logistics_status']??'not_requested');$sale=(string)$o['sale_status'];$sent=($o['integration_status']??'')==='sent';
  if($sale==='cancelled'||$l==='cancelled')return ['key'=>'cancelled','label'=>'Cancelado','step'=>-1,'note'=>'Este pedido fue cancelado. Si crees que es un error, escríbenos.'];
  if($l==='returned')return ['key'=>'returned','label'=>'Devuelto','step'=>-1,'note'=>'El pedido fue devuelto. Escríbenos para ayudarte.'];
  if($l==='delivered')return ['key'=>'delivered','label'=>'Entregado','step'=>4,'note'=>'¡Tu pedido fue entregado! Gracias por tu compra.'];
  if($l==='novelty')return ['key'=>'novelty','label'=>'Con novedad en la entrega','step'=>3,'note'=>'La transportadora reportó una novedad. Te contactaremos para resolverla.'];
  if($l==='in_transit')return ['key'=>'transit','label'=>'En camino','step'=>3,'note'=>'Tu pedido va en camino a tu dirección.'];
  if($sent||in_array($l,['pending','guide_generated'],true))return ['key'=>'preparing','label'=>'En preparación','step'=>2,'note'=>'Estamos preparando tu pedido para entregarlo a la transportadora.'];
  if($sale==='confirmed')return ['key'=>'confirmed','label'=>'Confirmado','step'=>1,'note'=>'Tu pedido está confirmado y pronto pasará a preparación.'];
  return ['key'=>'received','label'=>'Recibido','step'=>0,'note'=>'Recibimos tu pedido. Lo confirmaremos contigo antes de enviarlo.'];
 }
 /** Everything the buyer may see. */
 public static function view(array $o): array {
  $c=json_decode((string)$o['customer'],true)?:[];$a=json_decode((string)$o['delivery_address'],true)?:[];$p=json_decode((string)$o['product_data'],true)?:[];
  $v=json_decode((string)($o['variant_data']??'null'),true);$t=json_decode((string)($o['dropi_tracking']??'null'),true)?:[];
  $unit=$o['unit_price']===null?null:(float)$o['unit_price'];$ship=$o['shipping_price']===null?null:(float)$o['shipping_price'];$qty=(int)$o['quantity'];
  $store=OrderMail::settings((string)$o['user_id'])['sender_name'];
  return ['number'=>Orders::displayNumber($o),'store'=>$store,'created_at'=>$o['created_at'],'status'=>self::status($o),
   'product'=>(string)($p['product_name']??'Producto'),'image'=>is_string($p['image']??null)?$p['image']:null,'variant'=>is_array($v)?(string)($v['label']??''):'','quantity'=>$qty,
   'total'=>$unit!==null&&$ship!==null?round($unit*$qty+$ship,2):($unit!==null?round($unit*$qty,2):null),'shipping_known'=>$ship!==null,
   'name'=>self::maskName(trim(($c['first_name']??'').' '.($c['last_name']??''))),'phone'=>self::maskPhone((string)($c['phone']??'')),'email'=>self::maskEmail((string)($c['email']??'')),
   'address'=>trim(($a['address']??'').' '.($a['address_details']??'')),'city'=>trim(($a['city']??'').', '.($a['state']??''),', '),
   'carrier'=>is_string($t['carrier']??null)?$t['carrier']:null,'guide'=>is_string($t['guide']??null)?$t['guide']:null];
 }
 private static function money(?float $v): string {return $v===null?'Por confirmar':'$'.number_format($v,0,',','.');}
 /** WhatsApp answer when the buyer sends their number. */
 public static function text(array $o): string {
  $d=self::view($o);
  return 'Pedido '.$d['number'].': *'.$d['status']['label']."*\n".$d['status']['note']."\n\n"
   .$d['product'].($d['variant']!==''?' · '.$d['variant']:'').' ('.$d['quantity'].' und.)'."\nTotal: ".self::money($d['total']).(!$d['shipping_known']?' + envío':'')
   ."\nEntrega en: ".$d['address'].', '.$d['city']
   .($d['carrier']||$d['guide']?"\nTransportadora: ".($d['carrier']??'por asignar').($d['guide']?' · Guía '.$d['guide']:''):'');
 }
 /** Address of the look-up page of a store (its subdomain when it has one). */
 public static function url(string $owner,?string $number=null): string {
  return (Store::origin(Store::subdomainOf($owner))??rtrim((string)Support::env('APP_URL'),'/')).'/pedido'.($number?'?numero='.rawurlencode($number):'');
 }
 /** The /pedido page: a form, and the order when the number exists. */
 public static function page(string $raw,?string $owner): string {
  $raw=trim($raw);$o=null;$error='';
  if($raw!==''){
   Auth::limit('order-lookup:'.($_SERVER['REMOTE_ADDR']??''),30,3600);
   $o=self::find($raw,$owner);if(!$o)$error=Orders::normalizeNumber($raw)?'No encontramos un pedido con ese número. Revísalo e intenta de nuevo.':'Escribe el número tal como aparece en tu correo, por ejemplo TB-7KQ2-MX9P.';
  }
  $color='#ff6a00';$visual=$owner?Database::one('SELECT settings FROM template_settings WHERE user_id=?',[$owner]):null;
  if($visual){$s=json_decode((string)$visual['settings'],true);if(is_string($s['primaryColor']??null)&&preg_match('/^#[0-9a-f]{6}$/i',$s['primaryColor']))$color=$s['primaryColor'];}
  $store=$owner?OrderMail::settings($owner)['sender_name']:'Tinbana';$e=fn($v)=>Support::escape((string)$v);
  $body='';
  if($o){
   $d=self::view($o);$store=$d['store'];$step=(int)$d['status']['step'];$steps='';$i=0;
   foreach(self::STEPS as $label){$state=$step<0?'':($i<$step?' is-done':($i===$step?' is-current':''));$steps.='<li class="ol-step'.$state.'"'.($i===$step?' aria-current="step"':'').'><span>'.($i<$step?'✓':($i+1)).'</span>'.$e($label).'</li>';$i++;}
   $row=fn($k,$v)=>$v===''||$v===null?'':'<div><dt>'.$e($k).'</dt><dd>'.$e($v).'</dd></div>';
   $body='<section class="ol-card ol-result" aria-labelledby="ol-number"><div class="ol-head"><div><span class="ol-eyebrow">Pedido</span><h2 id="ol-number">'.$e($d['number']).'</h2><p>Hecho el '.$e((new \DateTimeImmutable((string)$d['created_at']))->setTimezone(new \DateTimeZone('America/Bogota'))->format('d/m/Y')).'</p></div><span class="ol-badge is-'.$e($d['status']['key']).'">'.$e($d['status']['label']).'</span></div>'
    .'<p class="ol-note">'.$e($d['status']['note']).'</p>'.($step>=0?'<ol class="ol-steps" aria-label="Avance del pedido">'.$steps.'</ol>':'')
    .'<div class="ol-product">'.($d['image']?'<img src="'.$e($d['image']).'" alt="" width="72" height="72" loading="lazy">':'').'<div><strong>'.$e($d['product']).'</strong><span>'.$e(($d['variant']!==''?$d['variant'].' · ':'').$d['quantity'].' '.($d['quantity']===1?'unidad':'unidades')).'</span></div><b>'.$e(self::money($d['total'])).($d['shipping_known']?'':' <small>+ envío</small>').'</b></div>'
    .'<dl class="ol-facts">'.$row('Entregar en',$d['address'].($d['city']!==''?', '.$d['city']:'')).$row('A nombre de',$d['name']).$row('Teléfono',$d['phone']).$row('Correo',$d['email']).$row('Transportadora',$d['carrier']??'').$row('Guía',$d['guide']??'').'</dl>'
    .'<p class="ol-privacy">Por tu seguridad mostramos tus datos de contacto solo en parte.</p></section>';
  }
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Consulta tu pedido · '.$e($store).'</title><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/brand/tinvana-origami.svg"><link rel="stylesheet" href="/brand/fonts/montserrat.css"><style>'.self::css($color).'</style></head><body>'
   .'<main class="ol-wrap"><header class="ol-top"><span class="ol-store">'.$e($store).'</span><h1>Consulta tu pedido</h1><p>Escribe tu número de pedido. Lo encuentras en el correo y en el mensaje de confirmación.</p></header>'
   .'<form class="ol-card ol-form" method="get" action="/pedido"><label for="ol-input">Número de pedido</label><div class="ol-row"><input id="ol-input" name="numero" value="'.$e($raw).'" placeholder="TB-7KQ2-MX9P" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" required'.($error?' aria-invalid="true" aria-describedby="ol-error"':'').'><button type="submit">Consultar</button></div>'.($error?'<p id="ol-error" class="ol-error" role="alert">'.$e($error).'</p>':'').'</form>'
   .$body.'<footer class="ol-foot">'.$e($store).' · Con tecnología de Tinbana</footer></main></body></html>';
 }
 private static function css(string $color): string {
  return ':root{--o:'.$color.';--on-o:'.LandingRenderer::onColor($color).';--ink:#1e1e1e;--muted:#5d5550;--bg:#fff8f1;--card:#fff;--line:#ffe0cd;--soft:#fff1e5;color-scheme:light}'
  .'@media (prefers-color-scheme:dark){:root{--ink:#f4ede7;--muted:#b9aea6;--bg:#161210;--card:#1f1a17;--line:#3a2c24;--soft:#2a1f19;color-scheme:dark}}'
  .'*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Montserrat,system-ui,sans-serif;-webkit-font-smoothing:antialiased}'
  .'.ol-wrap{max-width:680px;margin:0 auto;padding:40px 16px 32px}.ol-top{margin-bottom:20px}.ol-store{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--o)}'
  .'.ol-top h1{margin:6px 0 8px;font-size:clamp(28px,6vw,40px);line-height:1.1;letter-spacing:-.03em}.ol-top p{margin:0;color:var(--muted)}'
  .'.ol-card{padding:20px;border:1px solid var(--line);border-radius:20px;background:var(--card)}.ol-card+.ol-card{margin-top:16px}'
  .'.ol-form label{display:block;margin-bottom:8px;font-weight:700;font-size:14px}.ol-row{display:flex;gap:10px}'
  .'.ol-form input{flex:1;min-width:0;min-height:52px;padding:0 16px;border:1.5px solid var(--line);border-radius:14px;background:var(--bg);color:var(--ink);font:600 18px/1 Montserrat,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase}'
  .'.ol-form input:focus-visible{outline:3px solid color-mix(in srgb,var(--o) 45%,transparent);outline-offset:1px;border-color:var(--o)}.ol-form input[aria-invalid=true]{border-color:#b42318}'
  .'.ol-form button{min-height:52px;padding:0 22px;border:0;border-radius:14px;background:var(--o);color:var(--on-o);font:700 16px Montserrat,system-ui,sans-serif;cursor:pointer}.ol-form button:focus-visible{outline:3px solid var(--ink);outline-offset:2px}'
  .'.ol-error{margin:10px 0 0;color:#b42318;font-weight:600;font-size:14px}'
  .'.ol-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ol-eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}'
  .'.ol-head h2{margin:2px 0;font-size:24px;letter-spacing:.02em}.ol-head p{margin:0;color:var(--muted);font-size:14px}'
  .'.ol-badge{flex:none;padding:6px 12px;border-radius:999px;background:var(--soft);color:var(--ink);font-size:13px;font-weight:700}.ol-badge.is-delivered,.ol-badge.is-confirmed{background:#dcfce7;color:#15803d}.ol-badge.is-cancelled,.ol-badge.is-returned,.ol-badge.is-novelty{background:#fee4e2;color:#b42318}.ol-badge.is-transit,.ol-badge.is-preparing{background:color-mix(in srgb,var(--o) 16%,var(--card));color:var(--ink)}'
  .'.ol-note{margin:14px 0 18px}'
  .'.ol-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:0 0 20px;padding:0;list-style:none;font-size:12px;font-weight:600;color:var(--muted);text-align:center}'
  .'.ol-step{display:grid;justify-items:center;gap:6px;position:relative}.ol-step span{display:grid;place-items:center;width:30px;height:30px;border:2px solid var(--line);border-radius:50%;background:var(--card);font-size:13px}'
  .'.ol-step.is-done span{border-color:var(--o);background:var(--o);color:var(--on-o)}.ol-step.is-current{color:var(--ink)}.ol-step.is-current span{border-color:var(--o);color:var(--o)}'
  .'.ol-product{display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:14px;padding:14px;border-radius:14px;background:var(--soft)}.ol-product img{width:72px;height:72px;flex:none;border-radius:12px;object-fit:cover;background:var(--card)}'
  .'.ol-product div{display:grid;min-width:0}.ol-product strong{overflow-wrap:anywhere}.ol-product span{color:var(--muted);font-size:14px}.ol-product b{flex:none;font-size:18px}.ol-product small{font-weight:500;color:var(--muted)}'
  .'.ol-facts{display:grid;gap:12px;margin:18px 0 0}.ol-facts div{display:grid;gap:2px}.ol-facts dt{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.ol-facts dd{margin:0;font-weight:600;overflow-wrap:anywhere}'
  .'.ol-privacy{margin:16px 0 0;font-size:13px;color:var(--muted)}.ol-foot{margin-top:28px;text-align:center;font-size:13px;color:var(--muted)}'
  .'@media (max-width:520px){.ol-row{flex-direction:column}.ol-form button{width:100%}.ol-steps{font-size:10.5px}.ol-step span{width:26px;height:26px}.ol-product{grid-template-columns:64px minmax(0,1fr)}.ol-product img{width:64px;height:64px}.ol-product b{grid-column:1/-1;justify-self:end}.ol-head{flex-direction:column}}';
 }
}
