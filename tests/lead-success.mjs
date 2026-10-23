import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Confirmation popup after a successful landing form submit. The lead endpoint is mocked: nothing is stored.
const fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));const base='http://127.0.0.1:8081';let checks=0;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const setup=await browser.newContext();await setup.route('https://example.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
 const login=await setup.newPage();await login.goto(base+'/login');await login.getByLabel('Email',{exact:true}).fill(fixture.email);await login.getByLabel('Contraseña',{exact:true}).fill(fixture.password);await login.getByRole('button',{name:/Iniciar sesión/}).click();await login.waitForURL('**/panel/**');
 const s=await(await setup.request.get(base+'/api/auth/session')).json();await setup.request.post(base+'/api/landings/'+fixture.landing+'/publish',{headers:{'X-CSRF-Token':s.csrf}});await setup.close();
 async function submit(options){
  const context=await browser.newContext(options);await context.route('https://example.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/lead',r=>r.fulfill({status:202,json:{saved:true,message:'Tu consulta fue guardada.'}}));
  await page.goto(base+'/p/'+fixture.slug);const buy=page.locator('[data-buy]').first();await buy.click();const m=page.locator('#purchase-dialog');await m.locator('.iti').waitFor();
  await m.locator('[name=first_name]').fill('Ana');await m.locator('[name=last_name]').fill('Pérez');await m.locator('[name=email]').fill('ana@example.test');await m.locator('[name=phone]').fill('3001234567');
  await m.locator('[name=department_code]').selectOption('05');await m.locator('[name=city_code]').selectOption('05001');await m.locator('[name=address]').fill('Calle 10 # 20-30');
  await m.getByRole('button',{name:/Enviar solicitud/}).click();return {page,context,errors,buy};
 }
 let {page,context,errors,buy}=await submit({viewport:{width:1440,height:900}});
 const popup=page.getByRole('dialog',{name:'¡Listo, la recibimos!'});await popup.waitFor();
 check('purchase form closes on success',!(await page.locator('#purchase-dialog').evaluate(d=>d.open)));
 check('confirmation is a labelled modal dialog',await popup.evaluate(d=>d.open&&d.matches(':modal')));
 check('focus moves to the confirmation button',await page.evaluate(()=>document.activeElement?.classList.contains('ls-button')));
 check('origami bird has all ten folds',await popup.locator('.ls-fold').count()===10);
 await page.waitForTimeout(250);await page.screenshot({path:'test-results/lead-success-animating.png'});
 await page.waitForTimeout(1800);await page.screenshot({path:'test-results/lead-success-desktop.png'});
 check('folds end fully visible',await popup.locator('.ls-fold').evaluateAll(els=>els.every(e=>getComputedStyle(e).opacity==='1')));
 await page.keyboard.press('Escape');await popup.waitFor({state:'detached'});
 check('Escape closes and returns focus to the buy button',await buy.evaluate(b=>document.activeElement===b));
 check('page scroll restored',await page.evaluate(()=>document.body.style.overflow===''));
 check('no runtime errors desktop',errors.length===0);await context.close();
 ({page,context,errors}=await submit({viewport:{width:390,height:844},isMobile:true,hasTouch:true}));
 const mobile=page.getByRole('dialog',{name:'¡Listo, la recibimos!'});await mobile.waitFor();await page.waitForTimeout(2000);
 check('confirmation fits mobile',await mobile.evaluate(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
 await page.screenshot({path:'test-results/lead-success-mobile.png'});
 await mobile.getByRole('button',{name:'Entendido'}).click();await mobile.waitFor({state:'detached'});check('button closes the confirmation',true);check('no runtime errors mobile',errors.length===0);await context.close();
 ({page,context,errors}=await submit({viewport:{width:1024,height:800},reducedMotion:'reduce'}));
 const still=page.getByRole('dialog',{name:'¡Listo, la recibimos!'});await still.waitFor();
 check('reduced motion shows the final state without animation',await still.locator('.ls-fold').evaluateAll(els=>els.every(e=>getComputedStyle(e).opacity==='1'))&&await still.locator('.ls-confetti i').count()===0);
 await context.close();
 console.log(checks+' lead confirmation checks passed. Lead endpoint mocked; nothing stored.');
}finally{await browser.close();}
