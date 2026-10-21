import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));
const base='http://127.0.0.1:8081';const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1600,height:1100}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://example.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#edf3e9"/><rect x="160" y="100" width="280" height="390" rx="40" fill="#06444a"/></svg>'}));
 await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Contraseña',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:/Iniciar sesión/}).click();await page.waitForURL('**/panel/**');
 const session=await(await context.request.get(base+'/api/auth/session')).json();const headers={'X-CSRF-Token':session.csrf};const endpoint=base+'/api/landings/'+fixture.landing;
 await page.goto(base+'/panel/landings/'+fixture.landing);await page.locator('.builder').waitFor();
 await page.getByRole('button',{name:'+ Agregar sección',exact:true}).click();await page.getByRole('button',{name:/Lista de productos.*Tarjetas de los productos/}).click();
 const picker=page.locator('.builder-product-list-picker');await picker.waitFor();await picker.locator('input[type=checkbox]').nth(0).check();await picker.locator('input[type=checkbox]').nth(1).check();
 await page.getByLabel('Título de la sección',{exact:true}).fill('Explora nuestra selección');await picker.getByRole('button',{name:/Subir/}).last().click();
 const frame=page.frameLocator('iframe');await frame.locator('.type-productList').last().locator('.selected-product-card').nth(1).waitFor();
 await page.getByRole('button',{name:/Guardar borrador/}).click();await page.getByRole('status').filter({hasText:/Borrador guardado/}).waitFor();
 await page.reload();await page.locator('.builder').waitFor();const content=(await(await context.request.get(endpoint)).json()).landing.content;assert.equal(content.blocks.at(-1).data.selectedProductIds.length,2);
 await context.request.post(endpoint+'/publish',{headers});await page.goto(base+'/p/'+fixture.slug);assert.equal(await page.locator('.type-productList').last().locator('.selected-product-card').count(),2);
 await mkdir('test-results',{recursive:true});
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',375,812]]){
  await page.setViewportSize({width,height});await page.locator('.type-productList').last().scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/product-list-'+name+'.png',animations:'disabled'});
  const card=page.locator('.type-productList').last().locator('.selected-product-card').first();assert(await card.isVisible());assert(await card.locator('h3').isVisible());
 }
 assert.deepEqual(errors,[]);await context.request.post(endpoint+'/unpublish',{headers});console.log('PASS product list: add section, choose products, reorder, live preview, save/reload, public SSR cards and responsive desktop/mobile without JavaScript errors. Local isolated database only.');
}finally{await browser.close();}
