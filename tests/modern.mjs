// Modern UI layer: theme toggle, dark theme and brand template studio. Uses mocked API responses only; no database or external service.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TINVANA_BASE||'http://127.0.0.1:8081';
const user={id:'u1',email:'demo@tinvana.test',role:'user',first_name:'Ana',last_name:'Demo',avatar:null};
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const puts=[];
 await page.route('**/api/**',route=>{const r=route.request(),p=new URL(r.url()).pathname,j=b=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(b)});
  if(p==='/api/auth/session')return j({user,csrf:'x'});if(p==='/api/template-settings'){if(r.method()==='PUT'){puts.push(JSON.parse(r.postData()));return j({ok:true});}return j({settings:{primaryColor:'#ff6a00',backgroundColor:'#fff8f1',buttonText:'Comprar ahora',whatsapp:''}});}
  if(p==='/api/integrations')return j({integrations:[]});return j({});});
 await page.goto(base+'/panel/plantilla');await page.locator('.ts-preset').first().waitFor();
 const bg=()=>page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
 check('light is the default without a saved preference',await page.evaluate(()=>document.documentElement.dataset.theme)==='light'&&await bg()==='rgb(255, 248, 241)');
 const toggle=page.getByRole('switch');
 await toggle.click();
 check('toggle switches to dark and keeps the dark surface',await page.evaluate(()=>document.documentElement.dataset.theme)==='dark'&&await bg()==='rgb(20, 17, 14)'&&await toggle.getAttribute('aria-checked')==='true');
 check('preference persists across reloads',(await page.reload(),await page.locator('.ts-preset').first().waitFor(),await page.evaluate(()=>document.documentElement.dataset.theme))==='dark');
 check('panel header and cards follow the dark theme',await page.locator('.header').evaluate(el=>getComputedStyle(el).backgroundColor!=='rgb(255, 254, 250)')&&await page.locator('.ts-card').first().evaluate(el=>getComputedStyle(el).backgroundColor==='rgb(29, 25, 21)'));
 check('preview keeps landing colors in dark mode',await page.locator('.ts-copy h3').evaluate(el=>getComputedStyle(el).color==='rgb(30, 30, 30)'));
 await toggle.click();check('toggle returns to light',await page.evaluate(()=>document.documentElement.dataset.theme)==='light');
 // Brand template studio
 check('studio starts clean',await page.locator('.ts-savebar.is-clean').count()===1);
 await page.getByRole('button',{name:'Océano'}).click();await page.waitForFunction(()=>document.querySelector('.ts-hex')?.value.toLowerCase()==='#0b62c4');
 check('preset updates colors and preview',await page.locator('.ts-hex').first().inputValue().then(v=>v.toLowerCase()==='#0b62c4')&&await page.locator('.ts-cta').evaluate(el=>getComputedStyle(el).backgroundColor==='rgb(11, 98, 196)'));
 check('unsaved state is announced',await page.locator('.ts-savebar.is-dirty').count()===1&&/sin guardar/i.test(await page.locator('.ts-savebar [role=status]').innerText()));
 await page.locator('.ts-hex').first().fill('#ffe066');check('weak contrast is flagged',await page.locator('.ts-contrast.is-warn').count()===1);
 await page.getByLabel('Texto del botón').fill('Quiero el mío');await page.getByLabel('WhatsApp opcional').fill('573001234567');
 check('whatsapp preview appears only with a valid number',await page.locator('.ts-wa').count()===1);
 await page.getByRole('button',{name:'Móvil'}).click();check('mobile preview narrows the frame',await page.locator('.ts-frame.ts-mobile').count()===1);
 await page.getByRole('button',{name:'Guardar plantilla',exact:true}).click();await page.locator('.ts-savebar.is-clean').waitFor();
 check('save sends exactly the original four fields',JSON.stringify(Object.keys(puts[0]).sort())===JSON.stringify(['backgroundColor','buttonText','primaryColor','whatsapp'])&&puts[0].buttonText==='Quiero el mío');
 await page.getByRole('button',{name:'Guardar plantilla',exact:true}).click();await page.waitForTimeout(200);check('saving without changes still works',puts.length===2);
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});check('template fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 check('no JavaScript errors',errors.length===0);
 console.log(`${passed} checks passed`);
}finally{await browser.close();}
