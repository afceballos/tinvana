import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));const base='http://127.0.0.1:8081';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Contraseña',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:/Iniciar sesión/}).click();await page.waitForURL('**/panel/catalogo');
 const session=await (await context.request.get(base+'/api/auth/session')).json();const headers={'X-CSRF-Token':session.csrf};
 const original=(await (await context.request.get(base+'/api/landings/'+fixture.landing)).json()).landing;
 await context.request.put(base+'/api/landings/'+fixture.landing,{headers,data:{slug:original.slug,content:{...original.content,images:[]}}});
 await page.goto(base+'/panel/landings/'+fixture.landing);await page.getByRole('button',{name:'Producto, imágenes y página',exact:true}).click();await page.getByRole('button',{name:/Agregar imagen principal/}).waitFor();await page.waitForLoadState('networkidle');
 await mkdir('test-results',{recursive:true});await page.setViewportSize({width:1440,height:1100});await page.locator('.media-manager').screenshot({path:'test-results/gallery-empty.png'});
 const choose=page.waitForEvent('filechooser');await page.getByRole('button',{name:/Agregar imagen principal/}).click();await (await choose).setFiles('.tools/upload-test.png');await page.locator('.media-cover').waitFor();await page.locator('.media-manager .notice').waitFor();assert(await page.locator('.media-count').textContent()==='1 / 30');
 const bytes=await readFile('.tools/upload-test.png');await page.locator('input[aria-label="Archivos de galería"]').setInputFiles([{name:'detalle-a.png',mimeType:'image/png',buffer:bytes},{name:'detalle-b.png',mimeType:'image/png',buffer:bytes}]);await page.waitForFunction(()=>document.querySelector('.media-count')?.textContent==='3 / 30');await page.locator('.media-upload-progress').waitFor({state:'detached'});assert(await page.locator('.media-tile').count()===2);
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByRole('status').filter({hasText:'Borrador guardado.'}).waitFor();
 let stored=(await (await context.request.get(base+'/api/landings/'+fixture.landing)).json()).landing.content.images;assert(stored.length===3&&stored.every(url=>url.endsWith('.webp')));
 await page.getByRole('button',{name:'Mover imagen 1 después',exact:true}).click();await page.getByRole('button',{name:'Usar como principal',exact:true}).first().click();
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.waitForLoadState('networkidle');let reordered=(await (await context.request.get(base+'/api/landings/'+fixture.landing)).json()).landing.content.images;assert.deepEqual(reordered,[stored[2],stored[0],stored[1]]);
 await page.reload();await page.getByRole('button',{name:'Producto, imágenes y página',exact:true}).click();await page.locator('.media-tile').first().waitFor();await page.waitForLoadState('networkidle');assert(await page.locator('.media-cover-image img').getAttribute('src')===stored[2]);
 for(const [name,width,height] of [['desktop',1440,1100],['tablet',768,1024],['mobile',375,812]]){await page.setViewportSize({width,height});if(width<1100){await page.getByRole('tab',{name:'Estructura',exact:true}).click();await page.getByRole('button',{name:'Producto, imágenes y página',exact:true}).click();}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');await page.locator('.media-manager').screenshot({path:`test-results/gallery-${name}.png`});}
 await page.getByRole('button',{name:'Quitar imagen 1 de la galería',exact:true}).click();assert(await page.locator('.media-tile').count()===1);await page.getByRole('button',{name:'Quitar imagen principal',exact:true}).click();assert(await page.locator('.media-count').textContent()==='1 / 30');
 await page.locator('input[aria-label="Archivos de galería"]').setInputFiles({name:'archivo.txt',mimeType:'text/plain',buffer:Buffer.from('invalid image')});await page.locator('.media-manager [role=alert]').waitFor();assert(await page.locator('.media-count').textContent()==='1 / 30');
 assert.deepEqual(errors,[]);console.log('PASS real PNG → WebP uploads, principal/gallery, reorder, promotion, save/reload, removal, invalid file, responsive 1440/768/375; no JS errors.');
}finally{await browser.close();}
