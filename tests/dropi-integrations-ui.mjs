// Dropi integrations page uses the GHL connection layout. Mocked API only: no token or Dropi request.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TINVANA_BASE||'http://127.0.0.1:8081';
const user={id:'u1',email:'demo@tinvana.test',role:'user',first_name:'Ana',last_name:'Demo',avatar:null};
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let integrations=[];const calls=[];
 await page.route('**/api/**',route=>{const r=route.request(),p=new URL(r.url()).pathname,j=(b,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(b)});calls.push(r.method()+' '+p);
  if(p==='/api/auth/session')return j({user,csrf:'x'});
  if(p==='/api/integrations'&&r.method()==='GET')return j({integrations});
  if(p==='/api/integrations'&&r.method()==='POST'){const b=JSON.parse(r.postData()||'{}');integrations=[{id:'i1',name:b.name,configured:true}];return j({id:'i1'});}
  if(p==='/api/integrations/i1/test')return j({message:'Conexión con Dropi verificada.'});
  if(p==='/api/integrations/i1'&&r.method()==='PATCH')return j({ok:true});
  return j({});});
 await page.goto(base+'/panel/integraciones');await page.getByRole('heading',{name:'Integraciones Dropi',level:1}).waitFor();await page.getByRole('heading',{name:'Conectar Dropi'}).waitFor();
 check('empty state shows the connect form',await page.getByRole('heading',{name:'Conectar Dropi'}).isVisible()&&await page.getByLabel('Token de integración Dropi').getAttribute('type')==='password');
 check('usage table explains server-side token use',await page.locator('.payload-table tbody tr').count()===5);
 await page.screenshot({path:'test-results/dropi-integrations-empty.png',fullPage:true});
 await page.getByLabel('Nombre de la integración').fill('Mi tienda');await page.getByLabel('Token de integración Dropi').fill('secret-token-value');await page.getByRole('button',{name:'Guardar integración'}).click();
 const card=page.locator('.webhook-current');await card.waitFor();
 check('configured integration uses the GHL card',await card.locator('.webhook-logo').count()===1&&await card.locator('.webhook-state.on').innerText()==='Configurada'&&await card.getByRole('heading',{name:'Mi tienda'}).isVisible());
 check('token is never rendered',!(await page.content()).includes('secret-token-value'));
 check('add form collapses behind a button',await page.getByRole('button',{name:'Añadir otra integración'}).isVisible()&&await page.getByRole('heading',{name:'Conectar Dropi'}).count()===0);
 await card.getByRole('button',{name:'Probar conexión'}).click();await page.locator('.toast-success',{hasText:'Conexión con Dropi verificada.'}).waitFor();check('connection test reports the server message',calls.includes('POST /api/integrations/i1/test'));
 await card.getByRole('button',{name:'Reemplazar token'}).click();check('replace form opens inside the card',await card.getByLabel('Nuevo token').isVisible());
 await page.screenshot({path:'test-results/dropi-integrations-card.png',fullPage:true});
 await card.getByLabel('Nuevo token').fill('new-secret');await card.getByRole('button',{name:'Guardar token'}).click();await page.waitForFunction(()=>!document.querySelector('.webhook-current input[name=token]'));
 check('replace sends PATCH and closes the form',calls.includes('PATCH /api/integrations/i1'));
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await page.screenshot({path:'test-results/dropi-integrations-dark.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});check('fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/dropi-integrations-mobile.png',fullPage:true});
 check('no page errors',errors.length===0);
 console.log('OK '+passed+' checks');
}finally{await browser.close();}
