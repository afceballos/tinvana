import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Sold-out products: the buy button checks the stock with Dropi (reused 10 minutes), the form checks again, sold-out
// landings do not open the form, and sold-out catalog products cannot be added. Dropi catalog simulated
// (DROPI_CATALOG_URL); ports movable with TEST_BASE_URL and DROPI_CATALOG_PORT. Isolated data only.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const orders=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
let mode='in',hits=0;
const variation=(id,size,stock)=>({id,sku:'-'+id,sale_price:'23000.00',suggested_price:'50000.00',deleted_at:null,stock:null,attribute_values:[{value:size,attribute_name:'TALLA'}],warehouse_product_variation:[{warehouse_id:3,stock,warehouse:{name:'Bodega',city:{name:'Cali',cod_dane:'76001000'}}}]});
const product=(id=987654321)=>({id,name:'Producto de prueba HTTP',type:mode.startsWith('var')?'VARIABLE':'SIMPLE',description:'<p>Producto.</p>',sale_price:mode.startsWith('var')?null:'12345',suggested_price:mode.startsWith('var')?null:'20000',sku:'TEST',
 gallery:[{main:true,url:'https://example.test/main.jpg'}],categories:[{name:'Hogar',pivot:{category_id:1}}],user:{id:55,store_name:'Proveedor'},attributes:[],
 warehouse_product:mode.startsWith('var')?[]:[{stock:mode==='out'?0:5,warehouse:{name:'Bodega',city:{name:'Cali',cod_dane:'76001000'}}}],
 variations:mode==='var-in'?[variation(701,'S',0),variation(702,'M',4)]:mode==='var-out'?[variation(701,'S',0),variation(702,'M',0)]:[]});
const catalog=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{hits++;
 if(mode==='fail'){res.writeHead(502,{'Content-Type':'text/html'});return res.end('<html>bad gateway</html>');}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({isSuccess:true,status:200,objects:mode==='gone'?[]:[product(Number(JSON.parse(raw||'{}').keywords)||987654321)]}));});});
await new Promise(r=>catalog.listen(Number(process.env.DROPI_CATALOG_PORT||8448),'127.0.0.1',r));
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
let owner,visitor;
const stock=async()=>(await(await visitor.get('/p/'+f.slug+'/stock')).json());
const html=async()=>(await(await visitor.get('/p/'+f.slug)).text());
const lead=async(extra={})=>{const t=(await html()).match(/name="csrf" value="([^"]+)"/)[1];return visitor.post('/p/'+f.slug+'/lead',{headers:{'X-CSRF-Token':t},data:{csrf:t,idempotency_key:randomUUID(),first_name:'Ana',last_name:'Stock',email:'stock-'+randomUUID().slice(0,6)+'@example.test',phone:'3001234567',phone_country:'CO',country_code:'CO',department_code:'05',city_code:'05001',address:'Calle 10 # 20-30',quantity:1,website:'',...extra}});};
try{
 await orders('reset-limits');owner=await login(f.email);visitor=await request.newContext({baseURL:base});
 check('fixture landing published',(await owner.ctx.post('/api/landings/'+f.landing+'/publish',{headers:owner.H})).ok());
 // Buy button check, reused for 10 minutes
 await orders('stock-expire');hits=0;let s=await stock();
 check('the buy button check asks Dropi and the product is available',s.available===true&&hits===1);
 s=await stock();check('a second check within 10 minutes reuses the answer',s.available===true&&hits===1);
 // Sold out while a buyer fills the form: the form checks live
 mode='out';hits=0;let r=await lead();
 check('the form checks Dropi live and refuses a sold-out product',r.status()===409&&(await r.json()).sold_out===true&&hits===1);
 check('that check updates the landing: it now renders sold out',(await html()).includes('data-stock="out"')&&(await stock()).available===false);
 const panel=(await(await owner.ctx.get('/api/landings/'+f.landing)).json()).landing;
 check('the panel sees the new stock without pressing «Actualizar»',panel.product_snapshot.stock===0);
 // Browser: sold-out landing
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.route('https://example.test/**',x=>x.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/p/'+f.slug);
 const buy=p.locator('[data-buy]').first();
 check('sold out: the buy buttons say «Agotado» and look disabled',(await buy.innerText()).includes('Agotado')&&await buy.getAttribute('aria-disabled')==='true'&&await p.locator('[data-buy].is-sold-out').count()===await p.locator('[data-buy]').count());
 await buy.click({force:true});await p.locator('.stock-toast.is-visible').waitFor();
 check('a tap shows a short notice and the form does not open',(await p.locator('.stock-toast').innerText()).includes('no tiene unidades disponibles')&&!(await p.locator('#purchase-dialog').evaluate(d=>d.open)));
 await p.screenshot({path:'test-results/stock-sold-out-mobile.png'});
 // Back in stock: the button checks before opening
 mode='in';await orders('stock-expire');await (await html());hits=0;
 await p.goto(base+'/p/'+f.slug);
 check('the page still starts from the saved copy (sold out) until someone checks',await p.locator('[data-buy].is-sold-out').count()>0);
 await orders('stock-expire');s=await stock();
 check('a new check after the reuse window finds the stock again',s.available===true&&hits===1);
 mode='out';await orders('stock-expire');await stock();await p.goto(base+'/p/'+f.slug);mode='in';await orders('stock-expire');hits=0;
 await p.locator('[data-buy]').first().click({force:true});await p.locator('#purchase-dialog[open]').waitFor();
 check('a sold-out page asks again on tap and reactivates when the stock is back',hits===1&&await p.locator('[data-buy].is-sold-out').count()===0&&!(await p.locator('[data-buy]').first().innerText()).includes('Agotado'));
 await p.locator('[data-close-purchase]').click();
 await p.goto(base+'/p/'+f.slug);
 check('with stock the buttons are normal again',await p.locator('[data-buy].is-sold-out').count()===0&&!(await p.locator('[data-buy]').first().innerText()).includes('Agotado'));
 await orders('stock-expire');mode='out';hits=0;await p.locator('[data-buy]').first().click();await p.locator('.stock-toast.is-visible').waitFor();
 check('tapping «Comprar» when it just ran out: no form, notice and buttons switch to sold out',hits===1&&!(await p.locator('#purchase-dialog').evaluate(d=>d.open))&&await p.locator('[data-buy].is-sold-out').count()>0);
 // Dropi down: the saved copy decides and the sale is not blocked
 mode='in';await orders('stock-expire');await stock();mode='fail';await orders('stock-expire');
 await p.goto(base+'/p/'+f.slug);await p.locator('[data-buy]').first().click();await p.locator('#purchase-dialog[open]').waitFor();
 check('if Dropi does not answer, the form opens with the saved stock',await p.locator('#purchase-dialog').evaluate(d=>d.open));
 r=await lead();check('and the order is accepted',r.status()===202);
 // Product no longer offered by Dropi
 mode='gone';r=await lead();check('a product Dropi no longer returns cannot be sold',r.status()===409);
 // Variants: one sold out, then all
 mode='var-in';await owner.ctx.post('/api/products/'+f.product+'/refresh',{headers:owner.H});
 check('a variable product with one size left still sells',(await stock()).available===true||(await orders('stock-expire'),(await stock()).available===true));
 r=await lead({variant_id:'701'});check('the sold-out size is refused',r.status()===422||r.status()===409);
 r=await lead({variant_id:'702'});check('the size with stock is accepted',r.status()===202);
 mode='var-out';r=await lead({variant_id:'702'});
 check('when every size runs out the landing stops selling',r.status()===409&&(await html()).includes('data-stock="out"'));
 // Catalog and panel
 mode='out';
 r=await owner.ctx.post('/api/products',{headers:owner.H,data:{integration_id:f.integration,dropi_id:'987654322'}});
 check('a sold-out catalog product cannot be added to «Mis productos»',r.status()===409||r.status()===422);
 const pctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1280,height:900}});const pp=await pctx.newPage();pp.on('pageerror',e=>errors.push(e.message));
 await pctx.route('https://example.test/**',x=>x.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
 await pp.goto(base+'/panel/productos');await pp.locator('.sold-out-badge').first().waitFor();
 check('«Mis productos» marks the product as sold out',await pp.locator('.sold-out-badge').count()>=1);
 await pp.goto(base+'/panel/landings/'+f.landing);await pp.getByRole('button',{name:'Producto y página'}).first().click();
 check('the landing editor explains that it does not sell while sold out',await pp.getByText('Este producto está agotado en Dropi').isVisible());
 check('no browser errors',errors.length===0);
 console.log(`${checks} stock checks passed against a simulated Dropi catalog. Nothing reached Dropi.`);
}finally{await browser?.close();catalog.close();}
