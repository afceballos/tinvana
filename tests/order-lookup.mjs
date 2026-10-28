import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Public order number (TB-XXXX-XXXX): created with the order, shown to the buyer (popup and look-up page with masked
// contact data) and in the panel (list, search and detail). Isolated local data only.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const orders=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
let owner,visitor;
const lookup=async n=>(await(await visitor.get('/pedido?numero='+encodeURIComponent(n))).text());
try{
 await orders('reset-limits');owner=await login(f.email);visitor=await request.newContext({baseURL:base});
 check('fixture landing published',(await owner.ctx.post('/api/landings/'+f.landing+'/publish',{headers:owner.H})).ok());
 const page=await(await visitor.get('/p/'+f.slug)).text();const token=page.match(/name="csrf" value="([^"]+)"/)[1];
 const r=await visitor.post('/p/'+f.slug+'/lead',{headers:{'X-CSRF-Token':token},data:{csrf:token,idempotency_key:randomUUID(),first_name:'Laura',last_name:'Pérez Gómez',email:'laura.perez@example.test',phone:'3001234567',phone_country:'CO',country_code:'CO',department_code:'05',city_code:'05001',address:'Calle 10 # 20-30',address_details:'Apto 301',quantity:1,website:''}});
 const res=await r.json();const number=res.order_number;
 check('each order gets a unique number TB-XXXX-XXXX and its look-up address',r.status()===202&&/^TB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(number)&&res.tracking_url.endsWith('/pedido?numero='+encodeURIComponent(number)));
 let html=await(await visitor.get('/pedido')).text();
 check('the look-up page asks for the number',html.includes('Consulta tu pedido')&&html.includes('name="numero"')&&html.includes('noindex'));
 html=await lookup(number.replace(/-/g,' ').toLowerCase());
 check('the number works with spaces and lowercase',html.includes(number));
 check('the page shows the status, the product and the full delivery address',html.includes('Recibido')&&html.includes('Calle 10 # 20-30 Apto 301')&&/Medell[ií]n/.test(html));
 check('name, phone and email appear only in part',html.includes('La••• Pé••• Gó•••')&&html.includes('+57 300 ••• ••67')&&html.includes('la•••@ex•••.test')&&!html.includes('laura.perez@')&&!html.includes('3001234567')&&!html.includes('Pérez'));
 check('an unknown number is explained',(await lookup('TB-2222-3333')).includes('No encontramos un pedido'));
 check('text that is not a number asks for the right format',(await lookup('hola')).includes('Escribe el número'));
 check('the page only accepts GET',(await visitor.post('/pedido',{data:{numero:number}})).status()===405);
 // Panel
 const list=(await(await owner.ctx.get('/api/orders')).json()).orders;const mine=list.find(o=>o.order_number===number);
 check('the orders list carries the number',!!mine);
 const found=(await(await owner.ctx.get('/api/orders?q='+encodeURIComponent(number.slice(3,7).toLowerCase()))).json()).orders;
 check('the panel finds an order by part of its number',found.length>=1&&found.every(o=>o.order_number.includes(number.slice(3,7))));
 await orders('clear-number',mine.id);const d=(await(await owner.ctx.get('/api/orders/'+mine.id)).json()).order;
 check('an order created before numbers existed gets one when opened',/^TB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(d.order_number)&&d.order_number!==number);
 // Browser: panel and popup
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const pctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1280,height:900}});const pp=await pctx.newPage();pp.on('pageerror',e=>errors.push(e.message));
 await pp.goto(base+'/panel/pedidos');await pp.locator('.order-number').first().waitFor();
 check('each order row shows its number',(await pp.locator('.order-number').allInnerTexts()).includes(d.order_number));
 await pp.getByPlaceholder('Número de pedido (TB-…)').fill(d.order_number);await pp.getByRole('button',{name:'Buscar'}).click();await pp.waitForURL(/q=/);await pp.locator('.order-row').first().waitFor();
 check('searching by number leaves only that order',await pp.locator('.order-row').count()===1);
 await pp.screenshot({path:'test-results/order-number-list.png'});
 await pp.goto(base+'/panel/pedidos/'+mine.id);await pp.locator('.od-eyebrow').waitFor();
 check('the order detail shows the number in its header',(await pp.locator('.od-eyebrow').innerText()).includes(d.order_number));
 const lctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await lctx.route('https://example.test/**',x=>x.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
 const lp=await lctx.newPage();lp.on('pageerror',e=>errors.push(e.message));await lp.goto(base+'/pedido?numero='+encodeURIComponent(d.order_number));
 check('the look-up page fits a phone',await lp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await lp.screenshot({path:'test-results/order-lookup-mobile.png',fullPage:true});
 await lp.goto(base+'/p/'+f.slug);await lp.locator('[data-buy]').first().click();const m=lp.locator('#purchase-dialog');await m.locator('.iti').waitFor();
 await m.locator('[name=first_name]').fill('Ana');await m.locator('[name=last_name]').fill('Popup');await m.locator('[name=email]').fill('popup-numero@example.test');await m.locator('[name=phone]').fill('3001234567');
 await m.locator('[name=department_code]').selectOption('05');await m.locator('[name=city_code]').selectOption('05001');await m.locator('[name=address]').fill('Calle 1 # 2-3');
 await m.getByRole('button',{name:/Enviar solicitud/}).click();const pop=lp.locator('dialog.lead-success');await pop.locator('.ls-code').waitFor();
 const shown=(await pop.locator('.ls-code strong').innerText()).trim();
 check('the success popup shows the order number and how to look it up',/^TB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(shown)&&(await pop.getByRole('link',{name:'Consultar mi pedido'}).getAttribute('href')).endsWith('/pedido?numero='+encodeURIComponent(shown)));
 await lp.waitForTimeout(1200);await pop.screenshot({path:'test-results/order-number-popup.png'});
 check('no browser errors',errors.length===0);
 console.log(`${checks} order number checks passed. Local isolated database only.`);
}finally{await browser?.close();}
