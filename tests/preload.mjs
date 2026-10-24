import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Preload screen: static (before JavaScript) and React (while the session loads), take-off exit, dark, mobile, reduced motion.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const slow=(page,pattern,ms)=>page.route(pattern,async route=>{await new Promise(r=>setTimeout(r,ms));await route.continue();});
// Positions of the preload parts, to check the HTML and React versions share one layout (no jump on handoff).
const metrics=()=>{const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};return {scene:box('.pl-scene'),h1:box('.pl-center h1'),bar:box('.pl-bar'),brand:box('.pl-brand'),foot:box('.pl-foot'),center:box('.pl-center'),vh:innerHeight};};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 // 0. Same layout without JavaScript and with React (animations stopped so boxes are stable).
 for(const [width,height] of [[1440,900],[390,800]]){
  const plain=await browser.newContext({viewport:{width,height},javaScriptEnabled:false,reducedMotion:'reduce'});const sp=await plain.newPage();await sp.goto(base+'/panel/catalogo');await sp.locator('.tv-preload').waitFor();const html=await sp.evaluate(metrics);await plain.close();
  const rc=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});const rp=await rc.newPage();
  await rp.route('**/api/auth/session',async route=>{await new Promise(r=>setTimeout(r,2500));await route.fulfill({status:200,contentType:'application/json',body:'{"user":null,"csrf":"x"}'});});
  await rp.goto(base+'/panel/catalogo');await rp.waitForTimeout(1500);const react=await rp.evaluate(metrics);await rc.close();
  check(`preload content vertically centered at ${width}px`,Math.abs(react.center.y+react.center.h/2-react.vh/2)<40);
  for(const key of ['scene','h1','bar','brand','foot'])check(`${key} does not move between HTML and React at ${width}px`,JSON.stringify(html[key])===JSON.stringify(react[key]));
 }
 // 1. Static preload: hold the app bundle so the HTML-only screen stays visible.
 let ctx=await browser.newContext({viewport:{width:1440,height:900}});let page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await slow(page,'**/app/assets/*.js',4000);await page.goto(base+'/login',{waitUntil:'commit'});await page.locator('.tv-preload .pl-bird').waitFor();await page.waitForTimeout(1000);
 check('static preload renders before JavaScript',await page.locator('.tv-preload .pl-bird').isVisible()&&(await page.locator('.tv-preload h1').innerText()).includes('tomando vuelo'));
 check('static preload is animated',await page.locator('.pl-ring .arc').evaluate(e=>getComputedStyle(e).animationName)==='pl-spin'&&await page.locator('.pl-orbit').count()===6);
 await page.screenshot({path:'test-results/preload-static.png'});
 await page.locator('.login-form, form').first().waitFor({timeout:15000});await page.waitForTimeout(1300);
 check('preload leaves once the app is ready',await page.locator('.tv-preload').count()===0);
 await ctx.close();
 // 2. React preload while the session check is slow, with rotating messages.
 ctx=await browser.newContext({viewport:{width:1440,height:900}});page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await slow(page,'**/api/auth/session',5200);await page.goto(base+'/login');await page.waitForTimeout(1500);
 const first=await page.locator('.pl-msg').innerText();await page.waitForTimeout(2400);const second=await page.locator('.pl-msg').innerText();
 check('messages rotate while waiting',first!==second);
 await page.screenshot({path:'test-results/preload-react.png'});
 await page.locator('.tv-preload.is-leaving').waitFor({timeout:8000});check('take-off plays when ready',true);
 await page.waitForTimeout(400);await page.screenshot({path:'test-results/preload-leaving.png'});
 await page.waitForTimeout(900);check('take-off overlay removes itself',await page.locator('.tv-preload').count()===0);
 await ctx.close();
 // 3. Dark theme and mobile.
 ctx=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'});page=await ctx.newPage();await page.addInitScript(()=>{try{localStorage.setItem('tinvana-theme','dark');}catch{}});
 await slow(page,'**/api/auth/session',4000);await page.goto(base+'/login');await page.waitForTimeout(1200);
 check('dark preload uses the dark palette and light logo',await page.locator('.tv-preload').evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(20, 17, 14)'&&await page.locator('.pl-brand .on-dark').isVisible());
 check('preload fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'test-results/preload-dark-mobile.png'});await ctx.close();
 // 4. Reduced motion: still, and no take-off overlay.
 ctx=await browser.newContext({reducedMotion:'reduce'});page=await ctx.newPage();await slow(page,'**/api/auth/session',2500);await page.goto(base+'/login');await page.waitForTimeout(800);
 check('reduced motion keeps the preload still',await page.locator('.pl-bird').evaluate(e=>getComputedStyle(e).animationName)==='none');
 await page.locator('form').first().waitFor();check('reduced motion skips the take-off overlay',await page.locator('.tv-preload').count()===0);await ctx.close();
 check('no browser errors',errors.length===0);
 console.log(`${checks} preload checks passed.`);
}finally{await browser?.close();}
