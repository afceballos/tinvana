import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHmac,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// WhatsApp stage 2: inbox, manual replies, delivery statuses, 24-hour window, take and return the chat.
// Simulated Graph API on 8446 (records sends, returns wamids); signed webhooks built here. Nothing reaches Meta.
// Requires the test server with WHATSAPP_GRAPH_URL=https://127.0.0.1:8446/, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN and HTTP_CA_BUNDLE.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/whatsapp-helper.php',...a])).stdout;
const SECRET=process.env.WHATSAPP_APP_SECRET;assert(SECRET,'WhatsApp test environment missing');
const PHONE='106540352242922',WABA='102290129340398',OTHER_PHONE='109876543210987',OTHER_WABA='108765432109876',TOKEN='EAAG'+'x'.repeat(60);
const LAURA='573001112233',CARLOS='573104445566';
const sends=[];let mode='ok',seq=0;
const graph=createServer({key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')},(req,res)=>{
 let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
  const send=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
  if(req.headers.authorization!=='Bearer '+TOKEN)return send(401,{error:{message:'Invalid OAuth access token.',code:190}});
  if(req.method==='POST'&&req.url==='/'+PHONE+'/messages'){
   const body=JSON.parse(raw);sends.push(body);
   if(mode==='error500')return send(500,{error:{message:'Service temporarily unavailable',code:2}});
   if(mode==='reject')return send(400,{error:{message:'Recipient cannot be sent messages',code:131026}});
   return send(200,{messaging_product:'whatsapp',contacts:[{input:body.to,wa_id:body.to}],messages:[{id:'wamid.OUT'+(++seq)}]});
  }
  send(400,{error:{message:'Unsupported request',code:100}});
 });
});
await new Promise(r=>graph.listen(8446,'127.0.0.1',r));
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
const now=()=>String(Math.floor(Date.now()/1000));
const envelope=(value,phone=PHONE,waba=WABA)=>JSON.stringify({object:'whatsapp_business_account',entry:[{id:waba,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'15551550926',phone_number_id:phone},...value}}]}]});
const msg=(from,name,id,extra)=>envelope({contacts:[{profile:{name},wa_id:from}],messages:[{from,id,timestamp:now(),...extra}]});
const text=(from,name,id,body)=>msg(from,name,id,{type:'text',text:{body}});
const status=(id,st,errors)=>envelope({statuses:[{id,status:st,timestamp:now(),recipient_id:LAURA,...(errors?{errors}:{})}]});
let owner,other,meta;
const hook=body=>meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',SECRET).update(body).digest('hex')},data:body});
const list=async(who=owner,q='')=>(await who.ctx.get('/api/whatsapp/conversations'+q)).json();
const detail=async(id,who=owner)=>(await who.ctx.get('/api/whatsapp/conversations/'+id)).json();
const reply=(id,body,client=randomUUID(),headers=owner.H)=>owner.ctx.post(`/api/whatsapp/conversations/${id}/messages`,{headers,data:{client_id:client,body}});
try{
 await helper('reset');
 owner=await login(f.email);other=await login(f.otherEmail);meta=await request.newContext({baseURL:base});
 check('owner connects the number',(await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}})).ok());
 check('another store connects its own number',(await other.ctx.put('/api/whatsapp/account',{headers:other.H,data:{phone_number_id:OTHER_PHONE,waba_id:OTHER_WABA,token:TOKEN}})).ok());
 // Receiving
 check('empty inbox before any message',(await list()).conversations.length===0);
 check('signed message accepted',(await hook(text(LAURA,'Laura Gómez','wamid.IN1','Hola, ¿tienen envío a Pereira?'))).ok());
 let l=await list();const conv=l.conversations[0];
 check('without an AI connected the message opens a conversation with an advisor, the reason and an open 24-hour window',l.conversations.length===1&&conv.name==='Laura Gómez'&&conv.phone===LAURA&&conv.owner_mode==='human'&&conv.handoff_reason.includes('Integraciones de IA')&&conv.unread===1&&conv.window_open&&conv.last.body.startsWith('Hola'));
 for(let i=0;i<10;i++)await hook(text(LAURA,'Laura Gómez','wamid.IN1','Hola, ¿tienen envío a Pereira?'));
 let d=await detail(conv.id);
 check('the same event delivered ten times creates one message',d.messages.length===1&&d.conversation.unread===1);
 await hook(msg(LAURA,'Laura Gómez','wamid.IMG1',{type:'image',image:{id:'media-1',mime_type:'image/jpeg',caption:'¿Este color?'}}));
 await hook(msg(LAURA,'Laura Gómez','wamid.BTN1',{type:'interactive',interactive:{type:'button_reply',button_reply:{id:'yes',title:'Sí, lo quiero'}}}));
 d=await detail(conv.id);const img=d.messages.find(m=>m.type==='image'),btn=d.messages.find(m=>m.type==='interactive');
 check('an image is kept as a reference marked as not supported yet, with its caption',img&&!img.supported&&img.body==='¿Este color?');
 check('a button reply shows its title',btn&&btn.supported&&btn.body==='Sí, lo quiero');
 await hook(text(CARLOS,'Carlos Ruiz','wamid.IN2','Buenas'));
 l=await list();check('a second customer gets a separate conversation, newest first',l.conversations.length===2&&l.conversations[0].name==='Carlos Ruiz'&&l.counts.unread===2);
 check('filters: unread, AI and advisor',(await list(owner,'?filter=unread')).conversations.length===2&&(await list(owner,'?filter=human')).conversations.length===2&&(await list(owner,'?filter=ai')).conversations.length===0);
 check('search by name or phone',(await list(owner,'?q=laura')).conversations.length===1&&(await list(owner,'?q=310444')).conversations[0].name==='Carlos Ruiz');
 // Isolation
 check('another store sees none of these chats',(await list(other)).conversations.length===0);
 check('another store cannot open, take or answer a chat that is not its own',(await other.ctx.get('/api/whatsapp/conversations/'+conv.id)).status()===404&&(await other.ctx.post(`/api/whatsapp/conversations/${conv.id}/take`,{headers:other.H,data:{version:1}})).status()===404&&(await other.ctx.post(`/api/whatsapp/conversations/${conv.id}/messages`,{headers:other.H,data:{client_id:randomUUID(),body:'x'}})).status()===404);
 await hook(text(LAURA,'Laura','wamid.CROSS',''+'hola otra tienda').replace(PHONE,OTHER_PHONE).replace(WABA,OTHER_WABA));
 check('the same customer writing to another store lands only in that store',(await list(other)).conversations.length===1&&(await detail(conv.id)).messages.every(m=>m.body!=='hola otra tienda'));
 // Polling stamp
 const stamp=l.stamp;check('polling with the same stamp answers "unchanged"',(await list(owner,'?stamp='+stamp)).unchanged===true);
 await owner.ctx.post(`/api/whatsapp/conversations/${conv.id}/read`,{headers:owner.H});
 d=await detail(conv.id);check('opening the chat marks it read and changes the stamp',d.conversation.unread===0&&!(await list(owner,'?stamp='+stamp)).unchanged);
 // One sender per conversation (taking, stale versions and returning to an active AI are covered in whatsapp-agent.mjs)
 check('a chat already with an advisor cannot be taken again',(await owner.ctx.post(`/api/whatsapp/conversations/${conv.id}/take`,{headers:owner.H,data:{version:d.conversation.version}})).status()===409);
 check('it cannot be returned to the AI while no agent is available',(await owner.ctx.post(`/api/whatsapp/conversations/${conv.id}/release`,{headers:owner.H,data:{version:d.conversation.version}})).status()===409);
 let r;
 // Sending
 check('replying requires CSRF',(await reply(conv.id,'Hola',randomUUID(),{'X-CSRF-Token':'bad'})).status()===419&&sends.length===0);
 check('an empty reply is refused',(await reply(conv.id,'   ')).status()===422);
 const client=randomUUID();r=await reply(conv.id,'¡Hola Laura! Sí, enviamos a Pereira.',client);let sent=(await r.json()).message;
 check('the reply goes to Meta as text to the customer and is stored with its wamid',r.ok()&&sends.length===1&&sends[0].to===LAURA&&sends[0].type==='text'&&sends[0].text.body==='¡Hola Laura! Sí, enviamos a Pereira.'&&sends[0].messaging_product==='whatsapp'&&sent.status==='queued'&&sent.sender==='agent');
 r=await reply(conv.id,'¡Hola Laura! Sí, enviamos a Pereira.',client);
 check('repeating the same request does not send twice',r.ok()&&(await r.json()).message.id===client&&sends.length===1);
 for(const st of ['sent','delivered','read'])await hook(status('wamid.OUT1',st));
 await hook(status('wamid.OUT1','delivered'));
 d=await detail(conv.id);check('delivery statuses advance to read and never move back',d.messages.find(m=>m.id===client).status==='read');
 r=await reply(conv.id,'¿Te comparto el precio?');const second=(await r.json()).message;
 await hook(status('wamid.OUT2','failed',[{code:131047,title:'Re-engagement message',message:'Re-engagement message'}]));
 d=await detail(conv.id);const failed=d.messages.find(m=>m.id===second.id);
 check('a failed status is shown with an explanation',failed.status==='failed'&&failed.error.includes('24 horas'));
 mode='error500';r=await reply(conv.id,'Mensaje con resultado incierto');const unknown=(await r.json()).message;
 check('a server error at Meta leaves the result unknown, without retrying',unknown.status==='failed'&&unknown.error.includes('No se confirmó')&&sends.length===3);
 mode='reject';r=await reply(conv.id,'Mensaje rechazado');const rejected=(await r.json()).message;
 check('a message refused by Meta is marked failed with its reason',rejected.status==='failed'&&rejected.error.includes('no puede recibir'));mode='ok';
 await hook(status('wamid.NOTYET','delivered'));
 const pendingStatus=JSON.parse(await helper('events')).find(e=>e.dedupe_key==='st:wamid.NOTYET:delivered');
 check('a status that arrives before its message stays pending for a later retry',pendingStatus&&pendingStatus.status==='pending');
 // 24-hour window
 await helper('age-window');
 check('with the window closed no free text is sent',(await reply(conv.id,'¿Sigues ahí?')).status()===409&&sends.length===4);
 l=await list();check('the list shows the closed window',l.conversations.find(c=>c.id===conv.id).window_open===false);
 await hook(text(LAURA,'Laura Gómez','wamid.IN3','Sí, aquí estoy'));
 check('a new customer message reopens the window, even with a status waiting for a retry in the queue',(await reply(conv.id,'¡Perfecto!')).ok()&&sends.length===5);
 check('the cron fallback runs without errors',JSON.parse((await run('powershell',['-NoProfile','-Command','.tools/run-test-command.ps1 backend/bin/console.php whatsapp:work'])).stdout.trim().split('\n').pop()).failed===0);
 await helper('feature','off');check('without the WhatsApp feature the inbox is refused',(await owner.ctx.get('/api/whatsapp/conversations')).status()===403);await helper('feature','on');
 // Panel
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[],polls=[];
 const ctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1440,height:1000}});const page=await ctx.newPage();
 page.on('pageerror',x=>errors.push(x.message));page.on('request',q=>{if(q.url().includes('/api/whatsapp/conversations')&&q.method()==='GET')polls.push(q.headers()['x-session-probe']);});
 await page.goto(base+'/panel/whatsapp');await page.locator('.wa-item').first().waitFor();
 check('the inbox lists both conversations with counters',await page.locator('.wa-item').count()===2&&(await page.locator('.wa-stats').innerText()).includes('Con un asesor'));
 await page.locator('.wa-item',{hasText:'Laura Gómez'}).click();await page.waitForURL('**/panel/whatsapp/'+conv.id);await page.locator('.wa-msg').first().waitFor();
 check('the conversation shows bubbles, the unsupported image, ticks and the 24-hour window',await page.locator('.wa-unsupported').count()===1&&await page.locator('.wa-ticks.is-read').count()===1&&/ventana de 24 horas/i.test(await page.locator('.wa-context').innerText())&&(await page.locator('.wa-window').innerText()).includes('Abierta'));
 check('the chat explains why it needs an advisor and the composer is ready',(await page.locator('.wa-banner.is-handoff').innerText()).includes('Integraciones de IA')&&await page.locator('#wa-text').isEnabled());
 await page.locator('#wa-text').fill('Te escribo desde el panel');await page.keyboard.press('Enter');
 await page.locator('.wa-msg.is-out',{hasText:'Te escribo desde el panel'}).locator('.wa-ticks.is-queued').waitFor();
 check('the advisor writes from the panel and the message is sent once',sends.length===6&&sends[5].text.body==='Te escribo desde el panel');
 await hook(text(LAURA,'Laura Gómez','wamid.LIVE1','Llegó en vivo'));
 await page.locator('.wa-msg.is-in',{hasText:'Llegó en vivo'}).waitFor({timeout:12000});
 check('new messages appear without reloading',true);
 await page.locator('.wa-item.is-active .wa-unread').waitFor({state:'detached',timeout:3000});
 check('a message read in the open chat clears its counter in the list right away',true);
 check('polling never renews the session',polls.length>2&&polls.every(h=>h==='1'));
 await page.waitForTimeout(500);await page.screenshot({path:'test-results/whatsapp-inbox.png'});
 await page.evaluate(()=>localStorage.setItem('tinvana-theme','dark'));await page.reload();await page.locator('.wa-msg').first().waitFor();await page.waitForTimeout(600);await page.screenshot({path:'test-results/whatsapp-inbox-dark.png'});
 await page.evaluate(()=>localStorage.setItem('tinvana-theme','light'));
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/panel/whatsapp');await page.locator('.wa-item').first().waitFor();
 check('mobile shows the list first and fits the screen',await page.locator('.wa-chat').count()===0||!(await page.locator('.wa-chat').isVisible()));
 await page.locator('.wa-item',{hasText:'Laura Gómez'}).click();await page.locator('.wa-msg').first().waitFor();await page.waitForTimeout(500);
 check('mobile opens the chat alone with a back button',await page.locator('.wa-list').isHidden()&&await page.locator('.wa-back').isVisible()&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'test-results/whatsapp-inbox-mobile.png'});
 await page.locator('.wa-back').click();await page.waitForURL(/\/panel\/whatsapp$/);check('the back button returns to the list',await page.locator('.wa-list').isVisible());
 check('no browser errors',errors.length===0);
 console.log(`${checks} WhatsApp inbox checks passed against a simulated Meta. Nothing reached Meta.`);
}finally{await helper('reset').catch(()=>{});await browser?.close();await owner?.ctx.dispose();await other?.ctx.dispose();await meta?.dispose();graph.close();}
