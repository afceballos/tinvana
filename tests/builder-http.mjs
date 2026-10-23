import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081';
let checks=0;function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
class Client{cookie='';csrf='';async request(path,method='GET',body){const r=await fetch(base+path,{method,headers:{Cookie:this.cookie,...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':this.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});const cookie=r.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];const text=await r.text();let data;try{data=JSON.parse(text);}catch{}return {status:r.status,text,data};}async login(email){const s=await this.request('/api/auth/session');this.csrf=s.data.csrf;const r=await this.request('/api/auth/login','POST',{email,password:fixture.password});assert.equal(r.status,200);this.csrf=r.data.csrf;}}
const owner=new Client(),other=new Client(),visitor=new Client();await owner.login(fixture.email);await other.login(fixture.otherEmail);
await writeFile('.tools/test-session.txt',owner.cookie.split('=')[1]);await promisify(execFile)('.tools/php/php.exe',['backend/tests/cache.php']);
const selected=await owner.request('/api/products','POST',{integration_id:fixture.integration,dropi_id:'987654322'});
const created=await owner.request('/api/products/'+selected.data.id+'/landing','POST',{});check('new landing created from selected upstream snapshot',created.status===200&&created.data.landing.content.title==='Producto seleccionado por API'&&created.data.landing.content.blocks[0].type==='hero');
const second=created.data.landing;check('new blank landing persisted independently',(await owner.request('/api/landings/'+second.id,'PUT',{slug:second.slug,content:{...second.content,blocks:[]}})).data.landing.content.blocks.length===0);
const path='/api/landings/'+fixture.landing;
let landing=(await owner.request(path)).data.landing;
function block(type,data={},variant){return {id:randomUUID(),type,visible:true,variant:variant||({hero:'image-left',faq:'accordion',list:'checks',cta:'band',richText:'standard'}[type]),style:{tone:'paper',space:'normal',align:'left',ratio:'landscape'},data};}
const item=(title='Dato real')=>({id:randomUUID(),title,description:'Información proporcionada para pruebas.',visible:true});
const save=content=>owner.request(path,'PUT',{slug:landing.slug,content});
check('legacy landing converted without lost product',(landing.content.schemaVersion===2&&landing.content.blocks[0].type==='hero'&&landing.product_snapshot.id==='987654321'));
let c={...landing.content,blocks:[]};check('blank draft can be saved',(await save(c)).status===200);check('blank publication prevented',(await owner.request(path+'/publish','POST',{})).status===422);
c.blocks=[block('hero'),block('list',{title:'Datos verificables',items:[item()]}),block('faq',{title:'Preguntas',items:[item('¿Cómo solicitar?')]}),block('cta',{title:'Solicita información'})];c.title='Versión publicada A';c.publicPrice=25000;
c.commerce={...c.commerce,maxQuantity:5};check('template blocks saved',(await save(c)).status===200);
let copy=structuredClone(c);copy.blocks[1].data.items=Array.from({length:20},()=>item());check('twenty items accepted',(await save(copy)).status===200);copy.blocks[1].data.items.push(item());check('twenty-one rejected by data layer',(await save(copy)).status===422);
copy=structuredClone(c);copy.blocks[2].visible=false;check('hidden FAQ persisted',(await save(copy)).data.landing.content.blocks[2].visible===false);
copy.blocks.push({...structuredClone(copy.blocks[1]),id:randomUUID()});check('section duplication persists',(await save(copy)).data.landing.content.blocks.length===5);copy.blocks.reverse();check('order recovered exactly',(await save(copy)).data.landing.content.blocks[0].type==='list');copy.blocks.splice(0,1);check('section deletion persisted',(await save(copy)).data.landing.content.blocks.length===4);
await save(c);check('publish snapshot succeeds',(await owner.request(path+'/publish','POST',{})).status===200);
let live=await visitor.request('/p/'+fixture.slug);check('published renderer uses configured sections',live.text.includes('Versión publicada A')&&live.text.includes('data-buy')&&live.text.includes('purchase-dialog'));
check('no invented commercial assurances',!live.text.includes('Envío gratis')&&!live.text.includes('3 días'));
check('public animation asset available',(await visitor.request('/landing-assets/landing-runtime.js')).status===200);
copy=structuredClone(c);copy.title='Borrador B';copy.publicPrice=99000;copy.blocks[2].visible=false;const newSlug=fixture.slug+'-draft';landing.slug=newSlug;check('draft edits saved',(await save(copy)).status===200);
live=await visitor.request('/p/'+fixture.slug);check('draft content and price do not change live',live.status===200&&live.text.includes('Versión publicada A')&&!live.text.includes('Borrador B')&&live.text.includes('25.000'));
check('new draft URL remains private',(await visitor.request('/p/'+newSlug)).status===404);
visitor.csrf=live.text.match(/name="csrf" value="([^"]+)"/)[1];
// Delivery address became mandatory with migration 007; forged price fields must still be ignored.
const lead={country_code:'CO',department_code:'11',city_code:'11001',address:'Calle 123 # 45-67',phone_country:'CO',first_name:'Prueba',last_name:'Builder',email:'builder@example.test',phone:'3001234567',idempotency_key:randomUUID(),quantity:2,unit_price:1,total:2,product_id:'forged'};
check('quantity zero rejected',(await visitor.request('/p/'+fixture.slug+'/lead','POST',{...lead,quantity:0})).status===422);
check('quantity above configured max rejected',(await visitor.request('/p/'+fixture.slug+'/lead','POST',{...lead,quantity:6})).status===422);
check('fractional quantity rejected',(await visitor.request('/p/'+fixture.slug+'/lead','POST',{...lead,quantity:1.5})).status===422);
check('actual request queued honestly',(await visitor.request('/p/'+fixture.slug+'/lead','POST',lead)).status===202);
await visitor.request('/p/'+fixture.slug+'/lead','POST',lead);const leads=(await owner.request('/api/leads')).data.leads;check('duplicate prevention retained',leads.length===1);const p=leads[0].product_data;check('server trusts published price, quantity and ID',p.quantity===2&&p.unit_price===25000&&p.total===50000&&p.product_id==='987654321');check('canonical landing URL sent',p.landing_url.endsWith('/p/'+fixture.slug));
const render=await owner.request(path+'/render','POST',{slug:newSlug,content:copy});check('draft preview shows unsaved content and disabled form',render.status===200&&render.data.html.includes('Borrador B')&&!render.data.html.includes('id="lead-form"'));
check('preview renderer owner protected',(await other.request(path+'/render','POST',{slug:newSlug,content:copy})).status===404);
copy.blocks.push(block('richText',{title:'Formato',text:'<p><strong>Seguro</strong><script>alert(1)</script><a href="javascript:alert(1)">Enlace</a></p>'}));const clean=await save(copy);check('server sanitizes rich content',clean.status===200&&clean.data.landing.content.blocks.at(-1).data.text.includes('<strong>Seguro</strong>')&&!clean.data.landing.content.blocks.at(-1).data.text.includes('script')&&!clean.data.landing.content.blocks.at(-1).data.text.includes('javascript'));
const templates=await owner.request('/api/builder-templates','POST',{name:'Diseño reutilizable de prueba',blocks:c.blocks});check('reusable template saved',templates.status===200&&templates.data.templates.length===1);check('template isolated per owner',(await other.request('/api/builder-templates')).data.templates.length===0);await owner.request('/api/template-settings','PUT',{primaryColor:'#193e35'});check('visual defaults do not erase layouts',(await owner.request('/api/builder-templates')).data.templates.length===1);
check('publish draft replacement',(await owner.request(path+'/publish','POST',{})).status===200);check('new publication updates content and URL',(await visitor.request('/p/'+newSlug)).text.includes('Borrador B')&&(await visitor.request('/p/'+fixture.slug)).status===404);
await owner.request('/api/builder-templates','DELETE',{id:templates.data.templates[0].id});check('saved template deletion',(await owner.request('/api/builder-templates')).data.templates.length===0);
await owner.request(path+'/unpublish','POST',{});landing.slug=fixture.slug;await save(c);
console.log(`${checks} builder HTTP checks passed. Only isolated database used; no external orders or CRM calls.`);
