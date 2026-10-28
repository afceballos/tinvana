import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Variants on landings: «Actualizar desde Dropi» brings them (catalog simulator, shape of the Dropi probe of 2026-10-28),
// the editor sets price, photo and visibility, the public form asks for them in the three styles, and the order arrives
// with the exact variant. Ports can be moved with TEST_BASE_URL, DROPI_CATALOG_PORT and DROPI_QUOTE_PORT. Isolated data only.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const orders=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
const IMG='https://example.test/';
const variation=(id,color,size,stock,price='23000.00')=>({id,sku:'-'+id,sale_price:price,suggested_price:'50000.00',deleted_at:null,stock:null,
 attribute_values:[{id:1,value:color,attribute_id:7,attribute_name:'COLOR'},{id:2,value:size,attribute_id:8,attribute_name:'TALLA'}],
 warehouse_product_variation:[{id:id+1,warehouse_id:3,variation_id:id,stock,warehouse:{id:3,name:'Bodega Cali',city:{name:'Cali',cod_dane:'76001000'}}}]});
let catalog=[variation(501,'NEGRO','S',40),variation(502,'NEGRO','M',35),variation(503,'NEGRO','L',0),variation(504,'BEIGE','S',12),variation(505,'BEIGE','M',9),variation(506,'BEIGE','L',7)];
const product=()=>({id:987654321,name:'Faja moldeadora',type:'VARIABLE',description:'<p>Faja de uso diario.</p>',sale_price:null,suggested_price:null,sku:'FAJA',gallery:[{main:true,url:IMG+'faja.jpg'},{main:false,url:IMG+'faja-2.jpg'}],
 categories:[{name:'Moda',pivot:{category_id:3}}],user:{id:55,store_name:'Proveedor Demo'},warehouse_product:[],attributes:[],variations:catalog});
const dropiCatalog=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({isSuccess:true,status:200,objects:[product()]}));});});
const quotes=[];const quote=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{quotes.push(JSON.parse(raw));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({isSuccess:true,status:200,objects:[{transportadora:'ENVIA',transportadora_id:2,objects:{precioEnvio:11800}}]}));});});
await Promise.all([new Promise(r=>dropiCatalog.listen(Number(process.env.DROPI_CATALOG_PORT||8448),'127.0.0.1',r)),new Promise(r=>quote.listen(Number(process.env.DROPI_QUOTE_PORT||8444),'127.0.0.1',r))]);
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
let owner,other,visitor;
const landing=async()=>(await(await owner.ctx.get('/api/landings/'+f.landing)).json()).landing;
const save=async(patch)=>{const l=await landing();return owner.ctx.put('/api/landings/'+f.landing,{headers:owner.H,data:{slug:l.slug,content:{...l.content,...patch(l.content)}}});};
const publish=()=>owner.ctx.post('/api/landings/'+f.landing+'/publish',{headers:owner.H});
const refresh=()=>owner.ctx.post('/api/products/'+f.product+'/refresh',{headers:owner.H});
const page=async()=>(await(await visitor.get('/p/'+f.slug)).text());
const lead=(token,extra)=>visitor.post('/p/'+f.slug+'/lead',{headers:{'X-CSRF-Token':token},data:{csrf:token,idempotency_key:randomUUID(),first_name:'Ana',last_name:'Variante',email:'variante-'+randomUUID().slice(0,6)+'@example.test',phone:'3001234567',phone_country:'CO',country_code:'CO',department_code:'05',city_code:'05001',address:'Calle 10 # 20-30',quantity:1,website:'',...extra}});
const orderOf=async email=>{const l=(await(await owner.ctx.get('/api/leads')).json()).leads.find(x=>x.email===email);return (await(await owner.ctx.get('/api/orders/'+(await(await owner.ctx.get('/api/orders')).json()).orders.find(o=>o.lead_id===l.id).id)).json());};
try{
 await orders('reset-limits');
 owner=await login(f.email);other=await login(f.otherEmail);visitor=await request.newContext({baseURL:base});
 check('refreshing a product another store owns is refused',(await other.ctx.post('/api/products/'+f.product+'/refresh',{headers:other.H})).status()===404);
 check('«Actualizar desde Dropi» brings the variants to the landing',(await refresh()).ok()&&(await landing()).product_snapshot.variants.length===6);
 let l=await landing();const v=Object.fromEntries(l.product_snapshot.variants.map(x=>[x.label,x]));
 check('variants keep options, Dropi price, stock and the product photo',v['Negro · M'].options[1].value==='M'&&v['Negro · L'].stock===0&&v['Beige · S'].price===23000&&v['Beige · S'].image===IMG+'faja.jpg');
 // Editor choices through the API: own price, photo per color and a hidden variant.
 let r=await save(()=>({publicPrice:59900,commerce:{...l.content.commerce,dropiShipping:true},variants:{items:{502:{price:64900,image:'',hidden:false},504:{price:null,image:IMG+'faja-2.jpg',hidden:false},505:{price:null,image:IMG+'faja-2.jpg',hidden:false},506:{price:null,image:IMG+'faja-2.jpg',hidden:true}}}}));
 check('the editor saves price, photo and visibility per variant',r.ok()&&(await landing()).content.variants.items['502'].price===64900&&(await landing()).content.variants.items['506'].hidden===true);
 check('a variant price must be above zero',(await save(()=>({variants:{items:{502:{price:0,image:'',hidden:false}}}}))).status()===422);
 check('variant photos must be web addresses',(await save(()=>({variants:{items:{502:{price:null,image:'javascript:alert(1)',hidden:false}}}}))).status()===422);
 check('the landing publishes with variants',(await publish()).ok());await orders('shipping-setup','on');
 let html=await page();
 check('the purchase form asks for color and size',html.includes('data-variant-picker')&&/<legend><span>Color<\/span>/.test(html)&&/<legend><span>Talla<\/span>/.test(html)&&html.includes('value="Negro"')&&html.includes('value="Beige"'));
 check('a hidden variant is not offered',!JSON.parse(html.match(/<script type="application\/json" data-vp-data>(.*?)<\/script>/s)[1]).some(x=>x.id==='506'));
 const token=html.match(/name="csrf" value="([^"]+)"/)[1];
 // Server rules
 r=await lead(token,{});check('an order without a variant is refused with a clear message',r.status()===422&&/Elige color y talla/.test((await r.json()).error));
 check('a hidden variant cannot be ordered',(await lead(token,{variant_id:'506'})).status()===422);
 r=await lead(token,{variant_id:'503'});check('a sold-out variant cannot be ordered',r.status()===422&&/agotada/.test((await r.json()).error));
 check('another product\'s variant id is refused',(await lead(token,{variant_id:'999'})).status()===422);
 let email='variante-a@example.test';r=await lead(token,{variant_id:'502',email});
 let d=await orderOf(email);
 check('the order arrives with the chosen variant and its own price',r.status()===202&&d.order.variant_data.id==='502'&&d.order.variant_data.label==='Negro · M'&&d.order.unit_price==='64900.00'&&d.order.product_data.variant.label==='Negro · M');
 check('the freight is quoted from the variant warehouse with the variant price',quotes.at(-1).ciudad_remitente.cod_dane==='76001000'&&quotes.at(-1).ValorDeclarado===64900&&d.order.shipping_price==='12000.00');
 check('the order is ready for Dropi with that variant',d.dropi.checks.find(c=>c.key==='variant').ready===true);
 email='variante-b@example.test';r=await lead(token,{'variant_option':{Color:'Beige',Talla:'S'},email});d=await orderOf(email);
 check('without JavaScript the options choose the variant and the landing price applies',r.status()===202&&d.order.variant_data.id==='504'&&d.order.unit_price==='59900.00');
 // Refresh: Dropi drops one variant and adds another
 catalog=[...catalog.filter(x=>x.id!==505),variation(507,'NEGRO','XL',20)];
 check('a new refresh renews the variants of the published landing too',(await refresh()).ok()&&(html=await page())&&html.includes('value="XL"')&&!JSON.parse(html.match(/data-vp-data>(.*?)<\/script>/s)[1]).some(x=>x.id==='505'));
 check('the store choices survive the refresh',(await landing()).content.variants.items['502'].price===64900);

 // Browser: picker behaviour and the three styles
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 for(const [theme,w] of [['modern',1280],['warm',1280],['bold',1280],['modern',390],['bold',390]]){
  await save(c=>({visual:{...c.visual,theme}}));await publish();
  const ctx=await browser.newContext({viewport:{width:w,height:w>500?900:844},reducedMotion:'reduce'});await ctx.route(IMG+'**',x=>x.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="'+(x.request().url().includes('-2')?'#d8c3a5':'#2b2b2b')+'"/></svg>'}));
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/p/'+f.slug);await p.locator('[data-buy]').first().click();
  const m=p.locator('#purchase-dialog');await m.locator('.vp').waitFor();
  if(theme==='modern'&&w===1280){
   check('the first available variant starts chosen, with its stock',(await m.locator('[data-lead-variant]').inputValue())==='501'&&(await m.locator('[data-vp-stock]').innerText())==='Disponibles: 40 unidades'&&await m.locator('.vp-choice.is-out',{hasText:'L'}).count()===1);
   await m.getByRole('radio',{name:/^M$/}).check();
   check('choosing color and size shows the variant price',(await m.locator('[data-summary-unit]').innerText()).includes('64.900')&&(await m.locator('[data-lead-variant]').inputValue())==='502');
   await m.getByRole('radio',{name:'Beige'}).check();await m.getByRole('radio',{name:/^S$/}).check();
   check('the summary photo follows the color and the landing price applies',(await m.locator('.order-summary img').getAttribute('src'))===IMG+'faja-2.jpg'&&(await m.locator('[data-summary-unit]').innerText()).includes('59.900'));
   await m.getByRole('radio',{name:/^L/}).check();
   check('a combination that is not for sale explains itself',(await m.locator('[data-vp-error]').innerText()).includes('no está disponible')&&(await m.locator('[data-lead-variant]').inputValue())==='');
   await m.locator('[name=first_name]').fill('Ana');await m.locator('[name=last_name]').fill('Navegador');await m.locator('[name=email]').fill('variante-ui@example.test');await m.locator('[name=phone]').fill('3001234567');
   await m.locator('[name=department_code]').selectOption('05');await m.locator('[name=city_code]').selectOption('05001');await m.locator('[name=address]').fill('Calle 1 # 2-3');
   await m.getByRole('button',{name:/Enviar solicitud/}).click();
   check('sending without a valid choice keeps the form and points to the picker',await m.isVisible()&&(await m.locator('[data-vp-error]').isVisible()));
   await m.getByRole('radio',{name:/^S$/}).check();await p.waitForFunction(()=>/[0-9]/.test(document.querySelector('[data-summary-shipping]')?.textContent||''));
   const sent=p.waitForResponse(x=>x.url().endsWith('/lead'));await m.getByRole('button',{name:/Enviar solicitud/}).click();
   check('the buyer completes the order with the chosen variant',(await sent).status()===202&&(await orderOf('variante-ui@example.test')).order.variant_data.label==='Beige · S');
   const firstKey=await m.locator('[name=idempotency_key]').inputValue();await p.locator('dialog.lead-success .ls-button').click();await p.locator('dialog.lead-success').waitFor({state:'detached'});
   await p.locator('[data-buy]').first().click();await m.locator('.vp').first().waitFor();
   check('after an order the form starts clean for the next one',(await m.locator('[name=first_name]').inputValue())===''&&await m.locator('[name=first_name]').isEnabled()&&(await m.locator('[name=address]').inputValue())===''&&(await m.locator('[name=idempotency_key]').inputValue())!==firstKey&&(await m.getByRole('button',{name:/Enviar solicitud/}).isEnabled())&&(await m.locator('[data-lead-variant]').inputValue())==='504');
   await m.locator('[name=first_name]').fill('Ana');await m.locator('[name=last_name]').fill('Segundo');await m.locator('[name=email]').fill('variante-ui2@example.test');await m.locator('[name=phone]').fill('3001234567');
   await m.locator('[name=department_code]').selectOption('05');await m.locator('[name=city_code]').selectOption('05001');await m.locator('[name=address]').fill('Calle 1 # 2-3');
   const second=p.waitForResponse(x=>x.url().endsWith('/lead'));await m.getByRole('button',{name:/Enviar solicitud/}).click();
   check('a second order can be sent without reloading the page',(await second).status()===202&&(await orderOf('variante-ui2@example.test')).order.variant_data.label==='Beige · S');
   await p.goto(base+'/p/'+f.slug);const box=p.locator('.purchase-box .vp-box');await box.waitFor();
   check('the purchase box shows the variants with the first available chosen and its stock',await box.getByRole('radio',{name:'Negro'}).isChecked()&&await box.getByRole('radio',{name:/^S$/}).isChecked()&&(await box.locator('[data-vp-stock]').innerText()).includes('40'));
   await box.getByRole('radio',{name:/^M$/}).check();
   check('a choice in the purchase box updates its price and stock',(await p.locator('.purchase-box [data-summary-unit]').innerText()).includes('64.900')&&(await box.locator('[data-vp-stock]').innerText()).includes('35'));
   await box.screenshot({path:'test-results/variants-box.png'});
   await p.locator('[data-buy]').first().click();await m.locator('.vp').first().waitFor();
   check('the form receives the choice made in the purchase box',(await m.locator('[data-lead-variant]').inputValue())==='502');
  }
  await m.getByRole('radio',{name:'Negro'}).check();await m.getByRole('radio',{name:/^M$/}).check();
  await m.locator('.vp').screenshot({path:`test-results/variants-${theme}-${w}.png`});
  check(`the picker fits the ${theme} style at ${w}px`,await p.evaluate(()=>document.querySelector('#purchase-dialog').scrollWidth<=document.querySelector('#purchase-dialog').clientWidth)&&(await m.locator('.vp-choice span').first().boundingBox()).height>=44);
  await ctx.close();
 }
 // Editor
 const ectx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1440,height:1000}});const ep=await ectx.newPage();ep.on('pageerror',e=>errors.push(e.message));
 await ectx.route(IMG+'**',x=>x.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#d8c3a5"/></svg>'}));
 await ep.goto(base+'/panel/landings/'+f.landing);await ep.getByRole('button',{name:'Producto y página'}).first().click();
 check('the product panel is organized in sections, the first one open',await ep.locator('.bs').count()>=8&&await ep.locator('.bs[open]').count()===1);
 await ep.locator('.bs summary',{hasText:'Variantes'}).click();check('the variants section summarizes what is for sale',(await ep.locator('.bs[open]',{hasText:'Variantes'}).innerText()).includes('5 de 6 a la venta'));
 await ep.screenshot({path:'test-results/variants-panel.png'});
 await ep.getByRole('button',{name:'Editar variantes'}).click();const bv=ep.locator('.bd .bv');await bv.waitFor();
 check('the editor lists the variants with stock and the hidden one switched off',await bv.locator('.bv-list li').count()===6&&(await bv.locator('.bv-count').innerText()).includes('de 6')&&await bv.locator('.bv-list li.is-hidden').count()===1&&(await bv.innerText()).includes('Agotada'));
 await bv.scrollIntoViewIfNeeded();await bv.screenshot({path:'test-results/variants-editor.png'});
 await bv.getByRole('button',{name:'Ocultar agotadas'}).click();
 check('«Ocultar agotadas» switches off the sold-out variant',await bv.locator('.bv-list li.is-hidden').count()===2);
 check('no browser errors',errors.length===0);
 console.log(`${checks} landing variant checks passed against local simulators. Nothing reached Dropi.`);
}finally{await orders('shipping-setup','off').catch(()=>{});await browser?.close();dropiCatalog.close();quote.close();}
