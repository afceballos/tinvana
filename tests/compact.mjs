// Compact lists (products, leads, orders) and the invoice-style order summary. Mocked API responses only; no database or external service.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TINVANA_BASE||'http://127.0.0.1:8081';
const user={id:'u1',email:'demo@tinvana.test',role:'user',first_name:'Ana',last_name:'Demo',avatar:null};
const mkProduct=(i,landing,pub)=>({id:'p'+i,integration_id:'1',dropi_id:String(1000+i),product:{id:String(i),name:'Producto '+i,description:'',price:50000+i,suggestedPrice:null,sku:null,images:[],categories:[],stock:1,warehouses:[],supplier:null,attributes:[],variations:[]},landing_id:landing?'l'+i:null,slug:'p-'+i,publication_status:pub?'published':null});
const products=[mkProduct(0,false,false),mkProduct(1,true,true),mkProduct(2,true,false)];
const mkLead=(i,status)=>({id:'lead'+i,first_name:'Cliente'+i,last_name:'Prueba',email:'c'+i+'@x.co',phone:'300000000'+i,status,attempts:1,last_http_status:200,last_error:null,created_at:'2026-10-1'+i+'T10:00:00Z',delivery_address:null,product_data:{product_name:'Producto '+i,landing_url:'x',public_price:90000,dropi_price:50000},history:[]});
const leads=[mkLead(0,'delivered'),mkLead(1,'pending'),mkLead(2,'failed'),mkLead(3,'delivered')];
const mkOrder=(i,s)=>({id:'0a1b2c3d-0000-4000-8000-00000000000'+i,lead_id:'lead'+i,customer:{first_name:'Cliente'+i,last_name:'Prueba',email:'c'+i+'@x.co',phone:'300000000'+i},delivery_address:{address:'Calle 1 # 2-3',address_details:'',city:'Bogotá',state:'Bogotá D.C.',country:'Colombia',postal_code:''},product_data:{product_name:'Producto '+i,product_id:'100'+i,sku:'S'+i,dropi_price:50000},quantity:2,unit_price:'90000',shipping_price:'12000',total:'192000',sale_status:s,version:1,quote_id:'q',quote_expires_at:'2027-01-01T00:00:00Z',notes:'',variant_data:null,offer_snapshot:null,confirmation:null,created_at:'2026-10-1'+i+'T10:00:00Z'});
const orders=[mkOrder(0,'draft'),mkOrder(1,'confirmed'),mkOrder(2,'cancelled')];
const detail={order:orders[0],events:[{id:'e1',event_type:'created',order_version:1,created_at:'2026-10-10T10:20:00Z',data:{}}],commercial:{product:{id:'p0',name:'Producto 0',dropi_id:'1000',type:null},version:1,variants:[],settings:{active:false,tiers:[],starts_at:null,ends_at:null}},dropi:{status:'not_sent',can_submit:false,can_resolve:false,dropi_order_id:null,preview:null,last:null,message:'Faltan datos.',checks:[{key:'a',label:'Aceptación',ready:false}]}};
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const calls=[];
 await page.route('**/api/**',route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname,j=b=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(b)});calls.push(r.method()+' '+p+u.search);
  if(p==='/api/auth/session')return j({user,csrf:'x'});if(p==='/api/products')return j({products});if(/^\/api\/products\/[^/]+\/landing$/.test(p))return j({landing:{id:'land-1'}});if(p==='/api/leads')return j({leads,hasNext:false});
  if(p==='/api/orders')return j({orders:orders.filter(o=>!u.searchParams.get('status')||o.sale_status===u.searchParams.get('status')),hasNext:false});if(/^\/api\/orders\/[^/]+$/.test(p))return j(detail);return j({});});
 // Products
 await page.goto(base+'/panel/productos');await page.locator('.selected-row').first().waitFor();
 check('product cards render in a grid with the legacy class',await page.locator('.pc-card.selected-row').count()===3&&await page.locator('.pc-grid').evaluate(el=>getComputedStyle(el).display==='grid'));
 check('status chips show counts',await page.getByRole('button',{name:/^Publicadas\s*1$/}).count()===1&&await page.getByRole('button',{name:/^Sin landing\s*1$/}).count()===1);
 await page.getByRole('button',{name:/^Borradores/}).click();check('draft filter keeps only drafts',await page.locator('.pc-card').count()===1&&await page.locator('.pc-card h3').first().innerText()==='Producto 2');
 await page.getByRole('button',{name:/^Todos/}).click();await page.getByLabel('Buscar en mis productos').fill('1001');check('search by Dropi id',await page.locator('.pc-card').count()===1);
 await page.getByLabel('Buscar en mis productos').fill('');
 check('icon actions keep their accessible names',await page.getByRole('link',{name:'Precios por cantidad'}).count()===3&&await page.getByRole('button',{name:'Actualizar datos Dropi'}).count()===3&&await page.getByRole('button',{name:'Quitar selección'}).count()===1);
 check('published product links to its public page',await page.getByRole('link',{name:'Abrir página pública'}).getAttribute('href')==='/p/p-1');
 await page.getByRole('button',{name:'Crear landing'}).click();await page.waitForURL('**/panel/landings/land-1');check('create landing still posts and navigates',calls.includes('POST /api/products/p0/landing'));
 // Leads
 await page.goto(base+'/panel/leads');await page.locator('.lead-card').first().waitFor();
 check('lead rows and counters',await page.locator('.lead-card').count()===4&&await page.locator('.cx-stat').nth(1).innerText().then(t=>/2/.test(t)));
 await page.getByRole('button',{name:/^Fallidas/}).click();check('failed filter',await page.locator('.lead-card').count()===1);
 await page.getByRole('button',{name:/^Todas/}).click();
 await page.getByRole('button',{name:'Ver detalle de Cliente1 Prueba'}).click();await page.locator('dialog.lead-dialog[open]').waitFor();
 check('lead detail opens as a right drawer',await page.locator('dialog.lead-dialog').evaluate(el=>{const b=el.getBoundingClientRect();return Math.abs(b.right-innerWidth)<2&&b.height>=innerHeight-2;}));
 await page.keyboard.press('Escape');await page.locator('dialog.lead-dialog').waitFor({state:'detached'});
 {const box=await page.locator('.lead-card .cx-product').nth(2).boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.locator('dialog.lead-dialog[open]').waitFor();check('clicking anywhere on a lead row opens its detail',await page.locator('dialog.lead-dialog h2').innerText().then(t=>/Cliente2/.test(t)));await page.keyboard.press('Escape');await page.locator('dialog.lead-dialog').waitFor({state:'detached'});}
 // Orders
 await page.goto(base+'/panel/pedidos');await page.locator('.order-row').first().waitFor();
 check('order rows, avatar and summary tiles',await page.locator('.order-row').count()===3&&await page.locator('.cx-avatar').count()===3&&await page.locator('.cx-stat').count()===4);
 check('open order link keeps its name',await page.getByRole('link',{name:'Abrir pedido'}).count()===3);
 {const box=await page.locator('.order-row .cx-product').first().boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.waitForURL('**/panel/pedidos/'+orders[0].id);check('clicking anywhere on an order row opens it',true);await page.goBack();await page.locator('.order-row').first().waitFor();}
 await page.getByRole('button',{name:'Confirmado',exact:true}).click();await page.waitForURL('**status=confirmed**');await page.waitForFunction(()=>document.querySelectorAll('.order-row').length===1);check('status chip filters on the server',calls.some(c=>c.includes('/api/orders?page=1&status=confirmed'))&&await page.locator('.order-row').count()===1);
 await page.goto(base+'/panel/pedidos/'+orders[0].id);await page.locator('.order-invoice').waitFor();
 check('invoice summary shows buyer, address, items and totals',await page.locator('.oi-parties').innerText().then(t=>/Cliente0 Prueba/.test(t)&&/Calle 1/.test(t))&&await page.locator('.oi-items tbody tr').count()===1&&await page.locator('.oi-totals .is-total dd').innerText().then(t=>/192\.000/.test(t)));
 check('quote panel and readiness are preserved',await page.getByRole('heading',{name:'Cotización manual'}).isVisible()&&await page.getByRole('heading',{name:'Envío a Dropi'}).isVisible()&&await page.locator('.order-total strong').count()===1&&await page.getByRole('button',{name:'Editar comprador y dirección'}).count()===1);
 check('history uses the timeline',await page.locator('.cx-timeline>li').count()===1);
 for(const [name,path] of [['products','/panel/productos'],['leads','/panel/leads'],['orders','/panel/pedidos'],['order detail','/panel/pedidos/'+orders[0].id]])for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.goto(base+path);await page.waitForTimeout(500);check(`${name} fits ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 check('no JavaScript errors',errors.length===0);console.log(`${passed} checks passed`);
}finally{await browser.close();}
