import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Carrier choice and confirmed sending, against local mocks of the Dropi quote (8444), order creation (8443) and tracking (8445).
// Requires the test server started with DROPI_QUOTE_URL, DROPI_ORDERS_URL, DROPI_TRACKING_URL and HTTP_CA_BUNDLE. Nothing reaches Dropi.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
const serve=(port,handler)=>new Promise(r=>{const s=createServer(tls,(req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{const out=handler(req,b);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(out));});});s.listen(port,'127.0.0.1',()=>r(s));});
const created=[];
const quote=await serve(8444,()=>({isSuccess:true,status:200,objects:[{transportadora:'VELOCES',transportadora_id:6,objects:{precioEnvio:16450}},{transportadora:'ENVIA',transportadora_id:2,objects:{precioEnvio:16164}},{transportadora:'INTERRAPIDISIMO',transportadora_id:3,error:'No se puede crear una orden menor a $45.000 COP.'}]}));
const orders=await serve(8443,(req,b)=>{created.push(JSON.parse(b));return {isSuccess:true,objects:{id:880001}};});
const tracking=await serve(8445,()=>({isSuccess:true,status:200,objects:{id:880001,status:'PENDIENTE CONFIRMACION',shipping_company:'VELOCES',shipping_guide:'',shipping_amount:16450,history:[{status:'PENDIENTE CONFIRMACION',created_at:'2026-10-23T17:00:00'}]}}));
const owner=await request.newContext({baseURL:base});
try{
 await helper('reset-limits');await helper('reset-orders');await helper('dropi-supplier');await helper('shipping-setup','on');
 const s=await(await owner.get('/api/auth/session')).json();await owner.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email:f.email,password:f.password}});
 const csrf=(await(await owner.get('/api/auth/session')).json()).csrf;const H={'X-CSRF-Token':csrf};
 let o=(await(await owner.get('/api/orders')).json()).orders[0];const path='/api/orders/'+o.id;
 let d=await(await owner.post(path+'/quote',{headers:H,data:{version:o.version,quantity:1,unit_price:'59900',shipping_price:'17000',notes:''}})).json();
 d=await(await owner.post(path+'/confirm',{headers:H,data:{version:d.order.version,quote_id:d.order.quote_id,evidence:'Aceptó por WhatsApp el resumen.',accepted:true}})).json();o=d.order;
 const list=(await(await owner.post(path+'/dropi/carriers',{headers:H,data:{}})).json()).carriers;
 check('carrier list comes from the Dropi quote, cheapest first',list[0].name==='ENVIA'&&list[0].id===2&&list[0].price===16164&&list.at(-1).name==='INTERRAPIDISIMO'&&list.at(-1).price===null);
 check('confirmed without agreement rejected',(await owner.post(path+'/dropi',{headers:H,data:{version:o.version,confirm:true,confirmed:true,carrier_id:2}})).status()===422);
 check('unavailable carrier rejected',(await owner.post(path+'/dropi',{headers:H,data:{version:o.version,confirm:true,carrier_id:3}})).status()===422);
 check('unknown carrier rejected',(await owner.post(path+'/dropi',{headers:H,data:{version:o.version,confirm:true,carrier_id:999}})).status()===422);
 check('nothing was created while validating',created.length===0);
 browser=await chromium.launch({channel:'msedge',headless:true});const ctx=await browser.newContext({storageState:await owner.storageState(),viewport:{width:1440,height:1000},reducedMotion:'reduce'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/panel/pedidos/'+o.id);const form=page.locator('.dropi-send');await form.locator('.dropi-option',{hasText:'ENVIA'}).waitFor();
 check('cheapest carrier preselected and badged',await form.getByRole('radio',{name:/ENVIA/}).isChecked()&&(await form.locator('.dropi-option',{hasText:'ENVIA'}).innerText()).includes('Más económica'));
 check('unavailable carrier disabled with Dropi reason',await form.getByRole('radio',{name:/INTERRAPIDISIMO/}).isDisabled()&&(await form.locator('.dropi-option.is-off').innerText()).includes('45.000'));
 await form.getByRole('radio',{name:/^Confirmada/}).check();
 check('confirmed mode shows the warning and blocks until agreed',await form.locator('.dropi-confirm-warning').isVisible()&&await form.getByRole('button',{name:'Enviar confirmada a Dropi'}).isDisabled());
 await page.screenshot({path:'test-results/dropi-carrier-choice.png',fullPage:true});
 await form.getByLabel('Estoy de acuerdo con enviar esta orden confirmada.').check();await form.getByLabel(/Revisé los datos/).check();
 await form.getByRole('button',{name:'Enviar confirmada a Dropi'}).click();await page.getByText('Orden Dropi #880001').waitFor();
 const sent=created.at(-1);
 check('order created confirmed with the chosen carrier',created.length===1&&sent.status==='PENDIENTE'&&sent.distribution_company_id===2&&sent.shipping_company==='ENVIA');
 await page.getByRole('button',{name:'Actualizar desde Dropi'}).click();await page.locator('.toast-success',{hasText:'Estado de Dropi actualizado'}).waitFor();
 check('tracking warns when Dropi ignores the carrier',(await page.locator('.dropi-tracking').innerText()).includes('Pediste ENVIA, pero Dropi asignó VELOCES'));
 check('tracking warns when Dropi ignores the confirmation',(await page.locator('.dropi-tracking').innerText()).includes('La enviaste confirmada'));
 await page.screenshot({path:'test-results/dropi-carrier-sent.png',fullPage:true});
 await page.setViewportSize({width:390,height:900});check('fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('no browser errors',errors.length===0);
 console.log(`${checks} Dropi carrier checks passed against local mocks. Nothing reached Dropi.`);
}finally{await helper('shipping-setup','off').catch(()=>{});await helper('dropi-no-supplier').catch(()=>{});await helper('reset-orders').catch(()=>{});await browser?.close();await owner.dispose();quote.close();orders.close();tracking.close();}
