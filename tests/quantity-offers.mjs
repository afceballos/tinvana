// Phase A: the product's quantity offers as pack cards on its landing, applied to landing orders on the server
// (tier price wins over the landing/variant price), stacking with the Wompi online discount, and hidden when the offer
// is off or above the landing's maximum quantity. Wompi is simulated on 8449; nothing leaves the machine.
// Runs only against the isolated local test database (tests/run-suites.ps1 -Only quantity-offers).
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let count=0;
const check=(name,value)=>{assert(value,name);count++;console.log('PASS '+name);};
const run=promisify(execFile);const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const K={public_key:'pub_test_FakePublicKey000000000001',private_key:'prv_test_FakePrivateKey00000000001',events_secret:'test_events_FakeEventsSecret0000001',integrity_secret:'test_integrity_FakeIntegrity00000001'};
const wompi=createServer({key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')},(req,res)=>{const json=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 if(req.url===`/v1/merchants/${K.public_key}`)return json(200,{data:{name:'Comercio simulado',accepted_payment_methods:['CARD']}});
 if(req.url.startsWith('/v1/transactions'))return json(req.headers.authorization===`Bearer ${K.private_key}`?200:401,{data:[]});json(404,{});});
await new Promise(r=>wompi.listen(8449,'127.0.0.1',r));
class Client {
 cookie='';csrf='';
 async request(path,method='GET',body,token=this.csrf){const response=await fetch(base+path,{method,redirect:'manual',headers:{Cookie:this.cookie,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});for(const c of response.headers.getSetCookie?.()||[]){const pair=c.split(';')[0];const name=pair.split('=')[0];this.cookie=[...this.cookie.split('; ').filter(x=>x&&!x.startsWith(name+'=')),pair].join('; ');}const text=await response.text();let data=null;try{data=JSON.parse(text);}catch{}return {response,data,text};}
 async init(){const r=await this.request('/api/auth/session');this.csrf=r.data.csrf;return r;}
 async login(email){await this.init();const r=await this.request('/api/auth/login','POST',{email,password:fixture.password});if(r.data.csrf)this.csrf=r.data.csrf;assert.equal(r.response.status,200);return r;}
}
const owner=new Client(),visitor=new Client();await owner.login(fixture.email);
const page=async()=>{const r=await visitor.request('/p/'+fixture.slug);visitor.csrf=r.text.match(/name="csrf" value="([^"]+)"/)?.[1]||visitor.csrf;return r.text;};
const lead=(extra={})=>({country_code:'CO',department_code:'11',city_code:'11001',address:'Calle 123 # 45-67',address_details:'',postal_code:'110111',phone_country:'CO',first_name:'Ana',last_name:'Paquete',email:'paquete@example.test',phone:'3001234567',idempotency_key:randomUUID(),website:'',quantity:1,...extra});
const order=async number=>{const o=(await owner.request('/api/orders')).data.orders.find(x=>x.order_number===number);return (await owner.request('/api/orders/'+o.id)).data.order;};
// Saves the landing commerce settings and publishes.
const landing=async(commerce)=>{const l=(await owner.request('/api/landings/'+fixture.landing)).data.landing;const r=await owner.request('/api/landings/'+fixture.landing,'PUT',{content:{...l.content,commerce:{...l.content.commerce,...commerce}},slug:l.slug});if(r.response.status!==200)return r;await owner.request('/api/landings/'+fixture.landing+'/publish','POST',{});return r;};
const offers=async(active,tiers)=>{const v=(await owner.request('/api/products/'+fixture.product+'/offers')).data;return owner.request('/api/products/'+fixture.product+'/offers','PUT',{version:v.version,settings:{active,tiers,starts_at:null,ends_at:null}});};
const T=[{min_quantity:1,unit_price:'120000.00'},{min_quantity:2,unit_price:'100000.00'},{min_quantity:3,unit_price:'90000.00'}];
try{
 await helper('reset-limits');
 check('offer saved on the product',(await offers(true,T)).response.status===200);
 check('invalid highlight refused',(await landing({quantityEnabled:true,maxQuantity:5,quantityOffers:true,offerHighlight:0})).response.status===422);
 await landing({quantityEnabled:true,maxQuantity:5,quantityOffers:false,offerHighlight:null});
 let html=await page();check('no packs while the landing does not show them',!html.includes('qty-pack')&&!html.includes('data-packs'));
 await landing({quantityEnabled:true,maxQuantity:5,quantityOffers:true,offerHighlight:2});
 html=await page();
 check('pack cards on the landing and in the form',(html.match(/data-pack-qty="2"/g)||[]).length===2&&html.includes('Más elegido')&&html.includes('Ahorras $40.000')&&html.includes('Total $200.000')&&html.includes('data-packs="[[1,120000],[2,100000],[3,90000]]"'));
 let r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead({quantity:2}));let o=await order(r.data.order_number);
 check('2 units take the 2-unit price on the server',r.response.status===202&&Number(o.unit_price)===100000&&o.offer_snapshot?.min_quantity===2&&o.offer_snapshot.source==='landing');
 r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead({quantity:4}));o=await order(r.data.order_number);
 check('4 units take the highest tier reached (3+)',Number(o.unit_price)===90000&&o.quantity===4);
 r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead({quantity:1}));o=await order(r.data.order_number);
 check('the 1-unit tier wins over the landing price',Number(o.unit_price)===120000);
 check('Purchase value follows the offer',r.data.purchase?.value===120000);
 // Online payment: the Wompi discount stacks on the pack price.
 await owner.request('/api/wompi/account','PUT',K);await helper('payment-setup','both','10');
 r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead({quantity:2,payment:'online'}));
 check('online: pack price, then 10 % online discount',r.data.payment?.amount===180000);
 // Tiers above the landing maximum are not shown; an inactive offer is not shown nor applied.
 await landing({maxQuantity:2});html=await page();check('packs above the maximum quantity hidden',html.includes('data-pack-qty="2"')&&!html.includes('data-pack-qty="3"'));
 await offers(false,T);html=await page();
 r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead({quantity:2,payment:'cod'}));o=await order(r.data.order_number);
 check('inactive offer: no packs and the landing price',!html.includes('qty-pack')&&Number(o.unit_price)!==100000&&o.offer_snapshot===null);
 console.log(`OK ${count} checks passed`);
}finally{
 await owner.request('/api/wompi/account','DELETE',{});await helper('payment-setup','cod','0');await offers(false,T).catch(()=>{});await landing({quantityOffers:false,offerHighlight:null}).catch(()=>{});wompi.close();
}
