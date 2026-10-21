<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
use App\{Support,Product,Crypto,Dropi,Landing,Leads,HttpError,Webhooks};
$passed=0;
function check(string $name,bool $condition): void {global $passed;if(!$condition)throw new RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
function rejects(string $name,callable $f,int $status=422): void {try{$f();}catch(HttpError $e){check($name,$e->status===$status);return;}throw new RuntimeException('FAIL: '.$name.' was accepted');}
// Test fixtures only: never used as an application fallback or public demo.
$raw=['id'=>42,'name'=>'Producto de prueba','description'=>'<script>alert(1)</script><p>Texto &amp; valor</p><ul><li>Dato real</li></ul>','sale_price'=>'12345.50','suggested_price'=>'20000','gallery'=>[['main'=>false,'url'=>'relative/second.jpg'],['main'=>true,'urlS3'=>'https://example.test/main.jpg'],['urlS3'=>'javascript:bad','url'=>'https://example.test/fallback.jpg']],'warehouse_product'=>[['stock'=>'2','warehouse'=>['name'=>'A','city'=>['name'=>'Bogotá']]],['stock'=>3]],'categories'=>[['name'=>'Hogar','pivot'=>['category_id'=>7]]],'user'=>['id'=>8,'store_name'=>'Proveedor de prueba'],'attributes'=>[['name'=>'Material','value'=>'Acero']],'variations'=>[]];
$p=Product::map($raw);
check('image main first',$p['images'][0]==='https://example.test/main.jpg');
check('relative CDN mapping',$p['images'][1]==='https://d39ru7awumhhs2.cloudfront.net/relative/second.jpg');
check('invalid S3 fallback',$p['images'][2]==='https://example.test/fallback.jpg');
check('numeric Dropi prices',$p['price']===12345.5&&$p['suggestedPrice']===20000.0);
check('known stock sum',$p['stock']==5);
$unknown=$raw;$unknown['warehouse_product'][1]['stock']=null;check('unknown stock is unavailable',Product::map($unknown)['stock']===null);
$unknown['warehouse_product']=[];check('absent stock is unavailable',Product::map($unknown)['stock']===null);
check('no fabricated cost',$p['cost']===null);
check('category pivot mapping',$p['categories'][0]['id']===7);
check('supplier mapping',$p['supplier']==='Proveedor de prueba');
check('description removes executable HTML',!str_contains($p['description'],'alert')&&!str_contains($p['description'],'<script>')&&str_contains($p['description'],'Texto & valor'));
check('script URLs refused',Product::image('javascript:alert(1)')===null&&Product::image('//evil.test/x')===null);
check('numeric booleans refused',Product::number(true)===null);
$params=Dropi::parameters(['page'=>3,'sort'=>'recent','search'=>'mesa']);check('default 25 products and correct offset',$params['pageSize']===25&&$params['startData']===50&&$params['order_by']==='id'&&$params['order_type']==='desc'&&!array_key_exists('favorite',$params));
check('working proxy flags preserved',$params['active']===true&&$params['integration']===true&&$params['get_stock']===false&&$params['no_count']===true);
foreach([25,30,50] as $size){$q=Dropi::parameters(['page'=>3,'pageSize'=>$size,'category'=>'7']);check('page size and category '.$size,$q['pageSize']===$size&&$q['startData']===2*$size&&$q['category_id']===7);}
rejects('invalid public page size',fn()=>Dropi::parameters(['pageSize'=>32]));
rejects('invalid category',fn()=>Dropi::parameters(['category'=>'invalid']));
rejects('unsupported upstream page size',fn()=>Dropi::payload(['pageSize'=>32]));
rejects('invalid upstream offset',fn()=>Dropi::payload(['startData'=>-1]));
rejects('invalid upstream category',fn()=>Dropi::payload(['category_id'=>0]));
check('upstream flags cannot be overridden',Dropi::payload(['active'=>false,'get_stock'=>true,'integration'=>false])['get_stock']===false&&Dropi::payload(['active'=>false])['active']===true);
check('category validated without adding UI filter',Dropi::payload(['category_id'=>'12'])['category_id']===12);
$secretFixture='fixture-only-sensitive-string';$safe=Dropi::redact(['access_token'=>$secretFixture,'objects'=>[['name'=>'Before '.$secretFixture.' after','nested'=>['TOKEN'=>$secretFixture,'value'=>7]]]],$secretFixture);
check('recursive upstream secret fields removed',!isset($safe['access_token'])&&!isset($safe['objects'][0]['nested']['TOKEN']));
check('echoed token redacted in normal fields',$safe['objects'][0]['name']==='Before [redacted] after'&&$safe['objects'][0]['nested']['value']===7);
rejects('invalid page',fn()=>Dropi::parameters(['page'=>0]));rejects('arbitrary order refused',fn()=>Dropi::parameters(['sort'=>'price']));
rejects('array order refused without server error',fn()=>Dropi::parameters(['sort'=>['default']]));
$_ENV['TOKEN_ENCRYPTION_KEY']=base64_encode(random_bytes(32));$ctx=Support::uuid().':'.Support::uuid();$cipher=Crypto::encrypt('test-token-not-production',$ctx);
check('authenticated encryption roundtrip',Crypto::decrypt($cipher,$ctx)==='test-token-not-production');
check('random nonce per encryption',$cipher!==Crypto::encrypt('test-token-not-production',$ctx));
try{Crypto::decrypt($cipher,'another-owner');throw new LogicException('wrong owner accepted');}catch(RuntimeException $e){check('cipher bound to integration owner',!($e instanceof LogicException));}
$bin=base64_decode(substr($cipher,3));$bin[30]=chr(ord($bin[30])^1);try{Crypto::decrypt('v1:'.base64_encode($bin),$ctx);throw new LogicException('tampering accepted');}catch(RuntimeException $e){check('cipher detects tampering',!($e instanceof LogicException));}
rejects('invalid slug',fn()=>Landing::slug('../private'));
rejects('negative public price',fn()=>Landing::content(['title'=>'Producto','publicPrice'=>-1]));
rejects('unsafe image URL',fn()=>Landing::content(['title'=>'Producto','images'=>['javascript:alert(1)']]));
rejects('CSS injection',fn()=>Landing::visual(['primaryColor'=>'red;display:none']));
$content=Landing::content(['title'=>'<script>alert(1)</script>','description'=>'<img onerror=alert(1)>','images'=>['','https://example.test/p.jpg'],'features'=>['','Acero'],'publicPrice'=>20000]);
check('blank gallery lines removed',count($content['images'])===1&&$content['features']===['Acero']);
$_SESSION['csrf']='unit-test-csrf';$_ENV['APP_URL']='https://example.test';$html=Landing::render(['id'=>Support::uuid(),'slug'=>'test-product','content'=>$content,'product_snapshot'=>$p],true);
check('SSR principal content and SEO',str_contains($html,'<h1>')&&str_contains($html,'name="description"')&&str_contains($html,'/p/test-product'));
check('public content escapes scripts',!str_contains($html,'<script>alert(1)</script>')&&str_contains($html,'&lt;script&gt;'));
check('preview noindex and no active form',str_contains($html,'noindex,nofollow')&&!str_contains($html,'id="lead-form"'));
check('internal supplier excluded from landing',!str_contains($html,'Proveedor de prueba')&&!str_contains($html,'12345'));
rejects('invalid lead email',fn()=>Leads::validate(['idempotency_key'=>Support::uuid(),'first_name'=>'A','last_name'=>'B','email'=>'bad','phone'=>'3001234567']));
rejects('invalid lead idempotency',fn()=>Leads::validate(['idempotency_key'=>'bad']));
rejects('honeypot',fn()=>Leads::validate(['website'=>'spam']));
check('valid lead fields',Leads::validate(['idempotency_key'=>Support::uuid(),'first_name'=>'Andrés','last_name'=>'Prueba','country_code'=>'CO','department_code'=>'11','city_code'=>'11001','address'=>'Calle 123 # 45-67','email'=>'Test@example.test','phone'=>'+57 300 123 4567'])['email']==='test@example.test');
$prices=Leads::productData(['slug'=>'test-product','content'=>$content,'product_snapshot'=>$p]);
check('server snapshot includes both product prices',$prices['dropi_price']===12345.5&&$prices['public_price']===20000.0&&$prices['inflated_price']===20000.0);
check('server snapshot includes original and commercial names',$prices['dropi_product_name']===$p['name']&&$prices['product_name']===$content['title']);
$noPrice=$p;$noPrice['price']=null;$emptyContent=$content;$emptyContent['publicPrice']=null;
$prices=Leads::productData(['slug'=>'test-product','content'=>$emptyContent,'product_snapshot'=>$noPrice]);
check('missing prices are not invented',$prices['dropi_price']===null&&$prices['public_price']===null&&$prices['inflated_price']===null);
check('HTTPS webhook URL validated',Webhooks::validateUrl('https://hooks.example.com/webhook?secret=fixture')==='https://hooks.example.com/webhook?secret=fixture');
rejects('HTTP webhook rejected',fn()=>Webhooks::validateUrl('http://hooks.example.com/webhook'));
rejects('private webhook rejected',fn()=>Webhooks::validateUrl('https://10.1.2.3/webhook'));
rejects('localhost webhook rejected',fn()=>Webhooks::validateUrl('https://localhost/webhook'));
rejects('metadata webhook rejected',fn()=>Webhooks::validateUrl('https://169.254.169.254/'));
rejects('embedded webhook credentials rejected',fn()=>Webhooks::validateUrl('https://user:password@hooks.example.com/webhook'));
rejects('nonstandard webhook port rejected',fn()=>Webhooks::validateUrl('https://hooks.example.com:9443/webhook'));
check('mapped loopback IP rejected',!Webhooks::publicIp('::ffff:127.0.0.1'));
check('private IPv6 and carrier ranges rejected',!Webhooks::publicIp('fd00::1')&&!Webhooks::publicIp('100.64.0.1'));
check('public DNS IPs supported',Webhooks::publicIp('8.8.8.8')&&Webhooks::publicIp('2606:4700:4700::1111'));
check('Dropi filenames with spaces encoded',Product::image('colombia/products/99/WhatsApp Image.jpeg')==='https://d39ru7awumhhs2.cloudfront.net/colombia/products/99/WhatsApp%20Image.jpeg');
check('absolute Unicode filename encoded',Product::image('https://example.com/niño foto.png')==='https://example.com/ni%C3%B1o%20foto.png');
check('existing percent encoding preserved',Product::image('https://example.com/foto%20uno.jpg')==='https://example.com/foto%20uno.jpg');
check('invalid control in image rejected',Product::image("foto\n.jpg")===null);
$source=tempnam(sys_get_temp_dir(),'zen-img-');$target=$source.'.webp';
try{$im=imagecreatetruecolor(2400,1200);imagepng($im,$source);imagedestroy($im);$meta=App\Media::optimize($source,$target);$info=getimagesize($target);check('uploaded PNG converted resized and bounded',$info[2]===IMAGETYPE_WEBP&&$meta['width']===1600&&$meta['height']===800&&$meta['bytes']<=409600);file_put_contents($source,'<?php echo 1;');rejects('non image upload refused',fn()=>App\Media::optimize($source,$target));}finally{@unlink($source);@unlink($target);}
$mediaId='11111111-1111-4111-8111-111111111111';$canonical=rtrim(App\Support::env('APP_URL'),'/');
check('own local upload follows current public origin',App\Media::rebase('http://127.0.0.1:8080/media/'.$mediaId.'.webp')===$canonical.'/media/'.$mediaId.'.webp');
check('old temporary upload follows current origin',App\Media::rebase(['blocks'=>[['image'=>'https://old-demo.trycloudflare.com/media/'.$mediaId.'.webp']]])['blocks'][0]['image']===$canonical.'/media/'.$mediaId.'.webp');
check('external image origin stays unchanged',App\Media::rebase('https://example.com/media/'.$mediaId.'.webp')==='https://example.com/media/'.$mediaId.'.webp');
echo "$passed tests passed. No external services used.\n";
