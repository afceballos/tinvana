// Wompi phase 3: the payment link of an online order by WhatsApp. From the order (inside the 24-hour window, and the
// wa.me fallback outside it), from the AI agent (action payment_link; the server writes the link) and the reminder of
// an order still unpaid after 24 hours. Meta Graph (8446), OpenAI (8447) and Wompi (8449) are local simulators.
// Runs only against the isolated local test database (tests/run-suites.ps1 -Only wompi-whatsapp).
import {request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHmac,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const wa=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/whatsapp-helper.php',...a])).stdout;
const orders=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const SECRET=process.env.WHATSAPP_APP_SECRET;assert(SECRET,'WhatsApp test environment missing');
const PHONE='206540352242922',WABA='202290129340398',TOKEN='EAAG'+'x'.repeat(60);
const K={public_key:'pub_test_FakePublicKey000000000001',private_key:'prv_test_FakePrivateKey00000000001',events_secret:'test_events_FakeEventsSecret0000001',integrity_secret:'test_integrity_FakeIntegrity00000001'};
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
const sends=[];let seq=0;
const graph=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const send=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};const url=new URL(req.url,'https://x');
 if(req.method==='GET'&&url.pathname==='/'+PHONE)return send(200,{verified_name:'Tienda Prueba',display_phone_number:'+57 300 000 0000',quality_rating:'GREEN',id:PHONE});
 if(url.pathname==='/'+WABA+'/subscribed_apps')return send(200,req.method==='POST'?{success:true}:{data:[]});
 if(url.pathname==='/'+WABA+'/message_templates')return send(200,{data:[]});
 if(req.method==='POST'&&url.pathname==='/'+PHONE+'/messages'){const b=JSON.parse(raw);sends.push(b);return send(200,{messaging_product:'whatsapp',contacts:[{input:b.to,wa_id:b.to}],messages:[{id:'wamid.OUT'+(++seq)}]});}
 send(400,{error:{message:'Unsupported',code:100}});});});
const ai=[];
const openai=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const p=JSON.parse(raw);const input=JSON.parse(p.input[0].content);ai.push(input);
 const reply=obj=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(obj)}]}],usage:{input_tokens:100,output_tokens:20}}));};
 const empty={name:'',city:'',department:'',address:'',neighborhood:'',reference:'',quantity:'',variant:''};const last=[...input.history].reverse().find(m=>m.from==='cliente')?.text||'';
 // The AI asks for the link; it never writes it (the test reply carries a fake URL that must not reach the customer).
 if(/pagar/i.test(last))return reply({reply:'Aquí está: https://falso.example/pago',intent:'pagar',product_id:'',captured:empty,action:'payment_link',handoff_reason:'',order_number:'',memory:''});
 reply({reply:'¡Hola! ¿En qué te ayudo?',intent:'info',product_id:'',captured:empty,action:'none',handoff_reason:'',order_number:'',memory:''});});});
const wompi=createServer(tls,(req,res)=>{const json=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 if(req.url===`/v1/merchants/${K.public_key}`)return json(200,{data:{name:'Comercio simulado',accepted_payment_methods:['CARD']}});
 if(req.url.startsWith('/v1/transactions'))return json(req.headers.authorization===`Bearer ${K.private_key}`?200:401,{data:[]});json(404,{});});
await Promise.all([new Promise(r=>graph.listen(8446,'127.0.0.1',r)),new Promise(r=>openai.listen(8447,'127.0.0.1',r)),new Promise(r=>wompi.listen(8449,'127.0.0.1',r))]);
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
let n=0,meta,owner,visitor,token;
const say=(from,name,text)=>{const body=JSON.stringify({object:'whatsapp_business_account',entry:[{id:WABA,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'15551550926',phone_number_id:PHONE},contacts:[{profile:{name},wa_id:from}],messages:[{from,id:'wamid.IN'+(++n)+'.'+randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:text}}]}}]}]});return meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',SECRET).update(body).digest('hex')},data:body});};
// The agent may still hold the chat lock from the previous answer: run the WhatsApp worker like the cron does.
const work=async()=>{await new Promise(r=>setTimeout(r,1500));await run('powershell',['-NoProfile','-Command','.tools/run-test-command.ps1 backend/bin/console.php whatsapp:work']);};
const lastText=to=>sends.filter(s=>s.type==='text'&&s.to===to).at(-1)?.text.body||'';
const detail=async id=>(await owner.ctx.get('/api/orders/'+id)).json();
const sendLink=async(id,channel='whatsapp')=>(await owner.ctx.post('/api/orders/'+id+'/payment-link',{headers:owner.H,data:{channel}}));
const CUSTOMER='573001112233';
try{
 await wa('reset');owner=await login(f.email);meta=await request.newContext({baseURL:base});visitor=await request.newContext({baseURL:base});
 await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}});
 await owner.ctx.put('/api/ai/connections/openai',{headers:owner.H,data:{key:'test-key-agent-openai-123456789'}});await owner.ctx.post('/api/ai/connections/openai/activate',{headers:owner.H});await wa('all-hours');
 // The agent answers only with an approved product sheet.
 const sheet={summary:'Producto de prueba.',can_say:'- Llega a todo el país',price_note:'',faq:[],must_not:'No prometer tiempos exactos.'};
 await owner.ctx.put('/api/whatsapp/sheets/'+f.product,{headers:owner.H,data:{content:sheet}});await owner.ctx.post('/api/whatsapp/sheets/'+f.product+'/approve',{headers:owner.H});
 await owner.ctx.put('/api/wompi/account',{headers:owner.H,data:K});
 await owner.ctx.post('/api/landings/'+f.landing+'/publish',{headers:owner.H});await orders('payment-setup','online','0');
 // The customer writes first (24-hour window open), then orders online from the landing with the same phone.
 await say(CUSTOMER,'Ana Pago','Hola');
 token=(await(await visitor.get('/p/'+f.slug)).text()).match(/name="csrf" value="([^"]+)"/)[1];
 const r=await(await visitor.post('/p/'+f.slug+'/lead',{headers:{'X-CSRF-Token':token},data:{csrf:token,idempotency_key:randomUUID(),first_name:'Ana',last_name:'Pago',email:'ana.pago@example.test',phone:'3001112233',phone_country:'CO',country_code:'CO',department_code:'05',city_code:'05001',address:'Calle 10 # 20-30',quantity:1,website:''}})).json();
 const ref=r.payment.reference;const id=(await(await owner.ctx.get('/api/orders')).json()).orders.find(o=>o.order_number===r.order_number).id;
 // From the order.
 let s=await(await sendLink(id)).json();
 check('link sent in the open chat',s.sent===true&&lastText(CUSTOMER).includes('/pagar/'+ref)&&lastText(CUSTOMER).includes(r.order_number)&&/Total: \$/.test(lastText(CUSTOMER)));
 check('order history records it',(await detail(id)).events.some(e=>e.event_type==='payment_link_sent'));
 s=await(await sendLink(id,'link')).json();
 check('wa.me address without sending',s.sent===false&&s.wa_me.startsWith('https://wa.me/'+CUSTOMER+'?text=')&&decodeURIComponent(s.wa_me).includes('/pagar/'+ref));
 // The agent: sees the payment, never offers «1 SÍ / 2 NO» for it and sends the server's link, not the AI's text.
 // «mi pedido» is answered by the server without the AI: the order status, with the link while it waits for payment.
 let before=sends.length;await say(CUSTOMER,'Ana Pago','quiero pagar mi pedido');await work();
 check('«mi pedido» shows the order with its payment link',lastText(CUSTOMER).includes('espera el pago en línea')&&lastText(CUSTOMER).includes('/pagar/'+ref));
 before=sends.length;await say(CUSTOMER,'Ana Pago','quiero pagar con tarjeta');await work();
 const seen=ai.at(-1)?.orders?.find(o=>o.number===r.order_number);
 check('agent sees the order waiting for its payment',seen?.payment==='en línea, esperando pago'&&seen.needs_confirmation===false);
 check('agent action sends the server link',sends.length>before&&lastText(CUSTOMER).includes('/pagar/'+ref)&&!sends.slice(before).some(x=>JSON.stringify(x).includes('falso.example')));
 await say('573009998877','Luis','quiero pagar');await work();
 check('without a pending payment the agent says so',/No veo un pedido tuyo esperando pago/.test(lastText('573009998877'))&&!JSON.stringify(sends).includes('falso.example'));
 // Reminder after 24 hours (window open): once, with the link.
 await orders('order-created-at',id,new Date(Date.now()-25*3600e3).toISOString());await say(CUSTOMER,'Ana Pago','Hola de nuevo');
 let rem=JSON.parse(await wa('reminders-run'));
 // The worker run by the customer's message may already have sent it; either way it goes once, with the link.
 check('payment reminder sent once with the link',sends.filter(x=>x.type==='text'&&x.to===CUSTOMER&&/sigue reservado/.test(x.text.body)&&x.text.body.includes('/pagar/'+ref)).length===1);
 const count=sends.filter(x=>x.type==='text'&&/sigue reservado/.test(x.text.body)).length;await wa('reminders-run');
 check('no second reminder',sends.filter(x=>x.type==='text'&&/sigue reservado/.test(x.text.body)).length===count);
 // Outside the window: no free text from Tinbana, the wa.me fallback instead.
 await wa('age-window');const n0=sends.length;s=await(await sendLink(id)).json();
 check('closed window falls back to wa.me',s.sent===false&&sends.length===n0&&/24 horas/.test(s.message)&&s.wa_me.includes(CUSTOMER));
 // A paid order has no link.
 const d=await detail(id);await orders('payment-setup','online','0');
 const timestamp=Math.floor(Date.now()/1000),t={id:'555-1',status:'APPROVED',amount_in_cents:Math.round(r.payment.amount*100),reference:ref+'-1',currency:'COP',payment_method_type:'CARD'};
 const {createHash}=await import('node:crypto');const checksum=createHash('sha256').update(t.id+t.status+t.amount_in_cents+timestamp+K.events_secret).digest('hex');
 const url=(await(await owner.ctx.get('/api/wompi/account')).json()).account.events_url.replace(/^https?:\/\/[^/]+/,'');
 await meta.post(url,{headers:{'Content-Type':'application/json'},data:JSON.stringify({event:'transaction.updated',data:{transaction:t},environment:'test',signature:{properties:['transaction.id','transaction.status','transaction.amount_in_cents'],checksum},timestamp})});
 check('paid order has no payment link',(await detail(id)).order.payment_status==='paid'&&(await sendLink(id)).status()===409&&d.order.payment_status==='pending');
 console.log(`${checks} Wompi WhatsApp checks passed. Meta, OpenAI and Wompi simulated; nothing left the machine.`);
}finally{
 if(owner){await owner.ctx.delete('/api/wompi/account',{headers:owner.H,data:{}});}await orders('payment-setup','cod','0');await wa('reset');
 graph.close();openai.close();wompi.close();
}
