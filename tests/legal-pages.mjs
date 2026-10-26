import {chromium,request} from '@playwright/test';
import assert from 'node:assert/strict';
// Public legal pages (/privacidad, /terminos): server-rendered, no session, linked from login and registration.
const base='http://127.0.0.1:8081';let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const anon=await request.newContext({baseURL:base});
try{
 for(const [path,title,must] of [['/privacidad','Política de privacidad',['Ley 1581 de 2012','Superintendencia de Industria y Comercio','Eliminación de datos','10 días hábiles','15 días hábiles','Meta']],['/terminos','Términos y condiciones',['Ley 1480 de 2011','República de Colombia','Inteligencia artificial','Usos no permitidos']]]){
  const r=await anon.get(path);const html=await r.text();
  check(path+' answers 200 as HTML without JavaScript',r.status()===200&&r.headers()['content-type'].startsWith('text/html')&&html.includes('<h1>'+title)&&!html.includes('<script'));
  check(path+' does not start a session',!r.headers()['set-cookie']);
  check(path+' covers the required topics',must.every(m=>html.includes(m)));
  check(path+' never shows placeholders or secrets',!/\{\{|TODO|XXX|NIT 000|password|token_ciphertext/i.test(html));
 }
 check('POST is refused',(await anon.post('/privacidad')).status()===405);
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 for(const scheme of ['light','dark']){
  const page=await(await browser.newContext({viewport:{width:1440,height:1000},colorScheme:scheme})).newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/privacidad');await page.screenshot({path:`test-results/legal-privacy-${scheme}.png`});
  await page.click('.legal-toc a[href="#derechos"]');await page.waitForTimeout(700);
  check(`table of contents jumps to the section (${scheme})`,await page.evaluate(()=>{const r=document.getElementById('derechos').getBoundingClientRect();return r.top>=0&&r.top<200;}));
  if(scheme==='light'){await page.setViewportSize({width:390,height:844});for(const p of ['/privacidad','/terminos']){await page.goto(base+p);check(p+' fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}await page.screenshot({path:'test-results/legal-terms-mobile.png'});}
 }
 const page=await(await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})).newPage();
 await page.goto(base+'/login');await page.locator('.auth-legal').waitFor();
 check('login links to both legal pages',await page.locator('.auth-legal a[href="/privacidad"]').count()===1&&await page.locator('.auth-legal a[href="/terminos"]').count()===1);
 await page.goto(base+'/registro');await page.locator('.auth-consent').waitFor();
 check('registration states that creating an account accepts both documents',(await page.locator('.auth-consent').innerText()).includes('Términos y condiciones'));
 await page.screenshot({path:'test-results/legal-register.png'});
 await page.locator('.auth-legal a[href="/terminos"]').click();await page.waitForURL('**/terminos');
 check('the link opens the server page',(await page.locator('h1').innerText()).includes('Términos'));
 check('no browser errors',errors.length===0);
 console.log(`${checks} legal page checks passed. Local only.`);
}finally{await browser?.close();await anon.dispose();}
