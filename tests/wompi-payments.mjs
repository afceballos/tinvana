// Wompi phase 2: online payment on the landing. Choice and totals, prepaid freight, signed checkout, pending order,
// return status, retry, signed events (declined, wrong amount, approved, duplicate), 48 h expiry with a last check in
// Wompi, cash on delivery untouched and fallback without Wompi. Wompi (8449) and Dropi's quote (8444) are simulated;
// nothing reaches them. Runs only against the isolated local test database (tests/run-suites.ps1 -Only wompi-payments).
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let count=0;
const check=(name,value)=>{assert(value,name);count++;console.log('PASS '+name);};
const run=promisify(execFile);const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const sha=s=>createHash('sha256').update(s).digest('hex');
const K={public_key:'pub_test_FakePublicKey000000000001',private_key:'prv_test_FakePrivateKey00000000001',events_secret:'test_events_FakeEventsSecret0000001',integrity_secret:'test_integrity_FakeIntegrity00000001'};
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
// Wompi: merchant, key check and the transactions the 48 h check asks for (by reference).
const txByRef={};
const wompi=createServer(tls,(req,res)=>{const json=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};const u=new URL(req.url,'https://x');
 if(u.pathname===`/v1/merchants/${K.public_key}`)return json(200,{data:{name:'Comercio simulado',accepted_payment_methods:['CARD','PSE','NEQUI']}});
 if(u.pathname==='/v1/transactions'){if(req.headers.authorization!==`Bearer ${K.private_key}`)return json(401,{});return json(200,{data:txByRef[u.searchParams.get('reference')]||[]});}
 json(404,{});});
// Dropi quote: cash on delivery 16450, prepaid 14450 (VELOCES, as in the real probe of 2026-11-17).
const quotes=[];
const dropi=createServer(tls,(req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{const b=JSON.parse(body||'{}');quotes.push(b);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({isSuccess:true,status:200,objects:[{transportadora:'VELOCES',transportadora_id:6,objects:{precioEnvio:b.EnvioConCobro?16450:14450}}]}));});});
// Dropi orders (8443): records what Tinbana creates (phase 4: paid orders go SIN RECAUDO).
const created=[];const dropiOrders=createServer(tls,(req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{created.push(JSON.parse(body||'{}'));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({isSuccess:true,objects:{id:770000+created.length}}));});});
await new Promise(r=>wompi.listen(8449,'127.0.0.1',r));await new Promise(r=>dropi.listen(8444,'127.0.0.1',r));await new Promise(r=>dropiOrders.listen(8443,'127.0.0.1',r));
class Client {
 cookie='';csrf='';
 async request(path,method='GET',body,token=this.csrf){const response=await fetch(base+path,{method,redirect:'manual',headers:{Cookie:this.cookie,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});for(const c of response.headers.getSetCookie?.()||[]){const pair=c.split(';')[0];const name=pair.split('=')[0];this.cookie=[...this.cookie.split('; ').filter(x=>x&&!x.startsWith(name+'=')),pair].join('; ');}const text=await response.text();let data=null;try{data=JSON.parse(text);}catch{}return {response,data,text};}
 async init(){const r=await this.request('/api/auth/session');this.csrf=r.data.csrf;return r;}
 async login(email){await this.init();const r=await this.request('/api/auth/login','POST',{email,password:fixture.password});if(r.data.csrf)this.csrf=r.data.csrf;assert.equal(r.response.status,200);return r;}
}
const owner=new Client(),visitor=new Client();await owner.login(fixture.email);
const page=async()=>{const r=await visitor.request('/p/'+fixture.slug);visitor.csrf=r.text.match(/name="csrf" value="([^"]+)"/)?.[1]||visitor.csrf;return r.text;};
const lead=(extra={})=>({country_code:'CO',department_code:'11',city_code:'11001',address:'Calle 123 # 45-67',address_details:'Casa',postal_code:'110111',phone_country:'CO',first_name:'Ana',last_name:'Wompi',email:'pago@example.test',phone:'3001234567',idempotency_key:randomUUID(),website:'',quantity:1,...extra});
const order=async number=>{const list=(await owner.request('/api/orders')).data.orders;const o=list.find(x=>x.order_number===number);return (await owner.request('/api/orders/'+o.id)).data;};
let eventsUrl='';const tx=(reference,status,amount_in_cents,id='9'+Math.floor(Math.random()*1e9))=>({id,status,amount_in_cents,reference,currency:'COP',payment_method_type:'NEQUI'});
const deliver=t=>{const timestamp=Math.floor(Date.now()/1000);const checksum=sha(t.id+t.status+t.amount_in_cents+timestamp+K.events_secret);return fetch(eventsUrl.replace(/^https?:\/\/[^/]+/,base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'transaction.updated',data:{transaction:t},environment:'test',signature:{properties:['transaction.id','transaction.status','transaction.amount_in_cents'],checksum},timestamp})});};
try{
 await helper('reset-limits');await helper('shipping-setup','on');await helper('dropi-supplier');
 check('fixture landing published',(await owner.request('/api/landings/'+fixture.landing+'/publish','POST',{})).response.status===200);
 await helper('shipping-setup','on');await helper('payment-setup','both','10');
 // Without Wompi the landing stays cash on delivery.
 let html=await page();check('no payment choice without Wompi',!html.includes('pay-choice')&&html.includes('>Enviar solicitud<'));
 let r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead({payment:'online'}));
 check('online request falls back to cash on delivery',r.response.status===202&&!r.data.payment&&!!r.data.purchase);
 await owner.request('/api/wompi/account','PUT',K);eventsUrl=(await owner.request('/api/wompi/account')).data.account.events_url;
 html=await page();
 check('landing offers both, online first with its discount',html.includes('class="pay-choice"')&&/value="online" checked/.test(html)&&html.includes('10 % de descuento')&&html.includes('Pago contraentrega')&&html.includes('>Continuar al pago<'));
 // Freight: prepaid for online, cash on delivery otherwise.
 quotes.length=0;r=await visitor.request('/p/'+fixture.slug+'/shipping','POST',{city_code:'11001',quantity:1,payment:'online'});
 check('online quote is prepaid',r.data.amount===15000&&quotes.at(-1)?.EnvioConCobro===false);
 r=await visitor.request('/p/'+fixture.slug+'/shipping','POST',{city_code:'11001',quantity:1,payment:'cod'});
 // The cash quote may come from the 6 h cache (the fallback order above already asked for it).
 check('cash quote stays cash on delivery',r.data.amount===17000);
 // Online order.
 r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead({payment:'online',quantity:2}));
 const pay=r.data.payment;const url=new URL(pay.checkout_url);const ref=url.searchParams.get('reference');const baseRef=pay.reference;
 check('online order answers with a Wompi checkout, no Purchase yet',r.response.status===202&&!r.data.purchase&&url.origin+url.pathname==='https://checkout.wompi.co/p/'&&ref===baseRef+'-1'&&/^tb-[a-f0-9]{16}$/.test(baseRef));
 let d=await order(r.data.order_number);const o=d.order;const goods=Number(o.unit_price)*2;const expected=goods-Math.round(goods*0.1)+15000;
 check('amount fixed on the server: products − 10 % + prepaid freight',o.payment_method==='online'&&o.payment_status==='pending'&&o.payment.amount===expected&&o.payment.discount_percent===10&&o.payment.shipping===15000&&Number(o.shipping_price)===15000&&pay.amount===expected);
 check('checkout signed with the integrity secret',url.searchParams.get('amount-in-cents')===String(expected*100)&&url.searchParams.get('signature:integrity')===sha(ref+expected*100+'COP'+K.integrity_secret)&&url.searchParams.get('public-key')===K.public_key);
 check('order emails wait for the payment',!JSON.parse(await helper('mail-queue')).some(m=>m.dedupe_key?.includes(o.id)));
 check('cannot be confirmed before the payment',(await owner.request('/api/orders/'+o.id+'/confirm','POST',{version:o.version,quote_id:'x',evidence:'x',accepted:true})).response.status===409);
 r=await visitor.request('/p/'+fixture.slug+'/pago/'+baseRef);
 check('return page status: pending with retry',r.data.status==='pending'&&!r.data.declined&&r.data.retry_url===`/p/${fixture.slug}/pagar/${baseRef}`&&!r.text.includes('pago@example.test'));
 r=await visitor.request('/p/'+fixture.slug+'/pagar/'+baseRef);
 check('retry is a new signed attempt',r.response.status===303&&new URL(r.response.headers.get('location')).searchParams.get('reference')===baseRef+'-2');
 check('unknown reference is 404',(await visitor.request('/p/'+fixture.slug+'/pago/tb-0000000000000000')).response.status===404);
 // Events.
 check('declined event accepted',(await deliver(tx(baseRef+'-1','DECLINED',expected*100))).status===200);
 r=await visitor.request('/p/'+fixture.slug+'/pago/'+baseRef);check('declined shown, order still pending',r.data.status==='pending'&&r.data.declined===true);
 let pend=(await owner.request('/api/pending')).data.sections.find(s=>s.key==='payments');
 check('pending lists the declined payment',pend?.items.some(i=>i.warn==='Pago rechazado'&&i.key==='paywait:'+o.id));
 await deliver(tx(baseRef+'-2','APPROVED',100));d=await order(r.data.order_number);
 check('approved with another amount is not paid',d.order.payment_status==='pending'&&d.order.payment.mismatch?.amount_in_cents===100&&d.events.some(e=>e.event_type==='payment_mismatch'));
 const good=tx(baseRef+'-2','APPROVED',expected*100,'777-1');check('approved event accepted',(await deliver(good)).status===200);
 d=await order(r.data.order_number);
 check('order paid with the Wompi transaction',d.order.payment_status==='paid'&&!!d.order.paid_at&&d.order.payment.transaction_id==='777-1'&&d.order.payment.method==='NEQUI'&&d.events.some(e=>e.event_type==='payment_approved'));
 check('paid order total is what Wompi charged, and its price is not quoted again',Number(d.order.total)===expected&&(await owner.request('/api/orders/'+o.id+'/quote','POST',{quantity:1,unit_price:'1000',shipping_price:'0',version:d.order.version})).response.status===409);
 check('paying confirms the order (no call, no «1 SÍ»)',d.order.sale_status==='confirmed'&&d.order.confirmation?.source==='wompi'&&d.events.some(e=>e.event_type==='confirmed'));
 await deliver(good);const mails=JSON.parse(await helper('mail-queue')).filter(m=>m.dedupe_key?.includes(o.id));
 check('emails queued once when paid: payment received and new paid order',mails.filter(m=>m.kind==='buyer_confirmed').length===1&&mails.filter(m=>m.kind==='owner_new_order').length===1&&!mails.some(m=>m.kind==='buyer_received'));
 r=await visitor.request('/p/'+fixture.slug+'/pago/'+baseRef);check('return page status: paid',r.data.status==='paid'&&r.data.amount===expected&&r.data.retry_url===null&&r.data.order_number===d.order.order_number);
 check('paid order cannot be retried',(await visitor.request('/p/'+fixture.slug+'/pagar/'+baseRef)).response.status===409);
 // Phase 4, option A (default): the store sends it; it goes SIN RECAUDO with the amount the buyer paid.
 check('paid order ready for Dropi as SIN RECAUDO',d.dropi.rate_type==='SIN RECAUDO'&&d.dropi.can_submit===true&&d.dropi.checks.some(c=>c.key==='paid'&&c.ready)&&/SIN RECAUDO/.test(d.dropi.message)&&created.length===0);
 r=await owner.request('/api/orders/'+o.id+'/dropi','POST',{confirm:true,version:d.order.version});const sent=created.at(-1);
 check('sent to Dropi SIN RECAUDO with the amount paid',r.response.status===200&&sent?.rate_type==='SIN RECAUDO'&&sent.payment_method_id===1&&sent.total_order===expected&&Math.round(sent.products[0].price*sent.products[0].quantity)===expected);
 check('paid order leaves pending',!(await owner.request('/api/pending')).data.sections.find(s=>s.key==='payments')?.items.some(i=>i.key.includes(o.id)));
 // Cash on delivery on the same landing is untouched.
 r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead({payment:'cod'}));d=await order(r.data.order_number);
 check('cash on delivery order as before',r.response.status===202&&!r.data.payment&&!!r.data.purchase&&d.order.payment_method==='cod'&&d.order.payment_status==='pending');
 // Online only: no field needed.
 await helper('payment-setup','online','0');html=await page();
 check('online only shows no choice',html.includes('pay-choice is-single')&&!html.includes('Pago contraentrega'));
 r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead());const lost=r.data.payment.reference;
 check('online only charges without discount',r.data.payment.amount===Number(o.unit_price)+15000);
 // 48 h: nothing approved in Wompi → expired and cancelled.
 let lo=(await order(r.data.order_number)).order;await helper('payment-due',lo.id);let ex=JSON.parse(await helper('payment-expire'));
 lo=(await order(r.data.order_number)).order;check('unpaid order expires and is cancelled',ex.expired>=1&&lo.payment_status==='expired'&&lo.sale_status==='cancelled');
 check('expired payment cannot be retried',(await visitor.request('/p/'+fixture.slug+'/pagar/'+lost)).response.status===409);
 // 48 h with an approved payment whose event never arrived → paid by the last check in Wompi.
 r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead());const late=r.data.payment;txByRef[late.reference+'-1']=[tx(late.reference+'-1','APPROVED',Math.round(late.amount*100),'888-1')];
 lo=(await order(r.data.order_number)).order;await helper('payment-due',lo.id);ex=JSON.parse(await helper('payment-expire'));
 lo=(await order(r.data.order_number)).order;check('lost event recovered by asking Wompi',ex.paid>=1&&lo.payment_status==='paid'&&lo.sale_status!=='cancelled'&&lo.payment.source==='reconcile');
 // Option B: with the switch on, a newly paid order goes to Dropi by itself.
 const acc=(await owner.request('/api/wompi/account')).data.account;check('automatic sending is off by default',acc.auto_dropi===false);
 check('switch saved',(await owner.request('/api/wompi/account/settings','PUT',{auto_dropi:true})).data.account.auto_dropi===true);
 await helper('payment-setup','online','0');r=await visitor.request('/p/'+fixture.slug+'/lead','POST',lead());const auto=r.data.payment;const before=created.length;
 await deliver(tx(auto.reference+'-1','APPROVED',Math.round(auto.amount*100),'999-1'));d=await order(r.data.order_number);
 check('paid order sent to Dropi automatically',created.length===before+1&&created.at(-1).rate_type==='SIN RECAUDO'&&d.order.integration_status==='sent'&&d.order.sale_status==='confirmed');
 await owner.request('/api/wompi/account/settings','PUT',{auto_dropi:false});
 // Editor validation.
 const landing=(await owner.request('/api/landings/'+fixture.landing)).data.landing;
 check('invalid payment mode refused',(await owner.request('/api/landings/'+fixture.landing,'PUT',{content:{...landing.content,commerce:{...landing.content.commerce,paymentMode:'cash'}},slug:landing.slug})).response.status===422);
 check('discount over 50 % refused',(await owner.request('/api/landings/'+fixture.landing,'PUT',{content:{...landing.content,commerce:{...landing.content.commerce,paymentMode:'both',onlineDiscount:80}},slug:landing.slug})).response.status===422);
 console.log(`OK ${count} checks passed`);
}finally{
 await owner.request('/api/wompi/account','DELETE',{});await helper('payment-setup','cod','0');wompi.close();dropi.close();dropiOrders.close();
}
