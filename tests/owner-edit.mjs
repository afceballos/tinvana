import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// "Editar landing" shortcut: only the signed-in owner receives it; visitors, other accounts and the editor preview never do.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
const owner=await login(f.email),other=await login(f.otherEmail),visitor=await request.newContext({baseURL:base});
try{
 check('fixture landing published',(await owner.ctx.post('/api/landings/'+f.landing+'/publish',{headers:owner.H})).status()===200);
 const mine=await(await owner.ctx.get('/p/'+f.slug)).text();
 check('owner gets the edit shortcut to this landing',mine.includes('class="owner-edit" href="/panel/landings/'+f.landing+'"'));
 check('visitors never receive it',!(await(await visitor.get('/p/'+f.slug)).text()).includes('owner-edit'));
 check('another signed-in account does not receive it',!(await(await other.ctx.get('/p/'+f.slug)).text()).includes('owner-edit'));
 const landing=(await(await owner.ctx.get('/api/landings/'+f.landing)).json()).landing;
 const preview=await(await owner.ctx.post('/api/landings/'+f.landing+'/render',{headers:owner.H,data:{content:landing.content,slug:landing.slug}})).json();
 check('editor preview does not show it',!preview.html.includes('owner-edit'));
 check('page is never cached by shared caches',(await owner.ctx.get('/p/'+f.slug)).headers()['cache-control']?.includes('no-store'));
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1440,height:900}});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/p/'+f.slug);const edit=page.locator('.owner-edit');await edit.waitFor();const box=await edit.boundingBox();
 check('shortcut floats at the bottom left, away from WhatsApp and share',box.x<60&&box.y>900-110);
 check('shortcut text is readable (white on dark)',await edit.evaluate(e=>getComputedStyle(e).color)==='rgb(255, 255, 255)'&&await edit.locator('span').isVisible());
 await page.waitForTimeout(1200);await page.screenshot({path:'test-results/owner-edit.png'});
 await edit.click();await page.waitForURL('**/panel/landings/'+f.landing);await page.locator('.builder').first().waitFor();
 check('shortcut opens this landing in the editor',page.url().endsWith('/panel/landings/'+f.landing));
 const m=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:390,height:844},isMobile:true,hasTouch:true});const mp=await m.newPage();await mp.goto(base+'/p/'+f.slug);await mp.locator('.owner-edit').waitFor();
 const mb=await mp.locator('.owner-edit').boundingBox();
 check('on mobile it is a round icon button with an accessible name',mb.width<=56&&await mp.locator('.owner-edit').getAttribute('aria-label')==='Editar esta landing en el panel');
 check('mobile has no horizontal scroll',await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await m.close();
 check('no browser errors',errors.length===0);
 console.log(`${checks} owner edit checks passed. Local isolated database only.`);
}finally{await browser?.close();await owner.ctx.dispose();await other.ctx.dispose();await visitor.dispose();}
