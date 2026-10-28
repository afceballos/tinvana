import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHmac,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Order confirmation of landing orders by WhatsApp: settings, form notice, automatic quote and template, button taps
// (confirm, change, stale summary, forged context), optional automatic submission to Dropi and the panel.
// Meta Graph (8446), the Dropi quote (8444) and Dropi orders (8443) are local simulators. Isolated database only.
// Ports can be moved with TEST_BASE_URL, WA_GRAPH_PORT, DROPI_QUOTE_PORT and DROPI_ORDERS_PORT (the server must point to the same ones).
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/whatsapp-helper.php',...a])).stdout;
const orders=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const SECRET=process.env.WHATSAPP_APP_SECRET;assert(SECRET,'WhatsApp test environment missing');
const PHONE='206540352242922',WABA='202290129340398',TOKEN='EAAG'+'x'.repeat(60);
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
const meta={templates:[],sends:[]};let seq=0,metaDown=false;
const graph=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
 const send=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};const url=new URL(req.url,'https://x');
 if(req.headers.authorization!=='Bearer '+TOKEN)return send(401,{error:{message:'Invalid OAuth access token.',code:190}});
 if(url.pathname==='/'+WABA+'/message_templates'){
  if(req.method==='POST'){const b=JSON.parse(raw);const id=String(9100+meta.templates.length);meta.templates.push({id,name:b.name,language:b.language,status:'PENDING',category:b.category.toUpperCase(),components:b.components});return send(200,{id,status:'PENDING'});}
  if(req.method==='GET')return send(200,{data:meta.templates.map(t=>({...t}))});
 }
 if(req.method==='GET'&&url.pathname==='/'+PHONE)return send(200,{verified_name:'Tienda Prueba',display_phone_number:'+57 300 000 0000',quality_rating:'GREEN',id:PHONE});
 if(url.pathname==='/'+WABA+'/subscribed_apps')return send(200,req.method==='POST'?{success:true}:{data:[]});
 if(req.method==='POST'&&url.pathname==='/'+PHONE+'/messages'){const b=JSON.parse(raw);meta.sends.push(b);if(metaDown)return send(400,{error:{message:'(#131026) Message undeliverable',code:131026}});b.wamid='wamid.OUT'+(++seq);return send(200,{messaging_product:'whatsapp',contacts:[{input:b.to,wa_id:b.to}],messages:[{id:b.wamid}]});}
 send(400,{error:{message:'Unsupported',code:100}});
});});
const quotes=createServer(tls,(req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({isSuccess:true,status:200,objects:[{transportadora:'ENVIA',transportadora_id:2,objects:{precioEnvio:16164}}]}));});});
const dropiOrders=[];const dropi=createServer(tls,(req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{dropiOrders.push(JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({isSuccess:true,objects:{id:880000+dropiOrders.length}}));});});
await Promise.all([new Promise(r=>graph.listen(Number(process.env.WA_GRAPH_PORT||8446),'127.0.0.1',r)),new Promise(r=>quotes.listen(Number(process.env.DROPI_QUOTE_PORT||8444),'127.0.0.1',r)),new Promise(r=>dropi.listen(Number(process.env.DROPI_ORDERS_PORT||8443),'127.0.0.1',r))]);
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
let owner,other,metaCtx,visitor,token;
const hook=value=>{const body=JSON.stringify({object:'whatsapp_business_account',entry:[{id:WABA,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'15551550926',phone_number_id:PHONE},...value}}]}]});return metaCtx.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',SECRET).update(body).digest('hex')},data:body});};
const tap=(from,payload,text,context,id='wamid.IN'+randomUUID())=>hook({contacts:[{profile:{name:'Ana Pedido'},wa_id:from}],messages:[{from,id,timestamp:String(Math.floor(Date.now()/1000)),type:'button',button:{payload,text},context:{from:'15551550926',id:context}}]});
const lead=(phone,email)=>visitor.post('/p/'+f.slug+'/lead',{headers:{'X-CSRF-Token':token},data:{csrf:token,idempotency_key:randomUUID(),first_name:'Ana',last_name:'Pedido',email,phone,phone_country:'CO',country_code:'CO',department_code:'05',city_code:'05001',address:'Calle 10 # 20-30',quantity:2,website:''}});
const settings=data=>owner.ctx.put('/api/whatsapp/confirmations',{headers:owner.H,data});
const detail=async id=>(await owner.ctx.get('/api/orders/'+id)).json();
const orderOf=async email=>{const l=(await(await owner.ctx.get('/api/leads')).json()).leads.find(x=>x.email===email);return (await(await owner.ctx.get('/api/orders')).json()).orders.find(o=>o.lead_id===l.id);};
const confirmations=async()=>JSON.parse(await helper('confirmations'));
const notifications=async()=>JSON.parse(await helper('notifications'));
const templateSend=to=>meta.sends.filter(s=>s.type==='template'&&s.to===to).at(-1);
const lastText=to=>meta.sends.filter(s=>s.type==='text'&&s.to===to).at(-1)?.text.body;
try{
 await helper('reset');await orders('reset-limits');await orders('simple');await orders('dropi-supplier');
 owner=await login(f.email);other=await login(f.otherEmail);metaCtx=await request.newContext({baseURL:base});visitor=await request.newContext({baseURL:base});
 check('fixture landing published',(await owner.ctx.post('/api/landings/'+f.landing+'/publish',{headers:owner.H})).status()===200);await orders('shipping-setup','on');
 let v=await(await owner.ctx.get('/api/whatsapp/confirmations')).json();
 check('confirmations need a connected number',v.connected===false&&v.active===false);
 await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}});
 const presets=(await(await owner.ctx.get('/api/whatsapp/templates')).json()).presets;
 await owner.ctx.post('/api/whatsapp/templates',{headers:owner.H,data:{...presets.order_confirmation,purpose:'order_confirmation'}});
 await owner.ctx.post('/api/whatsapp/templates',{headers:owner.H,data:{name:'tres_botones',category:'utility',language:'es_CO',body:'Hola {{nombre}}',examples:{nombre:'Ana'},buttons:['Sí','No','Tal vez']}});
 await owner.ctx.post('/api/whatsapp/templates',{headers:owner.H,data:{name:'variable_rara',category:'utility',language:'es_CO',body:'Hola {{apodo}}',examples:{apodo:'Ana'},buttons:['Sí','No']}});
 v=await(await owner.ctx.get('/api/whatsapp/confirmations')).json();const tpl=v.templates.find(t=>t.name==='confirmacion_pedido');
 check('confirmations are off by default with manual review',v.settings.enabled===false&&v.settings.auto_dropi===false&&v.active===false);
 check('a template waiting for Meta cannot be used',/aprueba/.test(tpl.problem)&&(await settings({...v.settings,customer_first:false,enabled:true,template_id:tpl.id})).status()===422);
 for(const t of meta.templates)t.status='APPROVED';
 await owner.ctx.post('/api/whatsapp/templates/sync',{headers:owner.H});
 v=await(await owner.ctx.get('/api/whatsapp/confirmations')).json();
 check('templates need exactly two buttons and known variables',/dos botones/.test(v.templates.find(t=>t.name==='tres_botones').problem)&&/apodo/.test(v.templates.find(t=>t.name==='variable_rara').problem)&&v.templates.find(t=>t.name==='confirmacion_pedido').problem===null);
 check('turning it on requires a template, or the number for the customer-first link',(await settings({...v.settings,customer_first:false,enabled:true,template_id:null})).status()===422&&(await settings({...v.settings,customer_first:true,enabled:true,template_id:null})).status()===422);
 check('the customer-first step is on by default with a 15-minute wait',v.settings.customer_first===true&&v.settings.wait_minutes===15);
 check('saving requires CSRF',(await owner.ctx.put('/api/whatsapp/confirmations',{headers:{'X-CSRF-Token':'bad'},data:{...v.settings,enabled:true,template_id:tpl.id}})).status()===419);
 let page=await(await visitor.get('/p/'+f.slug)).text();
 check('without confirmations the form has no WhatsApp notice',!page.includes('order-whatsapp-note'));
 let r=await settings({...v.settings,customer_first:false,enabled:true,template_id:tpl.id});v=await r.json();
 check('the store turns confirmations on',r.ok()&&v.active===true&&v.settings.template_id===tpl.id);
 check('another store cannot see these settings',(await(await other.ctx.get('/api/whatsapp/confirmations')).json()).settings.enabled===false);
 page=await(await visitor.get('/p/'+f.slug)).text();token=page.match(/name="csrf" value="([^"]+)"/)[1];
 check('the landing form says the confirmation arrives by WhatsApp',page.includes('Te enviaremos la confirmación de tu pedido por WhatsApp.'));

 // 1. New order → automatic quote → template with button payloads
 r=await lead('3001112233','wa1@example.test');
 check('the order is accepted and reports the WhatsApp confirmation',r.status()===202&&(await r.json()).whatsapp_confirmation===true);
 let o=await orderOf('wa1@example.test');let d=await detail(o.id);let sent=templateSend('573001112233');let c=(await confirmations()).find(x=>x.order_id===o.id);
 check('the summary goes out with the confirmation template',sent&&sent.template.name==='confirmacion_pedido'&&sent.template.language.code==='es_CO');
 const params=sent.template.components[0].parameters.map(p=>p.text);
 check('the summary uses the landing price and the freight quoted by Dropi',params[0]==='Ana'&&params[1]===d.order.product_data.product_name&&params[2]==='2'&&params[3]==='$'+Number(d.order.total).toLocaleString('de-DE')&&params[4]==='Calle 10 # 20-30'&&params[5]==='Medellín'&&d.order.shipping_price!==null);
 check('each button carries its own payload',sent.template.components[1].sub_type==='quick_reply'&&sent.template.components[1].index==='0'&&sent.template.components[1].parameters[0].payload==='tvc:'+c.id+':ok'&&sent.template.components[2].parameters[0].payload==='tvc:'+c.id+':change');
 check('the order is quoted automatically and waits for the customer',d.order.quote_id&&d.order.sale_status==='draft'&&d.events.some(e=>e.event_type==='auto_quoted')&&d.events.some(e=>e.event_type==='whatsapp_confirmation_sent')&&d.whatsapp.status==='sent'&&!d.whatsapp.can_send);
 let chat=await(await owner.ctx.get('/api/whatsapp/conversations/'+c.conversation_id)).json();
 check('the chat starts with an advisor and shows the template',chat.conversation.owner_mode==='human'&&/Confirmación del pedido/.test(chat.conversation.handoff_reason)&&chat.messages.at(-1).type==='template'&&chat.messages.at(-1).body.includes('Ana'));

 // 2. Forged or foreign taps do nothing
 await tap('573001112233','tvc:'+c.id+':ok','Confirmar pedido','wamid.NOT-OURS');
 d=await detail(o.id);check('a tap whose context is not our message does not confirm',d.order.sale_status==='draft');
 await tap('573009999999','tvc:'+c.id+':ok','Confirmar pedido',sent.wamid);
 d=await detail(o.id);check('a tap from another phone does not confirm',d.order.sale_status==='draft');

 // 3. Confirm
 const ourWamid=sent.wamid;
 const okTap='wamid.IN-ok-'+randomUUID();await tap('573001112233','tvc:'+c.id+':ok','Confirmar pedido',ourWamid,okTap);
 d=await detail(o.id);
 check('the customer confirms with the button and the order is confirmed with that evidence',d.order.sale_status==='confirmed'&&d.order.confirmation.method==='whatsapp_button'&&d.order.confirmation.reply_wamid===okTap&&d.order.confirmation.template_wamid===ourWamid&&/Confirmar pedido/.test(d.order.confirmation.evidence));
 check('by default it waits for manual review before Dropi',d.order.integration_status==='not_sent'&&dropiOrders.length===0&&d.dropi.can_submit===true);
 check('the customer receives the confirmation message',/confirmado/.test(lastText('573001112233')));
 check('the store is notified',(await notifications()).some(n=>n.kind==='order_confirmed'&&n.link==='/panel/pedidos/'+o.id));
 chat=await(await owner.ctx.get('/api/whatsapp/conversations/'+c.conversation_id)).json();
 check('the tap appears in the chat and the AI did not answer it',chat.messages.some(m=>m.type==='button'&&m.body==='Confirmar pedido')&&!chat.messages.some(m=>m.sender==='ai'));
 const before=meta.sends.length;await tap('573001112233','tvc:'+c.id+':ok','Confirmar pedido',ourWamid,okTap);await tap('573001112233','tvc:'+c.id+':ok','Confirmar pedido',ourWamid);
 check('repeating the tap sends nothing again',meta.sends.length===before&&(await detail(o.id)).events.filter(e=>e.event_type==='confirmed').length===1);

 // 4. Change
 await lead('3002223344','wa2@example.test');const o2=await orderOf('wa2@example.test');const c2=(await confirmations()).find(x=>x.order_id===o2.id);const w2=templateSend('573002223344').wamid;
 await tap('573002223344','tvc:'+c2.id+':change','Cambiar algo',w2);
 d=await detail(o2.id);chat=await(await owner.ctx.get('/api/whatsapp/conversations/'+c2.conversation_id)).json();
 check('«Cambiar algo» keeps the order in draft and passes the chat to an advisor',d.order.sale_status==='draft'&&d.whatsapp.status==='change'&&chat.conversation.owner_mode==='human'&&/cambiar/.test(chat.conversation.handoff_reason)&&/asesor/.test(lastText('573002223344'))&&(await notifications()).some(n=>n.kind==='order_change'));
 check('after a change the store can send a new summary from the order',d.whatsapp.can_send===true);

 // 5. Stale summary: the store changed the quote after sending it
 await lead('3003334455','wa3@example.test');const o3=await orderOf('wa3@example.test');const c3=(await confirmations()).find(x=>x.order_id===o3.id);const w3=templateSend('573003334455').wamid;
 d=await detail(o3.id);await owner.ctx.post('/api/orders/'+o3.id+'/quote',{headers:owner.H,data:{version:d.order.version,quantity:3,unit_price:d.order.unit_price,shipping_price:d.order.shipping_price,notes:''}});
 await tap('573003334455','tvc:'+c3.id+':ok','Confirmar pedido',w3);
 d=await detail(o3.id);
 check('confirming a summary that changed does not confirm the order',d.order.sale_status==='draft'&&d.whatsapp.status==='stale'&&/cambió/.test(lastText('573003334455')));
 r=await owner.ctx.post('/api/orders/'+o3.id+'/whatsapp',{headers:owner.H,data:{version:d.order.version}});d=await r.json();
 const resent=meta.sends.filter(x=>x.to==='573003334455').at(-1),w3b=resent.wamid;
 check('the store sends the new summary from the order; with the chat open it uses buttons, not a template',r.ok()&&d.whatsapp.status==='sent'&&d.whatsapp.origin==='manual'&&d.whatsapp.channel==='interactive'&&resent.type==='interactive'&&/\(3 und\.\)/.test(resent.interactive.body.text));
 await tap('573003334455','tvc:'+c3.id+':ok','Confirmar pedido',w3);
 check('a tap on the old summary no longer confirms',(await detail(o3.id)).order.sale_status==='draft');
 await hook({contacts:[{profile:{name:'Ana Pedido'},wa_id:'573003334455'}],messages:[{from:'573003334455',id:'wamid.IN'+randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),type:'interactive',interactive:{type:'button_reply',button_reply:{id:'tvc:'+c3.id+':ok',title:'Confirmar pedido'}},context:{from:'15551550926',id:w3b}}]});
 check('a tap on the new summary confirms',(await detail(o3.id)).order.sale_status==='confirmed');

 // 6. Automatic submission to Dropi
 v=await(await owner.ctx.get('/api/whatsapp/confirmations')).json();await settings({...v.settings,auto_dropi:true});
 await lead('3004445566','wa4@example.test');const o4=await orderOf('wa4@example.test');const c4=(await confirmations()).find(x=>x.order_id===o4.id);const w4=templateSend('573004445566').wamid;
 await tap('573004445566','tvc:'+c4.id+':ok','Confirmar pedido',w4);
 d=await detail(o4.id);const started=d.events.find(e=>e.event_type==='dropi_submit_started');
 check('with automatic submission the confirmed order goes to Dropi pending confirmation',d.order.integration_status==='sent'&&d.order.dropi_order_id==='880001'&&dropiOrders.length===1&&dropiOrders[0].status==='PENDIENTE CONFIRMACION'&&started.data.automatic===true);

 // 7. Skipped without Dropi freight, and Meta refusing the template
 await orders('shipping-setup','off');await lead('3005556677','wa5@example.test');const o5=await orderOf('wa5@example.test');
 d=await detail(o5.id);
 check('without a Dropi freight nothing is invented: the summary is not sent',d.whatsapp.status==='skipped'&&/envío/.test(d.whatsapp.error)&&!templateSend('573005556677')&&!d.whatsapp.can_send&&d.order.quote_id===null);
 metaDown=true;await orders('shipping-setup','on');await lead('3006667788','wa6@example.test');metaDown=false;const o6=await orderOf('wa6@example.test');d=await detail(o6.id);
 check('a template refused by Meta is reported and not retried by itself',d.whatsapp.status==='failed'&&/destinatario/.test(d.whatsapp.error)&&meta.sends.filter(s=>s.to==='573006667788').length===1&&d.whatsapp.can_send===true);

 // 8. Isolation and switch off
 check('another store cannot send the confirmation of this order',(await other.ctx.post('/api/orders/'+o6.id+'/whatsapp',{headers:other.H,data:{version:d.order.version}})).status()===404);
 v=await(await owner.ctx.get('/api/whatsapp/confirmations')).json();await settings({...v.settings,enabled:false});
 page=await(await visitor.get('/p/'+f.slug)).text();token=page.match(/name="csrf" value="([^"]+)"/)[1];
 r=await lead('3007778899','wa7@example.test');
 check('turned off: no notice and no confirmation',!page.includes('order-whatsapp-note')&&(await r.json()).whatsapp_confirmation===false&&!templateSend('573007778899'));
 await settings({...v.settings,enabled:true});

 // 9. Customer writes first: link in the response, code message, interactive buttons without a template
 const text=(from,body,id='wamid.IN'+randomUUID())=>hook({contacts:[{profile:{name:'Ana Pedido'},wa_id:from}],messages:[{from,id,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body}}]});
 const press=(from,id,title,context)=>hook({contacts:[{profile:{name:'Ana Pedido'},wa_id:from}],messages:[{from,id:'wamid.IN'+randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),type:'interactive',interactive:{type:'button_reply',button_reply:{id,title}},context:{from:'15551550926',id:context}}]});
 const poke=()=>hook({statuses:[{id:'wamid.UNKNOWN-'+randomUUID(),status:'delivered',timestamp:String(Math.floor(Date.now()/1000)),recipient_id:'573000000001'}]});
 check('«Probar conexión» stores the number for the WhatsApp link',(await owner.ctx.post('/api/whatsapp/account/test',{headers:owner.H})).ok());
 v=await(await owner.ctx.get('/api/whatsapp/confirmations')).json();r=await settings({...v.settings,customer_first:true,wait_minutes:15,auto_dropi:false});
 check('the store turns on the customer-first step',r.ok()&&(await r.json()).settings.customer_first===true);
 page=await(await visitor.get('/p/'+f.slug)).text();token=page.match(/name="csrf" value="([^"]+)"/)[1];
 let res=await(await lead('3008889900','wa8@example.test')).json();const o8=await orderOf('wa8@example.test');d=await detail(o8.id);
 const code=res.whatsapp?.code;
 check('the form response brings the WhatsApp link with the order code',/^TV-[A-Z2-9]{6}$/.test(code)&&res.whatsapp.link==='https://wa.me/573000000000?text='+encodeURIComponent('Hola, quiero confirmar mi pedido '+code));
 check('nothing is sent until the customer writes',!meta.sends.some(s=>s.to==='573008889900')&&d.whatsapp.status==='queued'&&d.whatsapp.waiting_customer===true&&d.whatsapp.hint.includes(code)&&d.order.quote_id===null);
 await text('573118887766','Hola, quiero confirmar mi pedido '+code.toLowerCase());
 const inter=meta.sends.filter(s=>s.to==='573118887766').at(-1);d=await detail(o8.id);
 check('when the customer sends the code the summary goes out with buttons and no template',inter?.type==='interactive'&&inter.interactive.type==='button'&&inter.interactive.action.buttons.map(b=>b.reply.title).join('|')==='Confirmar pedido|Cambiar algo'&&/Ana/.test(inter.interactive.body.text)&&d.whatsapp.status==='sent'&&d.whatsapp.channel==='interactive'&&d.order.quote_id!==null);
 check('the reply goes to the number that wrote, even if the form had another one',!meta.sends.some(s=>s.to==='573008889900'));
 chat=await(await owner.ctx.get('/api/whatsapp/conversations/'+d.whatsapp.conversation_id)).json();
 check('the AI did not answer the code message',!chat.messages.some(m=>m.sender==='ai'));
 const n=meta.sends.length;await text('573118887766','Hola, quiero confirmar mi pedido '+code);
 check('sending the code again does not resend the summary',meta.sends.length===n);
 await press('573118887766',inter.interactive.action.buttons[0].reply.id,'Confirmar pedido','wamid.NOT-OURS');
 check('an interactive tap with a foreign context does not confirm',(await detail(o8.id)).order.sale_status==='draft');
 await press('573118887766',inter.interactive.action.buttons[0].reply.id,'Confirmar pedido',inter.wamid);d=await detail(o8.id);
 check('the interactive «Confirmar pedido» confirms the order with that evidence',d.order.sale_status==='confirmed'&&d.order.confirmation.method==='whatsapp_button'&&d.order.confirmation.template_wamid===inter.wamid&&/confirmado/.test(lastText('573118887766')));
 // Fallback: the customer does not write
 res=await(await lead('3009990000','wa9@example.test')).json();const o9=await orderOf('wa9@example.test');
 await helper('confirm-due');await poke();d=await detail(o9.id);
 check('if the customer does not write, the template goes out after the wait',templateSend('573009990000')?.template.name==='confirmacion_pedido'&&d.whatsapp.status==='sent'&&d.whatsapp.channel==='template');
 check('the old code no longer triggers anything after the template',await text('573009990000','Hola, quiero confirmar mi pedido '+res.whatsapp.code).then(()=>meta.sends.filter(s=>s.to==='573009990000').length===1));
 // The store sends now from the order while waiting for the customer
 await lead('3001010101','wa11@example.test');const o11=await orderOf('wa11@example.test');d=await detail(o11.id);
 await owner.ctx.post('/api/orders/'+o11.id+'/quote',{headers:owner.H,data:{version:d.order.version,quantity:d.order.quantity,unit_price:d.order.unit_price,shipping_price:d.order.shipping_price,notes:''}});d=await detail(o11.id);
 check('while waiting, the store can send the summary now from the order',d.whatsapp.can_send===true&&(await(await owner.ctx.post('/api/orders/'+o11.id+'/whatsapp',{headers:owner.H,data:{version:d.order.version}})).json()).whatsapp.status==='sent'&&templateSend('573001010101'));
 // Without a fallback template
 v=await(await owner.ctx.get('/api/whatsapp/confirmations')).json();r=await settings({...v.settings,template_id:null});
 res=await(await lead('3002020202','wa10@example.test')).json();const o10=await orderOf('wa10@example.test');
 check('without a template the step still works and nothing else is sent',r.ok()&&(await r.json()).active===true&&/^TV-/.test(res.whatsapp.code));
 await helper('confirm-due');await poke();d=await detail(o10.id);
 check('without a template, a customer who never writes gets nothing',d.whatsapp.status==='skipped'&&/no escribió/.test(d.whatsapp.error)&&!meta.sends.some(s=>s.to==='573002020202'));
 await settings({...v.settings,template_id:tpl.id});

 // 10. Panel
 browser=await chromium.launch({channel:'msedge',headless:true});const ctx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const st=await owner.ctx.storageState();await ctx.addCookies(st.cookies);const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/panel/whatsapp/confirmaciones');await p.getByRole('heading',{name:'Confirmaciones enviadas'}).waitFor();
 check('the Confirmaciones tab shows the settings and the latest sends',await p.getByRole('link',{name:'Confirmaciones'}).getAttribute('aria-current')==='page'&&await p.locator('.wc-list li').count()>=6&&await p.getByText('Confirmado por el cliente').first().isVisible());
 await p.screenshot({path:'test-results/whatsapp-confirm-settings.png',fullPage:true});
 await p.goto(base+'/panel/pedidos/'+o2.id);await p.getByRole('heading',{name:'Confirmación por WhatsApp'}).waitFor();
 check('the order shows the WhatsApp confirmation with the chat link',await p.locator('.od-chip',{hasText:'Pidió cambios'}).isVisible()&&await p.getByRole('link',{name:'Abrir chat'}).isVisible()&&await p.getByRole('button',{name:'Enviar nuevo resumen'}).isVisible());
 await p.screenshot({path:'test-results/whatsapp-confirm-order.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});await p.goto(base+'/panel/whatsapp/confirmaciones');await p.getByRole('heading',{name:'Confirmaciones enviadas'}).waitFor();
 check('the page fits a phone screen',await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await p.screenshot({path:'test-results/whatsapp-confirm-mobile.png',fullPage:true});
 const lp=await ctx.newPage();await lp.goto(base+'/p/'+f.slug);await lp.locator('[data-buy]').first().click();await lp.locator('#purchase-dialog .order-whatsapp-note').waitFor();
 check('the notice is visible in the purchase form',await lp.locator('#purchase-dialog .order-whatsapp-note').isVisible());
 await lp.locator('#purchase-dialog .order-whatsapp-note').screenshot({path:'test-results/whatsapp-confirm-notice.png'});
 // Success popup with the WhatsApp button (the lead request is answered by the browser route, nothing is stored).
 const wa={link:'https://wa.me/573000000000?text='+encodeURIComponent('Hola, quiero confirmar mi pedido TV-ABC234'),code:'TV-ABC234'};
 await lp.route('**/lead',x=>x.fulfill({status:202,contentType:'application/json',body:JSON.stringify({saved:true,whatsapp_confirmation:true,whatsapp:wa,delivery_status:'pending',message:'Tu consulta fue guardada.'})}));
 const m=lp.locator('#purchase-dialog');await m.locator('.iti').waitFor();
 await m.locator('[name=first_name]').fill('Ana');await m.locator('[name=last_name]').fill('Popup');await m.locator('[name=email]').fill('popup@example.test');await m.locator('[name=phone]').fill('3001234567');
 await m.locator('[name=department_code]').selectOption('11');await m.locator('[name=city_code]').selectOption('11001');await m.locator('[name=address]').fill('Calle 10 # 20-30');
 await m.getByRole('button',{name:/Enviar solicitud/}).click();const pop=lp.locator('dialog.lead-success');await pop.locator('.ls-wa').waitFor();
 check('the success popup invites the customer to confirm by WhatsApp with the code',await pop.locator('.ls-wa').getAttribute('href')===wa.link&&await pop.locator('.ls-wa').getAttribute('target')==='_blank'&&(await pop.locator('.ls-code').innerText()).includes('TV-ABC234')&&await pop.getByRole('button',{name:'Ahora no'}).isVisible());
 await lp.waitForTimeout(1500);await pop.screenshot({path:'test-results/whatsapp-confirm-popup.png'});
 await pop.getByRole('button',{name:'Ahora no'}).click();await pop.waitFor({state:'detached'});check('«Ahora no» closes the popup',await pop.count()===0);
 check('no browser errors',errors.length===0);
 console.log(`${checks} WhatsApp order confirmation checks passed. Nothing reached Meta or Dropi.`);
}finally{await orders('shipping-setup','off').catch(()=>{});await helper('reset').catch(()=>{});await browser?.close();graph.close();quotes.close();dropi.close();}
