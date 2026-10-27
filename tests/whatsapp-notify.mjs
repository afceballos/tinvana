import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHmac,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Handoff message to the customer (custom text) and store notifications (bell, sound/browser, email queue, settings).
// Simulated Graph API on 8446 and simulated OpenAI on 8447. Nothing reaches Meta, an AI provider or a mailbox.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/whatsapp-helper.php',...a])).stdout;
const notes=async()=>JSON.parse(await helper('notifications'));
const SECRET=process.env.WHATSAPP_APP_SECRET;assert(SECRET&&process.env.AI_OPENAI_URL,'WhatsApp/AI test environment missing');
const PHONE='106540352242922',WABA='102290129340398',TOKEN='EAAG'+'x'.repeat(60);
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
const sends=[];let seq=0;
const graph=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{sends.push(JSON.parse(raw||'{}'));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({messaging_product:'whatsapp',messages:[{id:'wamid.OUT'+(++seq)}]}));});});
let aiDown=false;
const openai=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
 const input=JSON.parse(JSON.parse(raw).input[0].content);const last=[...input.history].reverse().find(m=>m.from==='cliente')?.text||'';
 const empty={name:'',city:'',department:'',address:'',neighborhood:'',reference:'',quantity:'',variant:''};
 if(aiDown){res.writeHead(500,{'Content-Type':'application/json'});return res.end('{"error":{"message":"down"}}');}
 const out=/alguien/i.test(last)?{reply:'TEXTO DE LA IA AL PASAR',intent:'asesor',product_id:'',captured:empty,action:'handoff',handoff_reason:'pidió una persona'}
  :/lo quiero/i.test(last)?{reply:'TEXTO DE LA IA AL COMPRAR',intent:'comprar',product_id:'',captured:{...empty,city:'Cali'},action:'request_quote',handoff_reason:''}
  :{reply:'Respuesta normal de la IA.',intent:'info',product_id:'',captured:empty,action:'none',handoff_reason:''};
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(out)}]}],usage:{input_tokens:90,output_tokens:20}}));
});});
await new Promise(r=>graph.listen(8446,'127.0.0.1',r));await new Promise(r=>openai.listen(8447,'127.0.0.1',r));
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
let owner,other,meta;
const say=(from,name,text)=>{const body=JSON.stringify({object:'whatsapp_business_account',entry:[{id:WABA,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'15551550926',phone_number_id:PHONE},contacts:[{profile:{name},wa_id:from}],messages:[{from,id:'wamid.IN.'+randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:text}}]}}]}]});return meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',SECRET).update(body).digest('hex')},data:body});};
const agent=async()=>(await owner.ctx.get('/api/whatsapp/agent')).json();
const putAgent=s=>owner.ctx.put('/api/whatsapp/agent',{headers:owner.H,data:s});
const settings=async()=>(await owner.ctx.get('/api/notifications/settings')).json();
try{
 await helper('reset');
 owner=await login(f.email);other=await login(f.otherEmail);meta=await request.newContext({baseURL:base});
 await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}});
 // Before the AI is connected: a new chat goes to an advisor and the store is told.
 await say('573110000001','Ana Torres','Hola');
 let n=await notes();
 check('a new chat without AI notifies the store, with the email queued to the account address',n.length===1&&n[0].kind==='new_chat'&&n[0].title==='Ana Torres escribió por WhatsApp'&&n[0].link.startsWith('/panel/whatsapp/')&&n[0].email_status==='pending'&&n[0].email_to===f.email);
 // Agent ready.
 await owner.ctx.put('/api/ai/connections/openai',{headers:owner.H,data:{key:'test-key-notify-openai-123456789'}});await owner.ctx.post('/api/ai/connections/openai/activate',{headers:owner.H});
 await owner.ctx.put(`/api/whatsapp/sheets/${f.product}`,{headers:owner.H,data:{content:{summary:'Ficha.',can_say:'Beneficios.',price_note:'',faq:[],must_not:''}}});await owner.ctx.post(`/api/whatsapp/sheets/${f.product}/approve`,{headers:owner.H});
 let v=await agent();
 check('by default the customer is told, with a ready-made message',v.settings.handoff_notice===true&&v.settings.messages.handoff.includes('asesor'));
 // Handoff with the default message: only the store's text reaches the customer.
 let s0=sends.length;await say('573110000002','Carlos Ruiz','Quiero hablar con alguien');
 check('when the AI hands off, the customer gets only the store message (not the AI text)',sends.length===s0+1&&sends.at(-1).text.body===v.settings.messages.handoff);
 n=await notes();const h=n.at(-1);
 check('and the store gets a notification with the reason and a link to the chat',h.kind==='handoff'&&h.title==='Carlos Ruiz necesita un asesor'&&h.body.includes('pidió una persona')&&h.link.startsWith('/panel/whatsapp/'));
 // Custom message
 const custom='Ya te paso con Andrés para cerrar tu pedido 😊';
 check('the handoff message is validated',(await putAgent({...v.settings,messages:{...v.settings.messages,handoff:''}})).status()===422);
 await putAgent({...v.settings,messages:{...v.settings.messages,handoff:custom}});
 s0=sends.length;await say('573110000003','Laura Gómez','Lo quiero');
 check('a customer ready to buy gets the custom message only',sends.length===s0+1&&sends.at(-1).text.body===custom);
 // Notice off: the AI text is sent instead, and the store is still notified.
 await putAgent({...v.settings,handoff_notice:false});
 s0=sends.length;const n0=(await notes()).length;await say('573110000004','Jorge Medina','Necesito hablar con alguien');
 check('with the notice off, the AI answer is sent as before and the store is still notified',sends.length===s0+1&&sends.at(-1).text.body==='TEXTO DE LA IA AL PASAR'&&(await notes()).length===n0+1);
 await owner.ctx.delete('/api/whatsapp/agent',{headers:owner.H});
 // AI failure and monthly limit
 aiDown=true;await say('573110000005','Diana López','Hola');aiDown=false;
 check('an AI failure notifies with its own kind',(await notes()).at(-1).kind==='ai_failure');
 v=await agent();await helper('override',JSON.stringify({limits:{whatsapp_ai_conversations:v.status.used_this_month}}));
 s0=sends.length;await say('573110000006','Pedro Paz','Hola');
 n=await notes();check('reaching the monthly limit notifies and tells the customer with the handoff message',n.at(-1).kind==='limit'&&sends.at(-1).text.body===v.settings.messages.handoff&&sends.length===s0+1);
 await helper('override','{}');
 // Settings
 let st=await settings();
 check('settings: all events and channels on by default, email to the account',Object.values(st.settings.events).every(Boolean)&&Object.values(st.settings.channels).every(Boolean)&&st.account_email===f.email);
 check('settings require CSRF and a valid email',(await owner.ctx.put('/api/notifications/settings',{headers:{'X-CSRF-Token':'bad'},data:st.settings})).status()===419&&(await owner.ctx.put('/api/notifications/settings',{headers:owner.H,data:{...st.settings,email:'no-es-correo'}})).status()===422);
 await owner.ctx.put('/api/notifications/settings',{headers:owner.H,data:{...st.settings,events:{...st.settings.events,handoff:false},email:'avisos@example.test'}});
 const n1=(await notes()).length;await say('573110000007','Sofía Gil','Quiero hablar con alguien');
 check('a disabled event does not notify',(await notes()).length===n1);
 await owner.ctx.put('/api/notifications/settings',{headers:owner.H,data:{...st.settings,channels:{...st.settings.channels,email:true},email:'avisos@example.test'}});
 aiDown=true;await say('573110000008','Marta Ríos','Hola');aiDown=false;
 check('the email goes to the address chosen in the settings',(await notes()).at(-1).email_to==='avisos@example.test');
 await owner.ctx.put('/api/notifications/settings',{headers:owner.H,data:{...st.settings,channels:{...st.settings.channels,email:false}}});
 aiDown=true;await say('573110000009','Luis Paz','Hola');aiDown=false;
 check('with the email channel off nothing is queued',(await notes()).at(-1).email_status==='skipped');
 await owner.ctx.put('/api/notifications/settings',{headers:owner.H,data:st.settings});
 // Feed
 let feed=await(await owner.ctx.get('/api/notifications')).json();
 check('the feed lists the latest notifications and the unread count',feed.unread===feed.items.length&&feed.items.length>=8&&feed.items[0].kind==='ai_failure');
 check('polling with the same stamp answers unchanged',(await(await owner.ctx.get('/api/notifications?stamp='+feed.stamp)).json()).unchanged===true);
 feed=await(await owner.ctx.post('/api/notifications/read',{headers:owner.H,data:{ids:[feed.items[0].id]}})).json();
 check('one notification can be marked read',feed.items[0].read===true&&feed.unread===feed.items.length-1);
 check('another store sees none of these notifications',(await(await other.ctx.get('/api/notifications')).json()).items.length===0&&(await(await other.ctx.post('/api/notifications/read',{headers:other.H,data:{ids:[feed.items[1].id]}})).json()).unread===0&&(await(await owner.ctx.get('/api/notifications')).json()).unread===feed.unread);
 // Panel: bell, sound, browser notification and settings
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1440,height:1000}});
 await ctx.addInitScript(()=>{window.__chimes=0;window.__notes=[];
  const A=function(){window.__chimes++;return {currentTime:0,destination:{},createOscillator:()=>({type:'',frequency:{value:0},connect:x=>x,start(){},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect:x=>x}),close:async()=>{}};};window.AudioContext=A;
  window.Notification=function(t,o){window.__notes.push({t,body:o?.body});this.close=()=>{};};window.Notification.permission='granted';window.Notification.requestPermission=async()=>'granted';});
 const page=await ctx.newPage();page.on('pageerror',x=>errors.push(x.message));
 await page.goto(base+'/panel/whatsapp');await page.locator('.notify-count').waitFor();
 check('the bell shows the unread count',(await page.locator('.notify-count').innerText())===String(feed.unread));
 await page.locator('.notify-toggle').click();await page.locator('.notify-panel').waitFor();
 check('the bell lists the notifications',await page.locator('.notify-panel li.is-unread').count()===feed.unread);
 await page.waitForTimeout(400);await page.screenshot({path:'test-results/notifications-bell.png'});
 await page.locator('.notify-panel li button',{hasText:'Pedro Paz'}).click();await page.waitForURL(/\/panel\/whatsapp\/[a-f0-9-]{36}$/);
 check('clicking a notification opens the chat and marks it read',(await page.locator('.wa-chat-who strong').innerText())==='Pedro Paz'&&(await(await owner.ctx.get('/api/notifications')).json()).unread===feed.unread-1);
 const chimes0=await page.evaluate(()=>window.__chimes);
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'}));
 aiDown=true;await say('573110000010','Eva Ruiz','Hola');aiDown=false;
 await page.waitForFunction(()=>window.__notes.length>0,null,{timeout:30000});
 check('a new notification plays the sound and shows a browser notification when the tab is in the background',(await page.evaluate(()=>window.__chimes))>chimes0&&(await page.evaluate(()=>window.__notes[0].t))==='Eva Ruiz necesita un asesor');
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'}));
 await page.goto(base+'/panel/notificaciones');await page.locator('.notify-options').first().waitFor();
 check('the breadcrumb names the page',(await page.locator('.breadcrumb strong').innerText())==='Notificaciones');
 await page.locator('.notify-options label',{hasText:'Mensaje fuera del horario'}).click();await page.getByRole('button',{name:'Guardar notificaciones'}).click();
 await page.waitForFunction(async()=>{const r=await fetch('/api/notifications/settings');return (await r.json()).settings.events.off_hours===false;});
 check('the settings page saves the events',true);
 await page.waitForTimeout(400);await page.screenshot({path:'test-results/notifications-settings.png',fullPage:true});
 await page.goto(base+'/panel/whatsapp/agente');await page.locator('.wa-agent-settings').waitFor();
 check('the agent settings show the handoff notice and its message',(await page.locator('.wa-agent-settings').innerText()).includes('Avisar al cliente que lo pasas a un asesor')&&(await page.locator('.wa-agent-settings textarea').evaluateAll(t=>t.map(x=>x.value))).includes(v.settings.messages.handoff));
 await page.evaluate(()=>localStorage.setItem('tinvana-theme','dark'));await page.goto(base+'/panel/whatsapp');await page.locator('.notify-toggle').click();await page.locator('.notify-panel').waitFor();await page.waitForTimeout(300);await page.screenshot({path:'test-results/notifications-bell-dark.png'});
 await page.evaluate(()=>localStorage.setItem('tinvana-theme','light'));
 await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('.notify-toggle').click();await page.locator('.notify-panel').waitFor();
 check('the bell panel fits mobile',await page.evaluate(()=>{const r=document.querySelector('.notify-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;}));
 await page.waitForTimeout(300);await page.screenshot({path:'test-results/notifications-bell-mobile.png'});
 check('no browser errors',errors.length===0);
 console.log(`${checks} notification checks passed against a simulated Meta and a simulated AI. No email was sent.`);
}finally{await helper('reset').catch(()=>{});await browser?.close();await owner?.ctx.dispose();await other?.ctx.dispose();await meta?.dispose();graph.close();openai.close();}
