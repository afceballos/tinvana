// Landing address picker (normal link vs. own subdomain). Mocked API only; no database or external service.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TINVANA_BASE||'http://127.0.0.1:8081';
const user={id:'u1',email:'demo@tinvana.test',role:'user',first_name:'Ana',last_name:'Demo',avatar:null};
const product={id:'1',name:'Producto 1',description:'',price:50000,suggestedPrice:null,sku:null,images:[],categories:[],stock:1,warehouses:[],supplier:null,attributes:[]};
const content={title:'Producto 1',description:'Texto',publicPrice:50000,images:[],features:[],seoTitle:'Producto 1',seoDescription:'',visual:{primaryColor:'#193e35',backgroundColor:'#fafbf7',buttonText:'Pedir ahora',whatsapp:''},schemaVersion:2,blocks:[],commerce:{previousPrice:null,quantityEnabled:false,maxQuantity:5,stickyMobile:false,showShipping:false,showDelivery:false,showPayment:false,shipping:'',delivery:'',payment:''},header:{menuEnabled:false,sticky:false,mode:'auto',logo:'',logoAlt:'',backgroundColor:'#ffffff',items:[]}};
let landing={id:'0a1b2c3d-0000-4000-8000-0000000000a1',slug:'producto-1-abc',subdomain:null,published_slug:null,published_subdomain:null,subdomain_base:'tinbana.com',status:'draft',selected_product_id:'p1',content,product_snapshot:product};
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const puts=[];
 await page.route('**/api/**',route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname,j=b=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(b)});
  if(p==='/api/auth/session')return j({user,csrf:'x'});
  if(p==='/api/landings/0a1b2c3d-0000-4000-8000-0000000000a1'&&r.method()==='GET')return j({landing});
  if(p==='/api/landings/0a1b2c3d-0000-4000-8000-0000000000a1'&&r.method()==='PUT'){const body=JSON.parse(r.postData()||'{}');puts.push(body);landing={...landing,slug:body.slug,subdomain:body.subdomain,content:body.content};return j({landing});}
  if(p==='/api/landings/0a1b2c3d-0000-4000-8000-0000000000a1/render')return j({html:'<p>Vista previa</p>'});
  if(p==='/api/products')return j({products:[]});if(p==='/api/builder-templates')return j({templates:[]});return j({});});
 await page.goto(base+'/panel/landings/0a1b2c3d-0000-4000-8000-0000000000a1');
 await page.getByRole('button',{name:'Producto y página'}).click();
 const group=page.getByRole('group',{name:'Enlace público de la landing'});await group.waitFor();
 check('radios stay compact',(await group.getByRole('radio').first().boundingBox()).width<=20);
 check('both address options are offered',await group.getByRole('radio').count()===2);
 check('normal link is selected by default',await group.getByRole('radio',{name:/Enlace normal/}).isChecked());
 check('draft path field is visible in normal mode',await page.getByLabel('Dirección del borrador').count()===1);
 await group.getByRole('radio',{name:/Subdominio propio/}).check();
 const field=page.getByLabel('Nombre del subdominio');await field.waitFor();
 check('path field is replaced by the subdomain field',await page.getByLabel('Dirección del borrador').count()===0);
 check('base domain is shown after the field',(await page.locator('.address-subdomain span').innerText()).trim()==='.tinbana.com');
 check('empty name asks for one',(await page.locator('.address-hint').innerText()).includes('Escribe un nombre'));
 await field.fill('Mi Tienda Ñandú! _2');
 check('typing keeps only letters, numbers and hyphens, no spaces or accents',await field.inputValue()==='mi-tienda-nandu-2');
 await field.fill('---a---b');check('no leading or doubled hyphens',await field.inputValue()==='a-b');
 await field.fill('ab');check('short name is flagged',(await page.locator('.address-hint.bad').innerText()).includes('3 caracteres'));
 await field.fill('x'.repeat(60));check('length is capped at 40',(await field.inputValue()).length===40);
 await field.fill('mi-tienda');check('valid name clears the warning',await page.locator('.address-hint.bad').count()===0);
 await page.locator('.address-picker').screenshot({path:'test-results/landing-address-light.png'});
 check('preview shows the final address',(await group.innerText()).includes('mi-tienda.tinbana.com'));
 await page.getByRole('button',{name:/Guardar borrador/}).click();await page.waitForFunction(()=>true);
 await page.waitForTimeout(600);
 check('save sends the subdomain',puts.length>0&&puts[puts.length-1].subdomain==='mi-tienda'&&puts[puts.length-1].slug==='producto-1-abc');
 await group.getByRole('radio',{name:/Enlace normal/}).check();
 await page.getByRole('button',{name:/Guardar borrador/}).click();await page.waitForTimeout(600);
 check('going back to the normal link sends no subdomain',puts[puts.length-1].subdomain===null);
 // Without a public domain (local/IP) the option is unavailable.
 landing={...landing,subdomain:null,subdomain_base:null};await page.reload();await page.getByRole('button',{name:'Producto y página'}).click();
 const local=page.getByRole('group',{name:'Enlace público de la landing'});await local.waitFor();
 check('subdomain option is disabled without a public domain',await local.getByRole('radio',{name:/Subdominio propio/}).isDisabled());
 // Dark mode keeps the picker readable.
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 const bg=await page.locator('.address-option').first().evaluate(el=>getComputedStyle(el).backgroundColor);check('dark theme restyles the options',bg!=='rgb(255, 255, 255)');
 check('no page errors',errors.length===0);
 await page.screenshot({path:'test-results/landing-address-dark.png'});
 console.log('OK '+passed+' checks');
}finally{await browser.close();}
