// "Tu tienda" card in the profile: the store subdomain. Mocked API only; no database or external service.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TINVANA_BASE||'http://127.0.0.1:8081';
const user={id:'u1',email:'demo@tinvana.test',role:'user',first_name:'Ana',last_name:'Demo',avatar:null};
const fields={company_name:'',first_name:'Ana',last_name:'Demo',phone:'',country:'',state:'',city:'',address:'',address_details:'',postal_code:'',state_code:'',city_code:''};
let store={subdomain:null,base:'tinbana.com',url:null};
const profile=()=>({id:'u1',email:user.email,username:user.email,fields,avatar:null,countries:['CO'],store});
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const puts=[];
 await page.route('**/api/**',route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname,j=(b,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(b)});
  if(p==='/api/auth/session')return j({user,csrf:'x'});
  if(p.startsWith('/api/geography/'))return j({options:[]});
  if(p==='/api/profile'&&r.method()==='GET')return j({profile:profile()});
  if(p==='/api/profile/store'&&r.method()==='PUT'){const body=JSON.parse(r.postData()||'{}');puts.push(body);
   if(body.subdomain==='ocupado')return j({error:'Ese subdominio ya está en uso. Elige otro nombre.'},409);
   store=body.subdomain?{subdomain:body.subdomain,base:'tinbana.com',url:'https://'+body.subdomain+'.tinbana.com'}:{subdomain:null,base:'tinbana.com',url:null};return j({profile:profile()});}
  return j({});});
 await page.goto(base+'/panel/perfil');
 const card=page.locator('.store-card');await card.waitFor();
 check('the store card is the first block of the profile',await page.locator('.profile-layout > *').first().evaluate(el=>el.classList.contains('store-card')));
 check('the card spans the full width',(await card.boundingBox()).width>800);
 const field=page.getByLabel('Nombre de tu tienda');
 check('base domain is shown after the field',(await page.locator('.store-input span').innerText()).trim()==='.tinbana.com');
 check('save is disabled until something changes',await card.getByRole('button',{name:'Guardar tienda'}).isDisabled());
 await field.fill('Mi Tienda Ñandú! _2');check('typing keeps only letters, numbers and hyphens, no spaces or accents',await field.inputValue()==='mi-tienda-nandu-2');
 await field.fill('---a---b');check('no leading or doubled hyphens',await field.inputValue()==='a-b');
 await field.fill('ab');check('short name is flagged and cannot be saved',(await page.locator('.store-hint.bad').innerText()).includes('3 caracteres')&&await card.getByRole('button',{name:'Guardar tienda'}).isDisabled());
 await field.fill('x'.repeat(60));check('length is capped at 40',(await field.inputValue()).length===40);
 await field.fill('mi-tienda');
 check('preview shows how product links will look',(await page.locator('.store-preview').innerText()).includes('mi-tienda.tinbana.com/p/mi-producto'));
 await page.locator('.store-card').screenshot({path:'test-results/store-card-light.png'});
 await card.getByRole('button',{name:'Guardar tienda'}).click();await page.waitForFunction(()=>document.querySelector('.store-card input')!==null);await page.waitForTimeout(500);
 check('save sends the subdomain to the store endpoint',puts.length===1&&puts[0].subdomain==='mi-tienda'&&Object.keys(puts[0]).length===1);
 check('after saving the card keeps the saved name',await field.inputValue()==='mi-tienda'&&await card.getByRole('button',{name:'Guardar tienda'}).isDisabled());
 await field.fill('otra-tienda');
 check('changing a saved name warns that old links stop working',(await page.locator('.store-warning').innerText()).includes('mi-tienda.tinbana.com'));
 await field.fill('ocupado');await card.getByRole('button',{name:'Guardar tienda'}).click();await page.waitForTimeout(500);
 check('a taken name keeps the card editable',await field.inputValue()==='ocupado'&&await field.isEnabled());
 await field.fill('');
 check('empty offers to remove the subdomain',await card.getByRole('button',{name:'Quitar subdominio'}).isEnabled());
 await card.getByRole('button',{name:'Quitar subdominio'}).click();await page.waitForTimeout(500);
 check('removing sends null',puts[puts.length-1].subdomain===null&&await field.inputValue()==='');
 // The personal-data form is independent of the store card.
 check('profile form is still there',await page.getByRole('button',{name:'Guardar cambios'}).count()===1);
 // Without a public domain (local/IP) the card explains it.
 store={subdomain:null,base:null,url:null};await page.reload();await page.locator('.store-card').waitFor();
 check('without a public domain there is no field',await page.getByLabel('Nombre de tu tienda').count()===0&&(await page.locator('.store-card').innerText()).includes('dominio público'));
 store={subdomain:'mi-tienda',base:'tinbana.com',url:'https://mi-tienda.tinbana.com'};await page.reload();await page.locator('.store-card').waitFor();
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 check('dark theme keeps the card readable',await page.locator('.store-card').evaluate(el=>getComputedStyle(el).backgroundColor)!=='rgb(255, 255, 255)');
 await page.screenshot({path:'test-results/store-card-dark.png'});
 await page.setViewportSize({width:390,height:800});await page.reload();await page.locator('.store-card').waitFor();
 check('no horizontal scroll on mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 check('no page errors',errors.length===0);
 console.log('OK '+passed+' checks');
}finally{await browser.close();}
