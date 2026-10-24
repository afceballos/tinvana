import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Branded error page (server-refused pages and unknown panel routes) and idle session redirect.
// Requires the test server started with SESSION_LIFETIME=8 (seconds). Local isolated database only.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await run('.tools/php/php.exe',['backend/tests/orders-helper.php','reset-limits']);
try{
 const anon=await request.newContext({baseURL:base});
 let r=await anon.get('/esta-ruta-no-existe');let html=await r.text();
 check('unknown address answers 404 with the error embedded in the app',r.status()===404&&html.includes('name="tinvana-error"')&&html.includes('&quot;status&quot;:404'));
 r=await anon.get('/p/producto-que-no-existe');check('missing landing answers 404 with its message',r.status()===404&&(await r.text()).includes('Producto no encontrado'));
 check('API errors stay JSON',(await anon.get('/api/no-existe')).headers()['content-type'].includes('application/json'));
 await anon.dispose();
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/esta-ruta-no-existe');await page.locator('.err-screen').waitFor();
 check('404 page shows the branded copy without repeating the generic message',(await page.locator('h1').innerText())==='Esta página tomó otro vuelo'&&await page.locator('.err-orbit .err-bird img').count()===1&&await page.locator('.err-detail').count()===0);
 check('404 page is animated',await page.locator('.err-bird').evaluate(e=>getComputedStyle(e).animationName)==='err-spin');
 await page.waitForTimeout(900);await page.screenshot({path:'test-results/error-404.png'});
 await page.goto(base+'/p/producto-que-no-existe');await page.locator('.err-screen').waitFor();
 check('server message shown under the copy',(await page.locator('.err-detail').innerText()).includes('Producto no encontrado'));
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(900);check('error page fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/error-404-mobile.png'});
 const reduced=await browser.newContext({reducedMotion:'reduce',colorScheme:'dark'});const rp=await reduced.newPage();await rp.addInitScript(()=>{try{localStorage.setItem('tinvana-theme','dark');}catch{}});
 await rp.goto(base+'/esta-ruta-no-existe');await rp.locator('.err-screen').waitFor();
 check('reduced motion stops the animation',await rp.locator('.err-bird').evaluate(e=>getComputedStyle(e).animationName)==='none');
 await rp.screenshot({path:'test-results/error-404-dark.png'});await reduced.close();
 // Session
 const login=async p=>{await p.goto(base+'/login');await p.getByLabel('Email').fill(f.email);await p.getByLabel('Contraseña').fill(f.password);await p.getByRole('button',{name:/Iniciar sesión/}).click();};
 const app=await browser.newContext({viewport:{width:1440,height:900}});const p=await app.newPage();p.on('pageerror',e=>errors.push(e.message));
 await login(p);await p.waitForURL(/\/panel\/catalogo/);
 await p.evaluate(()=>{history.pushState({},'','/panel/ruta-inventada');dispatchEvent(new PopStateEvent('popstate'));});await p.locator('.err-screen').waitFor();
 check('unknown panel route shows the same 404 page',(await p.locator('h1').innerText())==='Esta página tomó otro vuelo');
 await p.goto(base+'/panel/pedidos');await p.locator('.section-heading h1',{hasText:'Pedidos'}).waitFor();
 // Probes every ~2 s must not keep the idle session alive (lifetime 8 s).
 const probe=()=>p.evaluate(async()=>(await(await fetch('/api/auth/session',{headers:{'X-Session-Probe':'1'}})).json()).user!==null);
 check('probe sees the live session',await probe());
 for(let i=0;i<4;i++){await wait(2200);await probe();}
 await wait(1500);
 check('probes do not extend an idle session',!(await probe()));
 await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.waitForURL(/\/login/);
 check('expired session redirects to the login with a notice',(await p.locator('.auth-expired').innerText()).includes('inactividad'));
 await p.waitForTimeout(1500);await p.screenshot({path:'test-results/session-expired.png'});
 await p.getByLabel('Email').fill(f.email);await p.getByLabel('Contraseña').fill(f.password);await p.getByRole('button',{name:/Iniciar sesión/}).click();
 await p.waitForURL(/\/panel\/pedidos/);check('after logging in again it returns to where the user was',true);
 await wait(9000);await p.getByRole('button',{name:'Actualizar'}).click();await p.waitForURL(/\/login/);
 check('a request with an expired session also redirects to the login',await p.locator('.auth-expired').count()===1);
 check('no browser errors',errors.length===0);
 console.log(`${checks} error page and session checks passed. Local isolated database only.`);
}finally{await browser?.close();await run('.tools/php/php.exe',['backend/tests/orders-helper.php','reset-limits']).catch(()=>{});}
