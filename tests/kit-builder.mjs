// Phase B: «Arma tu kit». Editor validation, the block on the landing, server rules for the buyer's kit (size, total,
// maximum per piece, sold out, one kit per order), fixed price per size, quantity offers off, Wompi on top, and the kit
// composition in the order and the buyer's order page. Wompi is simulated on 8449; nothing leaves the machine.
// Runs only against the isolated local test database (tests/run-suites.ps1 -Only kit-builder).
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
const lead=(extra={})=>({country_code:'CO',department_code:'11',city_code:'11001',address:'Calle 123 # 45-67',address_details:'',postal_code:'110111',phone_country:'CO',first_name:'Ana',last_name:'Kit',email:'kit@example.test',phone:'3001234567',idempotency_key:randomUUID(),website:'',quantity:1,...extra});
const order=async number=>{const o=(await owner.request('/api/orders')).data.orders.find(x=>x.order_number===number);return (await owner.request('/api/orders/'+o.id)).data.order;};
const S3=randomUUID(),S6=randomUUID(),RENO=randomUUID(),SANTA=randomUUID(),OSO=randomUUID(),OUT=randomUUID();
const item=(id,title,extra={})=>({id,title,description:'',value:'',quantity:'',image:'',icon:'check',rating:null,date:'',visible:true,...extra});
const kitBlock=(data={})=>({id:randomUUID(),type:'kit',visible:true,variant:'cards',style:{tone:'paper',space:'normal',align:'left',ratio:'landscape'},data:{title:'Arma tu kit',subtitle:'',ctaText:'',sizes:[{id:S3,label:'Kit de 3',pieces:3,price:70000},{id:S6,label:'Kit de 6',pieces:6,price:120000}],items:[item(RENO,'Reno',{quantity:'2'}),item(SANTA,'Papá Noel'),item(OSO,'Osito'),item(OUT,'Duende',{value:'agotada'})],...data}});
const original=(await owner.request('/api/landings/'+fixture.landing)).data.landing;
const save=async(blocks,commerce={})=>owner.request('/api/landings/'+fixture.landing,'PUT',{content:{...original.content,blocks,commerce:{...original.content.commerce,quantityEnabled:true,maxQuantity:5,...commerce}},slug:original.slug});
const kit=(size,pieces)=>JSON.stringify({size,pieces});
try{
 await helper('reset-limits');const blocks=original.content.blocks;
 check('a kit needs at least one size',(await save([...blocks,kitBlock({sizes:[]})])).response.status===422);
 check('a size needs 1 to 30 pieces',(await save([...blocks,kitBlock({sizes:[{id:S3,label:'Kit',pieces:0,price:1000}]})])).response.status===422);
 check('the piece maximum must be a number',(await save([...blocks,kitBlock({items:[item(RENO,'Reno',{quantity:'muchos'})]})])).response.status===422);
 check('only one visible kit per landing',(await save([...blocks,kitBlock(),kitBlock()])).response.status===422);
 check('kit saved',(await save([...blocks,kitBlock()],{quantityOffers:true})).response.status===200);
 const v=(await owner.request('/api/products/'+fixture.product+'/offers')).data;await owner.request('/api/products/'+fixture.product+'/offers','PUT',{version:v.version,settings:{active:true,tiers:[{min_quantity:1,unit_price:'50000.00'},{min_quantity:2,unit_price:'40000.00'}],starts_at:null,ends_at:null}});
 await owner.request('/api/landings/'+fixture.landing+'/publish','POST',{});
 const html=await page();
 check('kit on the landing: sizes, pieces, sold out and the form field',html.includes('data-kit-block')&&html.includes('Kit de 3')&&html.includes('Kit de 6')&&html.includes('Agotada')&&html.includes('Máximo 2')&&html.includes('name="kit"')&&html.includes('data-kit="1"'));
 check('no quantity packs on a kit landing',!html.includes('qty-pack'));
 const post=extra=>visitor.request('/p/'+fixture.slug+'/lead','POST',lead(extra));
 check('order without a kit refused',(await post({})).response.status===422);
 check('incomplete kit refused',(await post({kit:kit(S3,{[RENO]:1,[SANTA]:1})})).response.status===422);
 check('over the piece maximum refused',(await post({kit:kit(S3,{[RENO]:3})})).response.status===422);
 check('sold out piece refused',(await post({kit:kit(S3,{[OUT]:1,[RENO]:2})})).response.status===409);
 check('unknown piece refused',(await post({kit:kit(S3,{[randomUUID()]:3})})).response.status===422);
 check('one kit per order',(await post({quantity:2,kit:kit(S3,{[RENO]:2,[SANTA]:1})})).response.status===422);
 let r=await post({kit:kit(S3,{[RENO]:2,[SANTA]:1})});let o=await order(r.data.order_number);
 check('kit of 3 at its fixed price, with its composition',r.response.status===202&&Number(o.unit_price)===70000&&o.quantity===1&&o.offer_snapshot===null&&o.product_data.kit?.text==='Kit de 3: 2 × Reno, 1 × Papá Noel');
 r=await post({kit:kit(S6,{[RENO]:2,[SANTA]:2,[OSO]:2})});o=await order(r.data.order_number);
 check('kit of 6 at its price',Number(o.unit_price)===120000&&o.product_data.kit.size==='Kit de 6');
 const lookup=await visitor.request('/pedido?numero='+encodeURIComponent(o.order_number));
 check('the buyer sees the kit on the order page',lookup.text.includes('Kit de 6: 2 × Reno, 2 × Papá Noel, 2 × Osito'));
 await owner.request('/api/wompi/account','PUT',K);await helper('payment-setup','both','10');
 r=await post({payment:'online',kit:kit(S6,{[OSO]:6})});
 check('online: kit price, then the 10 % online discount',r.data.payment?.amount===108000);
 console.log(`OK ${count} checks passed`);
}finally{
 await owner.request('/api/wompi/account','DELETE',{});await helper('payment-setup','cod','0');
 await owner.request('/api/landings/'+fixture.landing,'PUT',{content:original.content,slug:original.slug});await owner.request('/api/landings/'+fixture.landing+'/publish','POST',{});
 const v=(await owner.request('/api/products/'+fixture.product+'/offers')).data;await owner.request('/api/products/'+fixture.product+'/offers','PUT',{version:v.version,settings:{active:false,tiers:[{min_quantity:1,unit_price:'50000.00'}],starts_at:null,ends_at:null}});
 wompi.close();
}
