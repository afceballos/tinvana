import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));
const base='http://127.0.0.1:8081';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext();
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('test-results',{recursive:true});
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#f4f7f3"/><rect x="100" y="90" width="200" height="230" rx="40" fill="#193e35"/><path d="M145 160h110M145 200h110M145 240h70" stroke="#e7efc7" stroke-width="12" stroke-linecap="round"/></svg>');
const product={id:'9001',name:'Producto visual de prueba',description:'Contenido aislado para comprobar el diseño y la navegación del catálogo.',price:125000,suggestedPrice:160000,sku:'QA-01',images:[image,image+' '],categories:[{id:'7',name:'Hogar'}],stock:12,warehouses:[],supplier:'Proveedor de prueba',attributes:[],variations:[]};
let queries=[];
await page.route('https://example.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#eef3ed"/><rect x="100" y="80" width="200" height="240" rx="30" fill="#193e35"/></svg>'}));
await page.route('**/api/integrations/*/categories',route=>route.fulfill({json:{objects:[{id:7,name:'Hogar'}]}}));
await page.route('**/api/integrations/*/products?*',route=>{const u=new URL(route.request().url());queries.push(Object.fromEntries(u.searchParams));return route.fulfill({json:{products:Array.from({length:6},(_,i)=>({...product,id:String(9001+i),name:['Organizador modular','Lámpara de escritorio','Botella térmica','Bolso de viaje','Soporte ajustable','Set de almacenamiento'][i]})),hasNext:true}});});
await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Contraseña',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:/Iniciar sesión/}).click();await page.getByRole('heading',{name:'Una selección con tu sello propio.'}).waitFor();
for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',375,812],['landscape',812,375]]){
 await page.setViewportSize({width,height});await page.locator('.card').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.card')].every(e=>getComputedStyle(e).opacity==='1'));await page.screenshot({path:`test-results/catalog-${name}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow ${name}`);
}
await page.setViewportSize({width:1440,height:1000});
await Promise.all([page.waitForResponse(r=>r.url().includes('/products?')&&r.url().includes('pageSize=50')),page.getByRole('combobox',{name:/^Por página/}).selectOption('50')]);
await Promise.all([page.waitForResponse(r=>r.url().includes('/products?')&&r.url().includes('category=7')),page.getByRole('combobox',{name:/^Categoría/}).selectOption('7')]);
await Promise.all([page.waitForResponse(r=>r.url().includes('search=organizador')),page.getByLabel('Buscar productos',{exact:true}).fill('organizador')]);
assert(queries.at(-1).page==='1'&&queries.at(-1).pageSize==='50'&&queries.at(-1).category==='7');
await Promise.all([page.waitForResponse(r=>r.url().includes('/products?')&&!new URL(r.url()).searchParams.get('search')),page.getByRole('button',{name:'Limpiar filtros ↺'}).click()]);
const details=page.getByRole('button',{name:'Ver detalles de Organizador modular'});await details.click();await page.getByRole('dialog').waitFor();await page.waitForFunction(()=>getComputedStyle(document.querySelector('dialog')).opacity==='1');assert(await page.getByRole('dialog').getAttribute('aria-labelledby'));assert(await page.evaluate(()=>document.body.style.overflow==='hidden'));
await page.screenshot({path:'test-results/modal-desktop.png',fullPage:true});await page.setViewportSize({width:375,height:812});await page.screenshot({path:'test-results/modal-mobile.png',fullPage:true});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert(await details.evaluate(e=>e===document.activeElement),'modal restores focus');assert(await page.evaluate(()=>document.body.style.overflow!== 'hidden'));
await page.getByRole('button',{name:'Abrir navegación'}).click();await page.getByRole('link',{name:'Mis productos',exact:true}).click();await page.getByRole('heading',{name:'Mis productos',exact:true}).waitFor();assert(!(await page.locator('.app-shell').getAttribute('class')).includes('mobile-open'));
for(const [path,name] of [['productos','products'],['integraciones','integrations'],['webhooks','webhooks'],['plantilla','template'],['leads','leads'],['landings/'+fixture.landing,'editor']]){
 await page.goto(base+'/panel/'+path);await page.locator(path.startsWith('landings/')?'.builder':'.section-heading').waitFor();await page.waitForLoadState('networkidle');for(const [device,width,height] of [['desktop',1440,1000],['mobile',375,812]]){await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${device} overflow`);await page.screenshot({path:`test-results/${name}-${device}.png`,fullPage:true});}
}
await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'/panel/catalogo');await page.locator('.card').first().waitFor();assert(await page.locator('.card').first().isVisible());await page.screenshot({path:'test-results/reduced-motion.png',fullPage:true});
const session=await (await context.request.get(base+'/api/auth/session')).json();const headers={'X-CSRF-Token':session.csrf};
await context.request.post(base+'/api/landings/'+fixture.landing+'/publish',{headers});
try{await page.goto(base+'/p/'+fixture.slug);await page.waitForLoadState('networkidle');for(const [device,width,height] of [['desktop',1440,1000],['mobile',375,812]]){await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/landing-${device}.png`,fullPage:true});}
let sends=0;await page.route('**/p/*/lead',async route=>{sends++;const payload=route.request().postDataJSON();assert(payload.csrf&&payload.idempotency_key&&payload.first_name);await route.fulfill({json:{message:'Tu consulta fue recibida.'}});});
await page.locator('[data-buy]').first().click();await page.locator('#purchase-dialog[open]').waitFor();await page.getByLabel('Nombre',{exact:true}).fill('Prueba');await page.getByLabel('Apellido',{exact:true}).fill('Visual');await page.getByLabel('Email',{exact:true}).fill('visual@example.test');await page.getByLabel('Teléfono',{exact:true}).fill('3001234567');await page.locator('#lead-form button[type=submit]').click();await page.locator('#lead-status[data-state=success]').waitFor();assert(sends===1);assert(await page.locator('#lead-form button').isDisabled());}
finally{await context.request.post(base+'/api/landings/'+fixture.landing+'/unpublish',{headers});}
assert.deepEqual(errors,[]);console.log('PASS visual QA: 4 catalog viewports, 6 secondary views, filters, pagination, modal Escape/focus, mobile navigation, reduced motion; no JS errors. Catalog responses mocked exclusively in browser tests.');await browser.close();
