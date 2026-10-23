import {request,chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Requires the isolated test server started with DROPI_ORDERS_URL=https://127.0.0.1:8443/integrations/orders/myorders
// and HTTP_CA_BUNDLE=.tools/test-cert.pem. The mock below stands in for Dropi; no real order is created.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const received=[];let reply={status:200,body:{isSuccess:true,objects:{id:777001}}};
const dropi=createServer({key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')},(req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{received.push({path:req.url,method:req.method,key:req.headers['dropi-integration-key'],body:JSON.parse(body)});res.writeHead(reply.status,{'Content-Type':'application/json'});res.end(typeof reply.body==='string'?reply.body:JSON.stringify(reply.body));});});
await new Promise(r=>dropi.listen(8443,'127.0.0.1',r));
const owner=await request.newContext({baseURL:base}),other=await request.newContext({baseURL:base});
async function login(ctx,email){const s=await(await ctx.get('/api/auth/session')).json();const r=await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});assert.equal(r.status(),200);return(await r.json()).csrf;}
const csrf=await login(owner,f.email),otherCsrf=await login(other,f.otherEmail);
const post=(path,data,ctx=owner,token=csrf)=>ctx.post(path,{headers:{'X-CSRF-Token':token},data});
const helper=async(action,id)=>run('.tools/php/php.exe',['backend/tests/orders-helper.php',action,...(id?[id]:[])]);
try{
 await helper('reset-limits');await helper('reset-orders');await helper('simple');await helper('dropi-no-supplier');
 const list=(await(await owner.get('/api/orders')).json()).orders;assert(list.length>=2,'Run the general HTTP suite first');
 const [first,second]=list;let path='/api/orders/'+first.id;let data=await(await owner.get(path)).json(),o=data.order;
 check('new order starts not sent',data.dropi.status==='not_sent'&&data.dropi.can_submit===false);
 check('supplier required before sending',data.dropi.checks.some(c=>c.key==='supplier'&&!c.ready));
 await helper('dropi-supplier');
 check('draft cannot be sent',(await post(path+'/dropi',{version:o.version,confirm:true})).status()===409);
 async function confirmOrder(){
  let r=await post(path+'/quote',{version:o.version,quantity:2,unit_price:'50000',shipping_price:'12000',notes:'Nota interna que no viaja.'});assert.equal(r.status(),200,await r.text());o=(await r.json()).order;
  r=await post(path+'/confirm',{version:o.version,quote_id:o.quote_id,evidence:'Aceptó el resumen por WhatsApp de prueba.',accepted:true});assert.equal(r.status(),200,await r.text());data=await r.json();o=data.order;
 }
 await confirmOrder();
 check('confirmed order is ready to send',data.dropi.can_submit===true&&data.dropi.checks.every(c=>c.ready));
 check('preview shows Dropi fields',data.dropi.preview.status==='PENDIENTE CONFIRMACION'&&data.dropi.preview.rate_type==='CON RECAUDO'&&data.dropi.preview.total_order===112000&&data.dropi.preview.supplier_id===55);
 check('submit requires CSRF',(await post(path+'/dropi',{version:o.version,confirm:true},owner,'bad')).status()===419);
 check('foreign submit denied',(await post(path+'/dropi',{version:o.version,confirm:true},other,otherCsrf)).status()===404);
 check('submit requires explicit review',(await post(path+'/dropi',{version:o.version})).status()===422);
 check('stale version refused',(await post(path+'/dropi',{version:o.version-1,confirm:true})).status()===409);
 check('no request reached Dropi yet',received.length===0);

 reply={status:200,body:{isSuccess:false,message:'La ciudad no tiene cobertura'}};
 data=await(await post(path+'/dropi',{version:o.version,confirm:true})).json();o=data.order;
 const sent=received.at(-1);
 check('request goes to orders/myorders with integration key',sent.method==='POST'&&sent.path==='/integrations/orders/myorders'&&typeof sent.key==='string'&&sent.key.startsWith('non-production-test-token-'));
 check('body follows plugin contract',sent.body.status==='PENDIENTE CONFIRMACION'&&sent.body.type==='FINAL_ORDER'&&sent.body.rate_type==='CON RECAUDO'&&sent.body.payment_method_id===1&&sent.body.calculate_costs_and_shiping===true&&sent.body.create_product_if_not_exist===false);
 check('body carries product, quantity and collected total',sent.body.products[0].id===987654321&&sent.body.products[0].quantity===2&&sent.body.products[0].price===56000&&sent.body.total_order===112000&&sent.body.supplier_id===55);
 check('body carries buyer and address',sent.body.name===o.customer.first_name&&sent.body.client_email===o.customer.email&&!sent.body.phone.startsWith('+')&&sent.body.dir.includes(o.delivery_address.address)&&sent.body.country==='CO'&&!!sent.body.state&&!!sent.body.city);
 check('internal notes not sent to Dropi',!JSON.stringify(sent.body).includes('Nota interna'));
 check('rejection recorded as failed with reason',data.dropi.status==='failed'&&data.order.dropi_order_id===null&&data.dropi.last.message.includes('cobertura'));
 check('failed send can be retried',data.dropi.can_submit===true);

 reply={status:502,body:'<html>Bad gateway</html>'};
 data=await(await post(path+'/dropi',{version:o.version,confirm:true})).json();o=data.order;
 check('ambiguous response is unknown',data.dropi.status==='unknown'&&data.dropi.can_submit===false&&data.dropi.can_resolve===true);
 const count=received.length;
 check('unknown result blocks resubmission',(await post(path+'/dropi',{version:o.version,confirm:true})).status()===409&&received.length===count);
 check('unknown result blocks local cancel',(await post(path+'/cancel',{version:o.version,reason:'Prueba'})).status()===409);
 check('unknown result blocks reopen',(await post(path+'/reopen',{version:o.version,reason:'Prueba'})).status()===409);
 check('resolve needs order number when created',(await post(path+'/dropi/resolve',{version:o.version,outcome:'created',note:'Revisado.'})).status()===422);
 check('foreign resolve denied',(await post(path+'/dropi/resolve',{version:o.version,outcome:'not_created',note:'x'},other,otherCsrf)).status()===404);
 data=await(await post(path+'/dropi/resolve',{version:o.version,outcome:'not_created',note:'No aparece en Dropi.'})).json();o=data.order;
 check('operator resolution re-enables sending',data.dropi.status==='failed'&&data.dropi.can_submit===true);

 reply={status:200,body:{isSuccess:true,objects:{id:777001}}};
 data=await(await post(path+'/dropi',{version:o.version,confirm:true})).json();o=data.order;
 check('success stores Dropi order id',data.dropi.status==='sent'&&o.dropi_order_id==='777001'&&o.integration_status==='sent');
 const total=received.length;
 check('sent order cannot be sent twice',(await post(path+'/dropi',{version:o.version,confirm:true})).status()===409&&received.length===total);
 check('sent order cannot be cancelled locally',(await post(path+'/cancel',{version:o.version,reason:'Prueba'})).status()===409);
 check('history records every attempt',['dropi_submit_started','dropi_rejected','dropi_unknown','dropi_resolved','dropi_sent'].every(t=>data.events.some(e=>e.event_type===t)));
 check('listing exposes integration state',(await(await owner.get('/api/orders')).json()).orders.find(x=>x.id===o.id).dropi_order_id==='777001');

 path='/api/orders/'+second.id;o=(await(await owner.get(path)).json()).order;await confirmOrder();
 await helper('dropi-stale',o.id);data=await(await owner.get(path)).json();o=data.order;
 check('interrupted send becomes resolvable',data.dropi.status==='sending'&&data.dropi.can_resolve===true&&data.dropi.can_submit===false);
 data=await(await post(path+'/dropi/resolve',{version:o.version,outcome:'created',dropi_order_id:'888002',note:'Encontrada en Dropi.'})).json();o=data.order;
 check('resolution can record an existing Dropi order',data.dropi.status==='sent'&&o.dropi_order_id==='888002');

 await helper('reset-orders');path='/api/orders/'+(await(await owner.get('/api/orders')).json()).orders[0].id;
 {
  o=(await(await owner.get(path)).json()).order;await confirmOrder();
  browser=await chromium.launch({channel:'msedge',headless:true});const ctx=await browser.newContext({storageState:await owner.storageState(),viewport:{width:1440,height:1000},reducedMotion:'reduce'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  reply={status:200,body:{isSuccess:true,objects:{id:999003}}};
  await page.goto(base+'/panel/pedidos/'+o.id);await page.getByRole('heading',{name:'Envío a Dropi'}).waitFor();
  check('UI shows preview before sending',await page.getByText('Valor a recaudar').isVisible());
  await page.getByLabel(/Revisé los datos/).check();await page.getByRole('button',{name:'Enviar a Dropi'}).click();
  await page.getByText('Orden Dropi #999003').waitFor();check('UI shows created Dropi order',await page.getByText('Creado en Dropi').first().isVisible());
  check('UI hides local cancel after sending',await page.getByText('Cancelar pedido local').count()===0);
  await page.setViewportSize({width:390,height:900});check('Dropi panel fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test-results/dropi-order-mobile.png',fullPage:true});check('no browser errors',errors.length===0);
 }
 console.log(`${checks} Dropi submission checks passed against a local mock. No real Dropi order was created.`);
}finally{await helper('reset-orders');await helper('dropi-no-supplier');await browser?.close();await owner.dispose();await other.dispose();dropi.close();}
