import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// The phone country <select> is hidden behind the flag picker. An invalid hidden control blocks the submit
// silently ("not focusable"), so it must either self-correct or report on the visible phone field.
const fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));const base='http://127.0.0.1:8081';let checks=0;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext();await context.route('https://example.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
 const page=await context.newPage();const logs=[];page.on('console',m=>logs.push(m.text()));
 await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Contraseña',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:/Iniciar sesión/}).click();await page.waitForURL('**/panel/**');
 const s=await(await context.request.get(base+'/api/auth/session')).json();await context.request.post(base+'/api/landings/'+fixture.landing+'/publish',{headers:{'X-CSRF-Token':s.csrf}});
 // Mock the lead endpoint: this suite checks client validation only and stores nothing.
 let posts=0;await page.route('**/lead',r=>{posts++;r.fulfill({status:202,json:{message:'Solicitud recibida.'}});});
 async function filled(){await page.goto(base+'/p/'+fixture.slug);await page.locator('[data-buy]').first().click();const m=page.locator('#purchase-dialog');await m.locator('.iti').waitFor();
  await m.locator('[name=first_name]').fill('Ana');await m.locator('[name=last_name]').fill('Pérez');await m.locator('[name=email]').fill('ana@example.test');await m.locator('[name=phone]').fill('3001234567');
  await m.locator('[name=department_code]').selectOption('05');await m.locator('[name=city_code]').selectOption('05001');await m.locator('[name=address]').fill('Calle 10 # 20-30');return m;}
 let m=await filled();check('hidden country mirrors the flag picker',await m.locator('[name=phone_country]').inputValue()==='CO');
 await m.locator('[name=phone_country]').evaluate(e=>{e.value='';});await m.getByRole('button',{name:/Enviar solicitud/}).click();await page.waitForTimeout(800);
 check('emptied hidden country self-corrects and submits',posts===1&&await m.locator('[name=phone_country]').inputValue()==='CO');
 m=await filled();posts=0;await m.locator('[name=phone]').fill('+999 1234567');await m.locator('[name=phone]').dispatchEvent('input');
 check('unknown dial code leaves no country',await m.locator('[name=phone_country]').inputValue()==='');
 await m.getByRole('button',{name:/Enviar solicitud/}).click();await page.waitForTimeout(800);
 const state=await page.evaluate(()=>({active:document.activeElement?.getAttribute('name'),message:document.querySelector('#purchase-dialog [name=phone]').validationMessage}));
 check('missing country reported on the visible phone field',posts===0&&state.active==='phone'&&state.message==='Selecciona el país de tu teléfono.');
 await m.locator('.iti__selected-country').click();await m.locator('.iti__search-input').fill('Colombia');await m.locator('.iti__country[data-iso2="co"]').click();await m.locator('[name=phone]').fill('3001234567');
 check('choosing a country clears the message',await m.locator('[name=phone]').evaluate(e=>e.validationMessage==='')&&await m.locator('[name=phone_country]').inputValue()==='CO');
 check('no silent not-focusable block',logs.every(l=>!/not focusable/.test(l)));
 console.log(checks+' lead phone country checks passed. Lead endpoint mocked; nothing stored.');
}finally{await browser.close();}
