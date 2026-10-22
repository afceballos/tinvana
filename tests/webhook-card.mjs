// "Webhook actual" card: no coloured left edge, status chip, URL well, working actions, dark theme. Mocked API only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TINVANA_BASE||'http://127.0.0.1:8081';
const user={id:'u1',email:'demo@tinvana.test',role:'user',first_name:'Ana',last_name:'Demo',avatar:null};
let settings={configured:true,provider:'ghl',enabled:true,display_url:'https://services.leadconnectorhq.com/hooks/…/webhook-trigger/••••••••'};
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const calls=[];
 await page.route('**/api/**',route=>{const r=route.request(),p=new URL(r.url()).pathname,j=b=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(b)});calls.push(r.method()+' '+p);
  if(p==='/api/auth/session')return j({user,csrf:'x'});
  if(p==='/api/webhook-settings'){if(r.method()==='DELETE'){settings={configured:false,provider:'ghl',enabled:true,display_url:null};}return j({settings});}
  return j({});});
 await page.goto(base+'/panel/webhooks');
 const card=page.locator('.webhook-current');await card.waitFor();
 const style=await card.evaluate(el=>{const s=getComputedStyle(el);return {shadow:s.boxShadow,radius:parseFloat(s.borderTopLeftRadius),left:s.borderLeftWidth,top:s.borderTopWidth};});
 check('no inset left-edge shadow',!/inset/.test(style.shadow));
 check('left border is as thin as the others',style.left===style.top);
 check('card is rounded',style.radius>=18);
 check('provider name is shown',(await card.locator('h3').innerText())==='GoHighLevel');
 check('state chip says active',(await card.locator('.webhook-state').innerText()).trim()==='Activo');
 check('URL sits in its own well',(await card.locator('.webhook-url code').innerText()).includes('leadconnectorhq.com'));
 check('actions keep their names',await card.getByRole('button',{name:'Reemplazar webhook'}).count()===1&&await card.getByRole('button',{name:'Eliminar webhook'}).count()===1);
 await card.screenshot({path:'test-results/webhook-card-light.png'});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 const dark=await card.evaluate(el=>getComputedStyle(el).backgroundImage);check('dark theme restyles the card',dark.includes('gradient')&&!dark.includes('255, 248, 241'));
 check('dark URL well is not white',await card.locator('.webhook-url').evaluate(el=>getComputedStyle(el).backgroundColor)!=='rgb(255, 255, 255)');
 await card.screenshot({path:'test-results/webhook-card-dark.png'});
 await page.evaluate(()=>document.documentElement.removeAttribute('data-theme'));
 settings={...settings,enabled:false};await page.reload();await card.waitFor();
 check('paused webhook shows a paused chip',(await card.locator('.webhook-state').innerText()).trim()==='Pausado'&&await card.locator('.webhook-state').evaluate(el=>el.classList.contains('off')));
 await page.setViewportSize({width:390,height:800});
 check('no horizontal scroll on mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await card.getByRole('button',{name:'Eliminar webhook'}).click();await page.waitForTimeout(500);
 check('delete still calls the API and returns to the setup form',calls.includes('DELETE /api/webhook-settings')&&await page.locator('.webhook-current').count()===0);
 check('no page errors',errors.length===0);
 console.log('OK '+passed+' checks');
}finally{await browser.close();}
