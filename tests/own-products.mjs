// Own products (created from scratch, without Dropi): creation, landing, order without Dropi, stock and manual shipping.
// Runs only against the isolated local test database (tests/run-suites.ps1 -Only own-products); removes what it creates.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let count=0;
const check=(name,value)=>{assert(value,name);count++;console.log('PASS '+name);};
class Client {
 cookie='';csrf='';
 async request(path,method='GET',body,token=this.csrf){const response=await fetch(base+path,{method,redirect:'manual',headers:{Cookie:this.cookie,...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});const set=response.headers.getSetCookie?.()||[];for(const c of set){const pair=c.split(';')[0];const name=pair.split('=')[0];this.cookie=[...this.cookie.split('; ').filter(x=>x&&!x.startsWith(name+'=')),pair].join('; ');}const text=await response.text();let data=null;try{data=JSON.parse(text);}catch{data=text;}return {response,data};}
 async init(){const r=await this.request('/api/auth/session');this.csrf=r.data.csrf;return r;}
 async login(email){await this.init();const r=await this.request('/api/auth/login','POST',{email,password:fixture.password});if(r.data.csrf)this.csrf=r.data.csrf;assert.equal(r.response.status,200);return r;}
}
const owner=new Client(),other=new Client(),visitor=new Client();
await owner.login(fixture.email);await other.login(fixture.otherEmail);await visitor.init();
const lead=(extra={})=>({country_code:'CO',department_code:'11',city_code:'11001',address:'Calle 123 # 45-67',address_details:'Casa',postal_code:'110111',phone_country:'CO',first_name:'Ana',last_name:'Propia',email:'own@example.test',phone:'3001234567',idempotency_key:randomUUID(),website:'',quantity:1,...extra});
const created=[];
try{
 check('own product needs CSRF',(await owner.request('/api/products/own','POST',{name:'X',price:1000},'bad')).response.status===419);
 check('own product needs a name',(await owner.request('/api/products/own','POST',{name:' ',price:1000})).response.status===422);
 check('own product needs a price',(await owner.request('/api/products/own','POST',{name:'Sin precio'})).response.status===422);
 check('foreign photo refused',(await owner.request('/api/products/own','POST',{name:'Foto ajena',price:1000,images:['http://127.0.0.1:8081/media/'+randomUUID()+'.webp']})).response.status===422);
 const simple=await owner.request('/api/products/own','POST',{name:'Lámpara propia',description:'Luz cálida\nRecargable',price:59900,cost:21000,sku:'LAMP-1',images:[],track_stock:true,stock:3});
 check('own product created',simple.response.status===200&&simple.data.product.stock===3&&simple.data.product.track_stock===true);
 const pid=simple.data.id;created.push(pid);
 const list=(await owner.request('/api/products')).data.products.find(p=>p.id===pid);
 check('listed as own product without Dropi ID',list&&list.source==='own'&&list.dropi_id===null&&list.integration_id===null&&list.product.source==='own'&&list.product.price===59900&&list.product.cost===21000&&list.product.stock===3);
 check('other account cannot read it',(await other.request('/api/products/'+pid+'/own')).response.status===404);
 check('refresh from Dropi refused',(await owner.request('/api/products/'+pid+'/refresh','POST',{})).response.status===409);
 const landing=(await owner.request('/api/products/'+pid+'/landing','POST',{})).data.landing;
 check('landing starts with the product price',landing.content.publicPrice===59900&&landing.product_snapshot.source==='own'&&landing.content.title==='Lámpara propia');
 // Publish with one visible section.
 const content={...landing.content,blocks:landing.content.blocks.map(b=>({...b,visible:b.type==='hero'}))};
 const saved=await owner.request('/api/landings/'+landing.id,'PUT',{content,slug:landing.slug});check('landing saved',saved.response.status===200);
 const pub=await owner.request('/api/landings/'+landing.id+'/publish','POST',{});check('landing published',pub.response.status===200);
 const slug=landing.slug;
 check('buyer order accepted',(await visitor.request('/p/'+slug+'/lead','POST',lead({quantity:1}),visitor.csrf)).response.status===202);
 const orders=(await owner.request('/api/orders')).data.orders.filter(o=>o.product_data.product_name==='Lámpara propia');
 const order=orders[0];
 check('order is shipped by the store',orders.length===1&&order.fulfillment==='own'&&order.product_data.source==='own'&&order.product_data.dropi_id===null&&order.product_data.tags?.[0]!=='dropi-product-lead');
 let d=(await owner.request('/api/orders/'+order.id)).data;
 check('no Dropi submission panel',d.dropi.mode==='own'&&d.dropi.can_submit===false&&d.dropi.states.delivered==='Entregado');
 check('send to Dropi refused',(await owner.request('/api/orders/'+order.id+'/dropi','POST',{confirm:true,version:d.order.version})).response.status===409);
 check('shipping before confirmation refused',(await owner.request('/api/orders/'+order.id+'/shipping','POST',{state:'guide_generated',version:d.order.version})).response.status===409);
 d=(await owner.request('/api/orders/'+order.id+'/quote','POST',{quantity:2,unit_price:'59900',shipping_price:'12000',version:d.order.version})).data;
 d=(await owner.request('/api/orders/'+order.id+'/confirm','POST',{quote_id:d.order.quote_id,evidence:'Aceptó por llamada telefónica',accepted:true,version:d.order.version})).data;
 let p=(await owner.request('/api/products/'+pid+'/own')).data.product;
 check('confirmation takes the units from stock',d.order.sale_status==='confirmed'&&d.order.stock_units===2&&p.stock===1&&d.events.some(e=>e.event_type==='stock_taken'));
 const pending=(await owner.request('/api/pending')).data.sections.find(s=>s.key==='ship');
 check('pending lists it to ship',pending&&pending.items.some(i=>i.key.startsWith('ship:'+order.id)));
 check('novelty needs a note',(await owner.request('/api/orders/'+order.id+'/shipping','POST',{state:'novelty',version:d.order.version})).response.status===422);
 d=(await owner.request('/api/orders/'+order.id+'/shipping','POST',{state:'guide_generated',carrier:'Servientrega',guide:'ABC123',version:d.order.version})).data;
 check('marked as shipped with guide',d.order.logistics_status==='guide_generated'&&d.order.dropi_tracking.guide==='ABC123'&&d.order.dropi_tracking.carrier==='Servientrega'&&d.events.some(e=>e.event_type==='shipping_updated'));
 check('customer edit refused once shipped',(await owner.request('/api/orders/'+order.id+'/customer','POST',{first_name:'X',last_name:'Y',email:'x@example.test',phone:'3001234567',country_code:'CO',department_code:'11',city_code:'11001',address:'Calle 1',version:d.order.version})).response.status===409);
 const lookup=await visitor.request('/api/orders/'+order.id);check('order detail stays private',lookup.response.status===401);
 d=(await owner.request('/api/orders/'+order.id+'/cancel','POST',{reason:'El cliente desistió',version:d.order.version})).data;
 p=(await owner.request('/api/products/'+pid+'/own')).data.product;
 check('cancellation puts the stock back',d.order.sale_status==='cancelled'&&d.order.stock_units===null&&p.stock===3);
 check('quantity over stock refused on the landing',(await visitor.request('/p/'+slug+'/lead','POST',lead({quantity:5}),visitor.csrf)).response.status!==202);
 // Variants: one per combination; ids stay when values are added; the landing keeps per-variant prices.
 const v=await owner.request('/api/products/own','POST',{name:'Camiseta propia',price:45000,track_stock:true,options:[{name:'Color',values:['Negro','Blanco']},{name:'Talla',values:['S','M']}],variants:[{key:'Negro|S',stock:2,price:48000},{key:'Blanco|M',stock:1}]});
 check('variants created per combination',v.response.status===200&&v.data.product.variants.length===4&&v.data.product.variants.find(x=>x.key==='Negro|S').stock===2);
 created.push(v.data.id);
 const snap=(await owner.request('/api/products')).data.products.find(x=>x.id===v.data.id).product;
 check('variable product maps its variants',snap.type==='VARIABLE'&&snap.variants.length===4&&snap.stock===3&&snap.variants.every(x=>/^[1-9][0-9]*$/.test(x.id)));
 const ids=Object.fromEntries(snap.variants.map(x=>[x.label,x.id]));
 const edit=await owner.request('/api/products/'+v.data.id+'/own','PUT',{name:'Camiseta propia',price:45000,track_stock:true,options:[{name:'Color',values:['Negro','Blanco','Azul']},{name:'Talla',values:['S','M']}],variants:[{key:'Negro|S',stock:2,price:48000},{key:'Blanco|M',stock:1}]});
 const snap2=(await owner.request('/api/products')).data.products.find(x=>x.id===v.data.id).product;
 check('edit keeps variant ids and adds new ones',edit.response.status===200&&snap2.variants.length===6&&Object.entries(ids).every(([label,id])=>snap2.variants.find(x=>x.label===label)?.id===id));
 const vl=(await owner.request('/api/products/'+v.data.id+'/landing','POST',{})).data.landing;
 check('landing keeps the variant price',vl.content.variants.items[ids['Negro · S']]?.price===48000&&vl.content.publicPrice===45000);
 check('too many combinations refused',(await owner.request('/api/products/own','POST',{name:'Muchas',price:1000,options:[{name:'A',values:Array.from({length:11},(_,i)=>'a'+i)},{name:'B',values:Array.from({length:10},(_,i)=>'b'+i)}]})).response.status===422);
 console.log(`OK ${count} checks passed`);
}finally{
 // Remove what this suite created (landings, leads and orders of these products go with the fixture cleanup).
 for(const id of created)await owner.request('/api/products/'+id,'DELETE');
}
