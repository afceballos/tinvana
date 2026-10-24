import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Orders list date filter: Colombia calendar days (UTC-5), validation and panel controls. Local isolated database only.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const owner=await request.newContext({baseURL:base});
const list=async q=>(await(await owner.get('/api/orders?'+q)).json()).orders.map(o=>o.id);
try{
 await helper('reset-limits');await helper('reset-orders');
 const s=await(await owner.get('/api/auth/session')).json();await owner.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email:f.email,password:f.password}});
 const all=(await(await owner.get('/api/orders')).json()).orders;assert(all.length>=2,'Run general HTTP tests first');
 const [a,b]=all;
 // a: 2026-03-10 23:30 in Colombia (= 03-11 04:30 UTC); b: 2026-03-11 00:10 in Colombia.
 await helper('order-created-at',a.id,'2026-03-11T04:30:00Z');await helper('order-created-at',b.id,'2026-03-11T05:10:00Z');
 let ids=await list('from=2026-03-10&to=2026-03-10');check('day boundary follows Colombia time (late night stays on its day)',ids.includes(a.id)&&!ids.includes(b.id));
 ids=await list('from=2026-03-11&to=2026-03-11');check('next Colombia day starts at midnight local',ids.includes(b.id)&&!ids.includes(a.id));
 ids=await list('from=2026-03-10');check('open-ended from',ids.includes(a.id)&&ids.includes(b.id));
 ids=await list('to=2026-03-10');check('open-ended to',ids.includes(a.id)&&!ids.includes(b.id));
 check('combines with sale status',(await list('from=2026-03-10&to=2026-03-11&status=cancelled')).length===0);
 check('invalid date rejected',(await owner.get('/api/orders?from=2026-02-30')).status()===422&&(await owner.get('/api/orders?from=ayer')).status()===422);
 check('from after to rejected',(await owner.get('/api/orders?from=2026-03-12&to=2026-03-11')).status()===422);
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await(await browser.newContext({storageState:await owner.storageState(),viewport:{width:1440,height:1000},reducedMotion:'reduce'})).newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/panel/pedidos?from=2026-03-11&to=2026-03-11');await page.locator('.order-row').first().waitFor();
 check('URL range applied in the list',await page.locator('.order-row').count()===1&&await page.getByLabel('Desde').inputValue()==='2026-03-11');
 await page.screenshot({path:'test-results/order-dates.png'});
 await page.getByRole('button',{name:'Hoy'}).click();await page.waitForURL(/from=/);await page.locator('.empty,.order-row').first().waitFor();
 check('preset sets today and marks itself',await page.getByRole('button',{name:'Hoy'}).getAttribute('aria-pressed')==='true'&&!(await page.locator('.order-list').innerText().catch(()=>'')).includes(a.customer.first_name+'XX'));
 await page.getByRole('button',{name:'Quitar fechas'}).click();await page.waitForURL(u=>!u.search.includes('from='));await page.locator('.order-row').first().waitFor();
 check('clearing dates shows all orders again',await page.locator('.order-row').count()>=2);
 await page.getByLabel('Desde').fill('2026-03-10');await page.getByLabel('Hasta').fill('2026-03-10');await page.waitForURL(/to=2026-03-10/);await page.locator('.order-row').first().waitFor();
 check('manual dates filter the list',await page.locator('.order-row').count()===1);
 await page.setViewportSize({width:390,height:900});check('fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('no browser errors',errors.length===0);
 console.log(`${checks} order date filter checks passed. Local isolated database only.`);
}finally{await helper('reset-orders').catch(()=>{});await browser?.close();await owner.dispose();}
