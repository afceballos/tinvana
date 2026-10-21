import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const run=promisify(execFile),base='http://127.0.0.1:8081',php='.tools/php/php.exe';
const fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let passed=0;
const check=(name,value)=>{assert(value,name);passed++;console.log('PASS '+name);};
class Client{
 cookie='';csrf='';
 async request(path,method='GET',body){const multipart=body instanceof FormData;const r=await fetch(base+path,{method,headers:{Cookie:this.cookie,...(method!=='GET'?{'X-CSRF-Token':this.csrf}:{}),...(!multipart&&body?{'Content-Type':'application/json'}:{})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))this.cookie=r.headers.get('set-cookie').split(';')[0];return r;}
 async login(email){this.csrf=(await(await this.request('/api/auth/session')).json()).csrf;const r=await(await this.request('/api/auth/login','POST',{email,password:fixture.password})).json();this.csrf=r.csrf;}
}
await run(php,['backend/tests/image-fixture.php']);const bytes=await readFile('.tools/upload-test.png');const prepared=JSON.parse((await run(php,['backend/tests/media-library-helper.php','prepare'])).stdout);
const owner=new Client(),other=new Client(),visitor=new Client();await owner.login(fixture.email);await other.login(fixture.otherEmail);
const upload=async(path='/api/media',client=owner)=>{const form=new FormData();form.append('image',new Blob([bytes],{type:'image/png'}),'Foto producto.png');return client.request(path,'POST',form);};
check('anonymous library refused',(await visitor.request('/api/media')).status===401);
const uploaded=await upload();check('standalone upload works',uploaded.status===200);const asset=(await uploaded.json()).image;
check('upload returns filename and optimized dimensions',asset.name==='Foto producto.png'&&asset.bytes<=409600&&asset.width===1600);
const location=JSON.parse((await run(php,['backend/tests/media-library-helper.php','path',asset.id])).stdout);check('files stored by owner/year/month',location.exists&&location.path.startsWith(fixture.owner+'/'+new Date().toISOString().slice(0,7).replace('-','/')+'/'));
const list=await(await owner.request('/api/media')).json();check('library includes standalone and legacy images',list.assets.some(a=>a.id===asset.id)&&list.assets.some(a=>a.id===prepared.legacy));check('months include old files',list.months.some(m=>m.month==='2025-01'));
check('other account sees no files',(await(await other.request('/api/media')).json()).assets.length===0);
check('month filter works',(await(await owner.request('/api/media?month=2025-01')).json()).assets.every(a=>a.id===prepared.legacy));
check('search matches original filename',(await(await owner.request('/api/media?search=Foto')).json()).assets.some(a=>a.id===asset.id));
check('search treats wildcard literally',(await(await owner.request('/api/media?search=%25')).json()).assets.length===0);
check('invalid month refused',(await owner.request('/api/media?month=2025-99')).status===422);
const path=new URL(asset.url).pathname;
check('standalone file private',(await visitor.request(path)).status===404&&(await other.request(path)).status===404);
check('owner can download file',(await owner.request(asset.download_url)).headers.get('content-disposition').includes('attachment'));
check('download isolated',(await other.request(asset.download_url)).status===404&&(await visitor.request(asset.download_url)).status===401);
check('legacy storage remains readable',(await owner.request('/media/'+prepared.legacy+'.webp')).headers.get('content-type')==='image/webp');
const legacyUpload=await upload('/api/landings/'+fixture.landing+'/images');check('existing landing upload works',legacyUpload.status===200);const fromLanding=(await legacyUpload.json()).image;
let landing=(await(await owner.request('/api/landings/'+prepared.second)).json()).landing;landing.content.images=[asset.url,fromLanding.url];
check('reuse images across own landings',(await owner.request('/api/landings/'+prepared.second,'PUT',{slug:landing.slug,content:landing.content})).status===200);
const otherAsset=(await(await upload('/api/media',other)).json()).image;
check('cross-account image reuse refused',(await owner.request('/api/landings/'+prepared.second,'PUT',{slug:landing.slug,content:{...landing.content,images:[otherAsset.url]}})).status===422);
const preview=(await(await owner.request('/api/landings/'+prepared.second+'/preview-link','POST',{})).json()).url;
check('reused images work in signed preview',(await visitor.request(path+'?landing='+prepared.second+'&'+preview.split('?')[1])).headers.get('content-type')==='image/webp');
check('cannot forge preview owner scope',(await visitor.request(new URL(otherAsset.url).pathname+'?landing='+prepared.second+'&'+preview.split('?')[1])).status===404);
check('publish reused images',(await owner.request('/api/landings/'+prepared.second+'/publish','POST',{})).status===200);
check('reused media is public when actually published',(await visitor.request(path)).status===200&&(await visitor.request(new URL(fromLanding.url).pathname)).status===200);
await owner.request('/api/landings/'+prepared.second+'/unpublish','POST',{});
check('unpublished images become private again',(await visitor.request(path)).status===404);
check('CSRF enforced',(await upload('/api/media',visitor)).status===419);
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({reducedMotion:'reduce'});const [name,value]=owner.cookie.split('=');await context.addCookies([{name,value,url:base}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.goto(base+'/panel/archivos');await page.locator('.asset-card').first().waitFor();check('responsive media library '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/media-library-${width}.png`,fullPage:true});}
 await page.goto(base+'/panel/landings/'+prepared.second);await page.getByRole('tab',{name:'Propiedades',exact:true}).click();await page.locator('.builder-properties-tabs button').nth(1).click();await page.getByRole('button',{name:'Elegir de mis archivos'}).first().click();await page.locator('.asset-picker[open] .asset-choice').first().waitFor();check('editor media picker opens',await page.getByRole('heading',{name:'Elige una imagen'}).isVisible());await page.keyboard.press('Escape');check('Escape closes picker',await page.locator('.asset-picker').count()===0);await page.getByRole('button',{name:'Elegir de mis archivos'}).first().click();const chosen=await page.locator('.asset-picker .asset-choice img').first().getAttribute('src');const choice=page.locator('.asset-choice').first();await choice.click();check('click marks image without closing',await choice.getAttribute('aria-pressed')==='true'&&await page.locator('.asset-picker').count()===1);await page.screenshot({path:'test-results/media-selection-mobile.png'});await page.getByRole('button',{name:'Listo',exact:true}).click();check('Done closes picker',await page.locator('.asset-picker').count()===0);const saved=page.waitForResponse(r=>r.url().endsWith('/api/landings/'+prepared.second)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();check('editor save accepted',(await saved).status()===200);check('selected library image saved as header logo',(await(await owner.request('/api/landings/'+prepared.second)).json()).landing.content.header.logo===chosen);await page.locator('.media-manager').getByRole('button',{name:'Elegir de mis archivos'}).click();const galleryChoice=page.locator('.asset-choice').last();const galleryName=await galleryChoice.getAttribute('aria-label');await galleryChoice.click();check('gallery card toggles selection',await galleryChoice.getAttribute('aria-pressed')==='true');await galleryChoice.press('Space');check('keyboard unchecks gallery card',await galleryChoice.getAttribute('aria-pressed')==='false');await galleryChoice.press('Enter');check('keyboard selects gallery card',await galleryChoice.getAttribute('aria-pressed')==='true');await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/media-selection-desktop.png'});check('picker fits desktop',await page.locator('.asset-picker').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.getByRole('button',{name:'Listo',exact:true}).click();await page.locator('.media-manager').getByRole('button',{name:'Elegir de mis archivos'}).click();check('reopening preserves selected cards',await page.getByRole('button',{name:galleryName,exact:true}).getAttribute('aria-pressed')==='true');await page.keyboard.press('Escape');check('no JavaScript errors',errors.length===0);
}finally{await browser?.close();}
console.log(`${passed} media-library checks passed. Local test users only.`);
