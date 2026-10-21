import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);const php='.tools/php/php.exe';
const {url:base}=JSON.parse((await readFile('.tools/demo-runtime.json','utf8')).replace(/^\uFEFF/,''));
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
let errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/auth/session',async route=>{await gate;await route.continue();});
 await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Preparando tu espacio.'}).waitFor();
 assert.equal(await page.locator('.startup-center [role=progressbar]').count(),0);await page.screenshot({path:'test-results/loading-desktop.png',fullPage:true});
 await page.setViewportSize({width:375,height:812});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/loading-mobile.png',fullPage:true});
 await page.waitForTimeout(7100);await page.getByText(/La conexión está tardando/).waitFor();console.log('PASS branded loading desktop/mobile, honest delayed status and no overflow');
 release();await page.getByRole('heading',{name:'Entra a tu espacio'}).waitFor();await page.waitForTimeout(500);await page.screenshot({path:'test-results/login-motion-mobile.png',fullPage:true});
 assert.equal(await page.locator('.startup-loader').count(),0);console.log('PASS loading exits as soon as real session response finishes');
 const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:375,height:812}});const rp=await reduced.newPage();rp.on('pageerror',e=>errors.push(e.message));
 let reduceRelease;const reducedGate=new Promise(resolve=>reduceRelease=resolve);await rp.route('**/api/auth/session',async route=>{await reducedGate;await route.continue();});await rp.goto(base+'/login',{waitUntil:'domcontentloaded'});await rp.locator('.loader-tile-main').waitFor();assert.equal(await rp.locator('.loader-tile-main').evaluate(el=>getComputedStyle(el).animationName),'none');reduceRelease();await rp.getByLabel('Email',{exact:true}).waitFor();assert.equal(await rp.locator('.motion-view').evaluate(el=>getComputedStyle(el).opacity),'1');await reduced.close();console.log('PASS reduced motion disables loops and GSAP entrance');
 await execute(php,['.tools/motion-session.php']);const session=JSON.parse(await readFile('.tools/motion-session.json','utf8'));
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:session.name,value:session.id,domain:session.domain,path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);const panel=await context.newPage();panel.on('pageerror',e=>errors.push(e.message));
 let catalogRelease;const catalogGate=new Promise(resolve=>catalogRelease=resolve);await panel.route('**/api/integrations/*/products?*',async route=>{await catalogGate;await route.continue();});
 await panel.goto(base+'/panel/catalogo');await panel.locator('.catalog-skeleton').first().waitFor();await panel.locator('.network-activity.is-active').waitFor();await panel.screenshot({path:'test-results/catalog-loading-desktop.png',fullPage:true});await panel.setViewportSize({width:375,height:812});assert(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await panel.screenshot({path:'test-results/catalog-loading-mobile.png',fullPage:true});catalogRelease();await panel.locator('.card').first().waitFor({timeout:45000});await panel.locator('.network-activity.is-active').waitFor({state:'hidden',timeout:45000});assert.equal(await panel.locator('.catalog-skeleton').count(),0);console.log('PASS real catalog skeleton and activity finish with actual Dropi results');
 await panel.setViewportSize({width:1440,height:1000});await panel.getByRole('link',{name:'Mis productos',exact:true}).click();await panel.locator('.selected-row').first().waitFor();await panel.getByRole('link',{name:'Consultas recibidas',exact:true}).click();await panel.getByRole('heading',{name:'Consultas recibidas'}).waitFor();await panel.getByRole('link',{name:'Mis productos',exact:true}).click();await panel.locator('.selected-row').first().waitFor();await panel.waitForTimeout(500);assert.equal(await panel.locator('.motion-view').evaluate(el=>getComputedStyle(el).opacity),'1');assert(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await panel.setViewportSize({width:375,height:812});await panel.screenshot({path:'test-results/route-motion-mobile.png',fullPage:true});console.log('PASS route transitions leave content visible and responsive');
 assert.equal(errors.length,0,errors.join('\n'));await context.close();console.log('PASS no browser JavaScript errors. Used real session/API responses; no product or lead mutations.');
}finally{await browser.close();await execute(php,['.tools/motion-session.php','cleanup']);}
