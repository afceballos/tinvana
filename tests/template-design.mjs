import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Template page and landing editor: style, typography and share choices save and reload. Local isolated database only.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const owner=await request.newContext({baseURL:base});
try{
 const s=await(await owner.get('/api/auth/session')).json();await owner.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email:f.email,password:f.password}});
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const page=await(await browser.newContext({storageState:await owner.storageState(),viewport:{width:1440,height:1000},reducedMotion:'reduce'})).newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/panel/plantilla');await page.locator('.ts-theme').first().waitFor();
 check('template page offers three styles and four fonts',await page.locator('.ts-theme').count()===3&&await page.locator('.ts-font').count()===4&&await page.locator('.ts-share-option').count()===4);
 await page.locator('.ts-theme',{hasText:'Audaz'}).click();
 check('choosing a style suggests its font',await page.locator('.ts-font',{hasText:'Space Grotesk'}).evaluate(e=>e.classList.contains('is-active')));
 await page.locator('.ts-share-option',{hasText:'Copiar enlace'}).click();await page.getByLabel('WhatsApp opcional').fill('573001234567');
 check('preview follows the style and shows the floating buttons',await page.locator('.ts-frame.ts-look-bold').count()===1&&await page.locator('.ts-floats .ts-wa').count()===1&&await page.locator('.ts-share-float').count()===1);
 await page.screenshot({path:'test-results/template-design.png',fullPage:true});
 await page.getByRole('button',{name:'Guardar plantilla'}).click();await page.locator('.toast-success',{hasText:'Plantilla guardada'}).waitFor();
 await page.reload();await page.locator('.ts-theme').first().waitFor();
 check('choices persist after reload',await page.locator('.ts-theme',{hasText:'Audaz'}).evaluate(e=>e.classList.contains('is-active'))&&await page.locator('.ts-share-option',{hasText:'Copiar enlace'}).locator('input').isChecked());
 await page.goto(base+'/panel/landings/'+f.landing);await page.locator('.builder-page-settings').click();await page.locator('.builder-design').waitFor();
 await page.locator('.builder-design summary').click();await page.locator('.builder-design .ts-theme',{hasText:'Cálido'}).click();
 // Choosing an option must not move the page or the settings panel.
 const scrolls=()=>page.evaluate(()=>{const out=[window.scrollY];let e=document.querySelector('.builder-design');while(e){if(e.scrollHeight>e.clientHeight+2)out.push(e.scrollTop);e=e.parentElement;}return out;});
 for(const target of ['.builder-design .ts-font:has-text("Montserrat")','.builder-design .ts-font:has-text("Space Grotesk")','.builder-design .ts-share-option:has-text("Facebook")','.builder-design .ts-theme:has-text("Audaz")']){await page.locator(target).scrollIntoViewIfNeeded();await page.waitForTimeout(150);const before=await scrolls();await page.locator(target).click();await page.waitForTimeout(250);const after=await scrolls();check('choosing '+target.split('"')[1]+' does not scroll',JSON.stringify(before)===JSON.stringify(after));}
 await page.locator('.builder-design .ts-theme',{hasText:'Cálido'}).click();
 check('landing editor offers the same choices',await page.locator('.builder-design .ts-font',{hasText:'Fraunces'}).evaluate(e=>e.classList.contains('is-active')));
 await page.locator('.builder-design').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/builder-design.png'});
 check('no browser errors',errors.length===0);
 console.log(`${checks} template design checks passed. Local isolated database only.`);
}finally{await browser?.close();await owner.dispose();}
