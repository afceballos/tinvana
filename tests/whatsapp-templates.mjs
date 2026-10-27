import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHmac,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// WhatsApp templates (create/list/delete through the simulated Graph API), new chat and template in a closed window.
// Nothing reaches Meta. Local isolated database only.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/whatsapp-helper.php',...a])).stdout;
const SECRET=process.env.WHATSAPP_APP_SECRET;assert(SECRET,'WhatsApp test environment missing');
const PHONE='106540352242922',WABA='102290129340398',TOKEN='EAAG'+'x'.repeat(60);
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
const meta={templates:[{id:'9001',name:'promo_externa',language:'es_CO',status:'APPROVED',category:'MARKETING',components:[{type:'BODY',text:'Hola {{1}}, tenemos {{2}} para ti.'},{type:'BUTTONS',buttons:[{type:'QUICK_REPLY',text:'Me interesa'}]}]}],creates:[],deletes:[],sends:[]};let seq=0;
const graph=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
 const send=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};const url=new URL(req.url,'https://x');
 if(req.headers.authorization!=='Bearer '+TOKEN)return send(401,{error:{message:'Invalid OAuth access token.',code:190}});
 if(url.pathname==='/'+WABA+'/message_templates'){
  if(req.method==='POST'){const b=JSON.parse(raw);meta.creates.push(b);if(b.name==='rechazar_ya')return send(400,{error:{message:'Invalid parameter',code:100,error_user_msg:'El contenido incumple las políticas de WhatsApp.'}});const id=String(9100+meta.creates.length);meta.templates.push({id,name:b.name,language:b.language,status:'PENDING',category:b.category.toUpperCase(),components:b.components});return send(200,{id,status:'PENDING',category:b.category.toUpperCase()});}
  if(req.method==='GET'){const fields=url.searchParams.get('fields');return send(200,{data:meta.templates.map(t=>({...t})),fields});}
  if(req.method==='DELETE'){meta.deletes.push(Object.fromEntries(url.searchParams));meta.templates=meta.templates.filter(t=>t.id!==url.searchParams.get('hsm_id'));return send(200,{success:true});}
 }
 if(req.method==='POST'&&url.pathname==='/'+PHONE+'/messages'){const b=JSON.parse(raw);meta.sends.push(b);return send(200,{messaging_product:'whatsapp',contacts:[{input:b.to,wa_id:b.to}],messages:[{id:'wamid.OUT'+(++seq)}]});}
 send(400,{error:{message:'Unsupported',code:100}});
});});
await new Promise(r=>graph.listen(8446,'127.0.0.1',r));
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
let owner,other,metaCtx;
const hook=value=>{const body=JSON.stringify({object:'whatsapp_business_account',entry:[{id:WABA,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'15551550926',phone_number_id:PHONE},...value}}]}]});return metaCtx.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',SECRET).update(body).digest('hex')},data:body});};
const list=async()=>(await owner.ctx.get('/api/whatsapp/templates')).json();
const create=data=>owner.ctx.post('/api/whatsapp/templates',{headers:owner.H,data});
try{
 await helper('reset');
 owner=await login(f.email);other=await login(f.otherEmail);metaCtx=await request.newContext({baseURL:base});
 check('templates need a connected number',(await create({name:'x',category:'utility',language:'es_CO',body:'Hola'})).status()===409);
 await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}});
 let v=await list();
 check('two suggested templates are offered: order confirmation and greeting',v.presets.order_confirmation.buttons.join('|')==='Confirmar pedido|Cambiar algo'&&v.presets.greeting.category==='marketing'&&v.templates.length===0);
 // Validation
 check('the name must be lowercase with underscores',(await create({name:'Mi Plantilla',category:'utility',language:'es_CO',body:'Hola'})).status()===422);
 check('each variable needs an example for Meta',(await create({name:'sin_ejemplo',category:'utility',language:'es_CO',body:'Hola {{nombre}}'})).status()===422);
 check('badly written variables are refused',(await create({name:'mal',category:'utility',language:'es_CO',body:'Hola {{ Nombre Completo }}',examples:{}})).status()===422);
 check('buttons are limited to 25 characters and 3 buttons',(await create({name:'btn',category:'utility',language:'es_CO',body:'Hola',buttons:['x'.repeat(26)]})).status()===422&&(await create({name:'btn',category:'utility',language:'es_CO',body:'Hola',buttons:['a','b','c','d']})).status()===422);
 check('only the offered Spanish languages are accepted',(await create({name:'idioma',category:'utility',language:'en_US',body:'Hola'})).status()===422);
 check('creating requires CSRF',(await owner.ctx.post('/api/whatsapp/templates',{headers:{'X-CSRF-Token':'bad'},data:{name:'x',category:'utility',language:'es_CO',body:'Hola'}})).status()===419&&meta.creates.length===0);
 // Create the suggested order confirmation
 const p=v.presets.order_confirmation;let r=await create({...p,purpose:'order_confirmation'});v=await r.json();
 const sent=meta.creates.at(-1);
 check('the template goes to Meta with positional variables, examples, footer and quick replies',r.ok()&&sent.name==='confirmacion_pedido'&&sent.language==='es_CO'&&sent.category==='utility'&&sent.components[0].type==='BODY'&&sent.components[0].text.startsWith('Hola {{1}}, recibimos tu pedido de {{2}} ({{3}} und.).')&&JSON.stringify(sent.components[0].example.body_text)===JSON.stringify([['Laura','Picatodo eléctrico','1','$68.000','Cra 7 # 19-40','Pereira']])&&sent.components[1].type==='FOOTER'&&JSON.stringify(sent.components[2])===JSON.stringify({type:'BUTTONS',buttons:[{type:'QUICK_REPLY',text:'Confirmar pedido'},{type:'QUICK_REPLY',text:'Cambiar algo'}]}));
 check('the new template is pending review and keeps friendly variables',v.templates[0].status==='PENDING'&&v.templates[0].body.startsWith('Hola {{nombre}}')&&v.templates[0].variables.map(x=>x.key).join(',')==='nombre,producto,cantidad,total,direccion,ciudad'&&!v.templates[0].sendable);
 check('the same name and language cannot be created twice',(await create({...p})).status()===409);
 r=await create({name:'rechazar_ya',category:'marketing',language:'es_CO',body:'Hola'});
 check("Meta's refusal is explained to the user",r.status()===502&&(await r.json()).error.includes('políticas'));
 // Sync: approvals and templates created in Meta
 meta.templates.find(t=>t.name==='confirmacion_pedido').status='APPROVED';
 v=await(await owner.ctx.post('/api/whatsapp/templates/sync',{headers:owner.H})).json();
 const conf=v.templates.find(t=>t.name==='confirmacion_pedido'),ext=v.templates.find(t=>t.name==='promo_externa');
 check('syncing brings the approval from Meta',conf.status==='APPROVED'&&conf.sendable);
 check('templates created in WhatsApp Manager are imported with fillable variables',ext&&ext.purpose==='external'&&ext.body==='Hola {{var1}}, tenemos {{var2}} para ti.'&&ext.variables.length===2&&ext.buttons[0]==='Me interesa');
 // New chat
 const chat=data=>owner.ctx.post('/api/whatsapp/chats',{headers:owner.H,data});
 check('a new chat requires the customer permission',(await chat({template_id:conf.id,phone:'3001112233',values:{}})).status()===422);
 check('a pending template cannot be sent',(await create({name:'pendiente',category:'utility',language:'es_CO',body:'Hola'})).ok()&&(await chat({template_id:(await list()).templates.find(t=>t.name==='pendiente').id,phone:'3001112233',consent:true})).status()===409);
 check('every variable must be filled',(await chat({template_id:conf.id,phone:'3001112233',consent:true,values:{nombre:'Laura'}})).status()===422&&meta.sends.length===0);
 const values={nombre:'Laura',producto:'Picatodo',cantidad:'2',total:'$119.000',direccion:'Cra 7 # 19-40',ciudad:'Pereira'};
 r=await chat({template_id:conf.id,phone:'300 111 2233',name:'Laura Gómez',consent:true,values});let res=await r.json();
 const tsend=meta.sends.at(-1);
 check('a new chat sends the template with its values to the Colombian number',r.ok()&&tsend.type==='template'&&tsend.to==='573001112233'&&tsend.template.name==='confirmacion_pedido'&&tsend.template.language.code==='es_CO'&&JSON.stringify(tsend.template.components[0].parameters.map(x=>x.text))===JSON.stringify(Object.values(values)));
 let d=await(await owner.ctx.get('/api/whatsapp/conversations/'+res.conversation_id)).json();
 check('the chat starts with the advisor and shows the template text with the values',d.conversation.owner_mode==='human'&&d.conversation.handoff_reason==='Chat iniciado por la tienda'&&d.messages[0].type==='template'&&d.messages[0].sender==='template'&&d.messages[0].body.startsWith('Hola Laura, recibimos tu pedido de Picatodo (2 und.).'));
 check('free text is still refused until the customer answers (window closed)',(await owner.ctx.post(`/api/whatsapp/conversations/${res.conversation_id}/messages`,{headers:owner.H,data:{client_id:randomUUID(),body:'¿Hola?'}})).status()===409);
 // The customer taps a quick reply of the template
 await hook({contacts:[{profile:{name:'Laura Gómez'},wa_id:'573001112233'}],messages:[{context:{from:'15551550926',id:'wamid.OUT1'},from:'573001112233',id:'wamid.BTN1',timestamp:String(Math.floor(Date.now()/1000)),type:'button',button:{payload:'Confirmar pedido',text:'Confirmar pedido'}}]});
 d=await(await owner.ctx.get('/api/whatsapp/conversations/'+res.conversation_id)).json();
 check('the button reply arrives as the customer message and opens the window',d.messages.at(-1).body==='Confirmar pedido'&&d.messages.at(-1).direction==='in'&&d.conversation.window_open);
 check('now the advisor can write freely',(await owner.ctx.post(`/api/whatsapp/conversations/${res.conversation_id}/messages`,{headers:owner.H,data:{client_id:randomUUID(),body:'¡Gracias Laura!'}})).ok());
 // Template in an existing chat with the window closed
 await helper('age-window');
 r=await owner.ctx.post(`/api/whatsapp/conversations/${res.conversation_id}/template`,{headers:owner.H,data:{template_id:ext.id,consent:true,values:{var1:'Laura',var2:'un descuento'}}});
 check('after 24 hours a template can still be sent in the same chat',r.ok()&&meta.sends.at(-1).template.name==='promo_externa'&&(await r.json()).conversation_id===res.conversation_id);
 // Delete and isolation
 check('another store cannot see or use these templates',(await(await other.ctx.get('/api/whatsapp/templates')).json()).templates.length===0&&(await other.ctx.post('/api/whatsapp/chats',{headers:other.H,data:{template_id:conf.id,phone:'3001112233',consent:true,values}})).status()===404&&(await other.ctx.delete('/api/whatsapp/templates/'+conf.id,{headers:other.H})).status()===409);
 v=await(await owner.ctx.delete('/api/whatsapp/templates/'+ext.id,{headers:owner.H})).json();
 check('deleting removes it in Meta by id and name',meta.deletes.at(-1).hsm_id==='9001'&&meta.deletes.at(-1).name==='promo_externa'&&!v.templates.some(t=>t.id===ext.id));
 // Panel
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1440,height:1000}});const page=await ctx.newPage();page.on('pageerror',x=>errors.push(x.message));
 await page.goto(base+'/panel/whatsapp/plantillas');await page.locator('.tpl-list li').first().waitFor();
 check('the Plantillas tab lists templates with their status',(await page.locator('.tpl-list').innerText()).includes('Aprobada')&&(await page.locator('.tpl-list').innerText()).includes('En revisión'));
 await page.getByRole('button',{name:'Usar y revisar'}).first().click();await page.locator('.tpl-editor').waitFor();
 check('a suggested template opens in the editor with its preview',(await page.locator('.tpl-editor .tpl-preview').innerText()).includes('Sí, por favor'));
 await page.waitForTimeout(500);await page.screenshot({path:'test-results/whatsapp-templates.png',fullPage:true});
 await page.goto(base+'/panel/whatsapp');await page.getByRole('button',{name:'Nuevo chat'}).click();await page.locator('.tpl-dialog').waitFor();
 await page.locator('.tpl-dialog input[inputmode=tel]').fill('+57 310 555 6677');await page.locator('.tpl-dialog input').nth(1).fill('Carlos Ruiz');
 for(const [k,val] of Object.entries({producto:'Cepillo',cantidad:'1',total:'$59.000',direccion:'Calle 10',ciudad:'Cali'}))await page.locator('.tpl-dialog label',{hasText:'{{'+k+'}}'}).locator('input').fill(val);
 check('the dialog prefills the name variable and blocks sending without permission',(await page.locator('.tpl-dialog label',{hasText:'{{nombre}}'}).locator('input').inputValue())==='Carlos'&&await page.locator('.tpl-dialog button.primary').isDisabled());
 await page.waitForTimeout(300);await page.screenshot({path:'test-results/whatsapp-new-chat.png'});
 await page.locator('.tpl-dialog .wa-check').click();await page.locator('.tpl-dialog button.primary').click();await page.waitForURL(/\/panel\/whatsapp\/[a-f0-9-]{36}$/);
 check('sending from the panel opens the new chat',(await page.locator('.wa-chat-who strong').innerText())==='Carlos Ruiz'&&meta.sends.at(-1).to==='573105556677');
 await page.goto(base+'/panel/whatsapp/'+res.conversation_id);await page.locator('.wa-send-template').waitFor();
 check('a chat with the window closed offers «Enviar plantilla»',await page.locator('.wa-send-template').isVisible());
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/panel/whatsapp/plantillas');await page.locator('.tpl-list').waitFor();
 check('the Plantillas tab fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('no browser errors',errors.length===0);
 console.log(`${checks} WhatsApp template checks passed against a simulated Meta. Nothing reached Meta.`);
}finally{await helper('reset').catch(()=>{});await browser?.close();await owner?.ctx.dispose();await other?.ctx.dispose();await metaCtx?.dispose();graph.close();}
