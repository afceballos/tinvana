// Alerts and notices: colour by meaning (success green, error red, warning amber, info blue), no coloured edge, dark theme. Mocked API only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TINVANA_BASE||'http://127.0.0.1:8081';
const user={id:'u1',email:'demo@tinvana.test',role:'user',first_name:'Ana',last_name:'Demo',avatar:null};
const fields={company_name:'',first_name:'Ana',last_name:'Demo',phone:'',country:'',state:'',city:'',address:'',address_details:'',postal_code:'',state_code:'',city_code:''};
let store={subdomain:'mi-tienda',base:'tinbana.com',url:'https://mi-tienda.tinbana.com'};
const profile=()=>({id:'u1',email:user.email,username:user.email,fields,avatar:null,countries:['CO'],store});
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname,j=(b,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(b)});
  if(p==='/api/auth/session')return j({user,csrf:'x'});if(p.startsWith('/api/geography/'))return j({options:[]});
  if(p==='/api/profile'&&r.method()==='GET')return j({profile:profile()});
  if(p==='/api/profile/store'&&r.method()==='PUT'){const body=JSON.parse(r.postData()||'{}');if(body.subdomain==='ocupado')return j({error:'Ese subdominio ya está en uso. Elige otro nombre.'},409);store={subdomain:body.subdomain,base:'tinbana.com',url:'https://'+body.subdomain+'.tinbana.com'};return j({profile:profile()});}
  return j({});});
 const tone=el=>el.evaluate(n=>{const s=getComputedStyle(n);return {ic:s.getPropertyValue('--t-ic').trim(),bg:s.getPropertyValue('--t-bg').trim(),left:s.borderLeftWidth,top:s.borderTopWidth,before:getComputedStyle(n,'::before').content,shadow:s.boxShadow};});
 await page.goto(base+'/panel/perfil');const field=page.getByLabel('Nombre de tu tienda');await field.waitFor();
 // Success toast (green)
 await field.fill('mi-tienda-2');await page.locator('.store-card').getByRole('button',{name:'Guardar tienda'}).click();
 const ok=page.locator('.toast-success');await ok.waitFor();const t1=await tone(ok);
 check('success toast is green',t1.ic==='#16a34a'&&t1.bg==='#ecfdf3');
 check('success toast has no coloured edge (no inset shadow, uniform border, no ::before bar)',!/inset/.test(t1.shadow)&&t1.left===t1.top&&(await ok.evaluate(n=>getComputedStyle(n,'::before').content))==='none');
 check('success icon chip is solid green',await ok.locator('.toast-symbol').evaluate(n=>getComputedStyle(n).backgroundColor)==='rgb(22, 163, 74)');
 await page.screenshot({path:'test-results/alerts-success.png',clip:{x:980,y:0,width:460,height:200}});
 await ok.getByRole('button',{name:/Cerrar notificación/}).click();await ok.waitFor({state:'detached'});
 // Error toast (red)
 await field.fill('ocupado');await page.locator('.store-card').getByRole('button',{name:'Guardar tienda'}).click();
 const bad=page.locator('.toast-error');await bad.waitFor();const t2=await tone(bad);
 check('error toast is red',t2.ic==='#dc2626'&&t2.bg==='#fef2f2');
 check('error toast title uses the red tone',await bad.locator('strong').evaluate(n=>getComputedStyle(n).color)==='rgb(153, 27, 27)');
 check('error toast keeps role alert',await bad.getAttribute('role')==='alert');
 check('error and success look different',t1.ic!==t2.ic&&t1.bg!==t2.bg);
 await page.screenshot({path:'test-results/alerts-error.png',clip:{x:980,y:0,width:460,height:200}});
 // Inline notices by meaning (injected so every class is covered without extra flows).
 await page.evaluate(()=>{const host=document.createElement('div');host.id='showcase';host.style.cssText='display:grid;gap:12px;padding:16px;max-width:640px';
  host.innerHTML='<p class="notice">Información: tu borrador no se ha publicado.</p><p class="builder-live-notice">Estás editando un borrador. <a href="#">La página publicada</a> cambia al publicar.</p><p class="error">Error: no se pudo guardar.</p><p class="lead-last-error">Último error: el webhook respondió 500.</p><p class="store-warning">Advertencia: si cambias el nombre, los enlaces anteriores dejan de funcionar.</p>';document.querySelector('main, .panel-main, body').prepend(host);});
 const sc=page.locator('#showcase');
 const kinds={info:await tone(sc.locator('.notice')),live:await tone(sc.locator('.builder-live-notice')),err:await tone(sc.locator('.error')),last:await tone(sc.locator('.lead-last-error')),warn:await tone(sc.locator('.store-warning'))};
 check('notice and live notice are blue',kinds.info.ic==='#2563eb'&&kinds.live.ic==='#2563eb');
 check('error and last error are red',kinds.err.ic==='#dc2626'&&kinds.last.ic==='#dc2626');
 check('warning is amber',kinds.warn.ic==='#d97706');
 check('every inline message has an icon and a uniform border',Object.values(kinds).every(k=>k.before!=='none'&&k.left===k.top&&!/inset/.test(k.shadow)));
 const pad=await sc.locator('.notice').evaluate(n=>parseFloat(getComputedStyle(n).paddingLeft));check('text clears the icon',pad>=40);
 check('link inside a notice stays readable',await sc.locator('.builder-live-notice a').evaluate(n=>getComputedStyle(n).textDecorationLine==='underline'));
 await sc.screenshot({path:'test-results/alerts-inline-light.png'});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 const dk=await sc.locator('.error').evaluate(n=>{const s=getComputedStyle(n);return {bg:s.backgroundColor,color:s.color};});
 check('dark error is a deep red, not the neutral surface',dk.bg==='rgb(46, 20, 20)'&&dk.color==='rgb(252, 165, 165)');
 check('dark notice is deep blue',await sc.locator('.notice').evaluate(n=>getComputedStyle(n).backgroundColor)==='rgb(15, 30, 58)');
 await sc.screenshot({path:'test-results/alerts-inline-dark.png'});
 await page.screenshot({path:'test-results/alerts-error-dark.png',clip:{x:980,y:0,width:460,height:200}});
 check('dark error toast is tinted',await bad.evaluate(n=>getComputedStyle(n).borderTopColor)==='rgb(107, 35, 35)');
 await page.setViewportSize({width:390,height:800});
 check('no horizontal scroll on mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 check('no page errors',errors.length===0);
 console.log('OK '+passed+' checks');
}finally{await browser.close();}
