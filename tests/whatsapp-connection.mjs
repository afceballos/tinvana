import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHmac} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// WhatsApp stage 1: number connection against a simulated Graph API (8446) and the signed Meta webhook.
// Requires the test server with WHATSAPP_GRAPH_URL=https://127.0.0.1:8446/, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN
// and HTTP_CA_BUNDLE (test values only). Nothing reaches Meta. Local isolated database only.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/whatsapp-helper.php',...a])).stdout;
const events=async()=>JSON.parse(await helper('events'));
const SECRET=process.env.WHATSAPP_APP_SECRET,VERIFY=process.env.WHATSAPP_VERIFY_TOKEN;assert(SECRET&&VERIFY,'WhatsApp test environment missing');
const PHONE='106540352242922',WABA='102290129340398',TOKEN='EAAG'+'x'.repeat(60);
const graphCalls=[];let subscribed=false,devx=false,subscribeFails=false;
const graph=createServer({key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')},(req,res)=>{
 graphCalls.push(req.method+' '+req.url);const auth=req.headers.authorization||'';
 const send=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 if(auth!=='Bearer '+TOKEN)return send(401,{error:{message:'Invalid OAuth access token.',type:'OAuthException',code:190}});
 if(req.method==='GET'&&req.url.startsWith('/'+PHONE+'?'))return send(200,{verified_name:'Tienda Andrés',display_phone_number:'+57 300 555 0142',quality_rating:'GREEN',id:PHONE});
 // Official shapes: GET → {data:[{whatsapp_business_api_data:{id,link,name}}]}, POST → {success:true}.
 if(req.url==='/'+WABA+'/subscribed_apps'){if(req.method==='POST'){if(subscribeFails)return send(403,{error:{message:'Permissions error',type:'OAuthException',code:200}});subscribed=true;return send(200,{success:true});}return send(200,{data:[...(devx?[{whatsapp_business_api_data:{id:'999',link:'https://example.test/devx',name:'WA DevX Webhook Events 1P App'}}]:[]),...(subscribed?[{whatsapp_business_api_data:{id:'1234567890',link:'https://example.test/app',name:'Tinbana WP'}}]:[])]});}
 send(400,{error:{message:'Unsupported get request.',type:'GraphMethodException',code:100}});
});
await new Promise(r=>graph.listen(8446,'127.0.0.1',r));
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
const sign=body=>'sha256='+createHmac('sha256',SECRET).update(body).digest('hex');
const delivery=(value,waba=WABA)=>JSON.stringify({object:'whatsapp_business_account',entry:[{id:waba,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'573005550142',phone_number_id:value.phone||PHONE},...value.body}}]}]});
const textMessage=(id,text='Hola')=>({body:{contacts:[{profile:{name:'Laura'},wa_id:'573001112233'}],messages:[{from:'573001112233',id,timestamp:'1777000000',type:'text',text:{body:text}}]}});
let owner,other,meta;
try{
 await helper('reset');
 owner=await login(f.email);other=await login(f.otherEmail);meta=await request.newContext({baseURL:base});
 // Connection
 let v=await(await owner.ctx.get('/api/whatsapp/account')).json();
 check('no number connected yet; platform settings present on the server',v.account===null&&v.platform.verify_token_configured&&v.platform.app_secret_configured&&v.platform.webhook_url.endsWith('/whatsapp/webhook'));
 check('saving requires CSRF',(await owner.ctx.put('/api/whatsapp/account',{headers:{'X-CSRF-Token':'bad'},data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}})).status()===419);
 check('identifiers must be numeric',(await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:'abc',waba_id:WABA,token:TOKEN}})).status()===422);
 check('a short token is rejected',(await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:'short'}})).status()===422);
 let r=await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}});const saved=await r.text();
 check('credentials saved pending a test, token never returned',r.status()===200&&JSON.parse(saved).account.status==='pending'&&!saved.includes(TOKEN)&&!saved.includes('ciphertext'));
 r=await owner.ctx.post('/api/whatsapp/account/test',{headers:owner.H});v=await r.json();
 check('read-only test reads the number from Meta and marks it connected',r.status()===200&&v.account.status==='connected'&&v.account.display_phone==='+57 300 555 0142'&&v.account.quality_rating==='GREEN'&&v.message.includes('Tienda Andrés'));
 check('the test reads the number, subscribes the app automatically and reads the list (no message sent)',JSON.stringify(graphCalls.map(c=>c.split('?')[0]))===JSON.stringify(['GET /'+PHONE,'POST /'+WABA+'/subscribed_apps','GET /'+WABA+'/subscribed_apps'])&&subscribed);
 check('the test reports the automatic subscription',v.subscription.subscribed&&v.subscription.apps.includes('Tinbana WP')&&v.message.includes('suscrita'));
 subscribed=false;
 check('subscribing requires CSRF',(await owner.ctx.post('/api/whatsapp/account/subscribe',{headers:{'X-CSRF-Token':'bad'}})).status()===419&&!subscribed);
 r=await owner.ctx.post('/api/whatsapp/account/subscribe',{headers:owner.H});const subView=await r.json();
 check('subscribing posts to subscribed_apps and reads the list back',r.ok()&&subscribed&&graphCalls.includes('POST /'+WABA+'/subscribed_apps')&&subView.subscription.apps[0]==='Tinbana WP');
 check('another store cannot subscribe without its own number',(await other.ctx.post('/api/whatsapp/account/subscribe',{headers:other.H})).status()===404);
 subscribed=false;
 check('another user does not see this number',(await(await other.ctx.get('/api/whatsapp/account')).json()).account===null);
 check('the same number cannot be connected to a second store',(await other.ctx.put('/api/whatsapp/account',{headers:other.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}})).status()===409);
 await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:'EAAG'+'y'.repeat(60)}});
 r=await owner.ctx.post('/api/whatsapp/account/test',{headers:owner.H});const bad=await r.json();v=await(await owner.ctx.get('/api/whatsapp/account')).json();
 check('a rejected token is explained and the number marked with error',r.status()===502&&bad.error.includes('token')&&v.account.status==='error');
 await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}});await owner.ctx.post('/api/whatsapp/account/test',{headers:owner.H});
 await helper('feature','off');check('without the WhatsApp feature the module is refused',(await owner.ctx.get('/api/whatsapp/account')).status()===403);await helper('feature','on');
 // Webhook verification
 const q=(mode,token,challenge='1158201444')=>`/whatsapp/webhook?hub.mode=${mode}&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${challenge}`;
 r=await meta.get(q('subscribe',VERIFY));check('verification answers the challenge',r.status()===200&&await r.text()==='1158201444');
 check('wrong verify token refused',(await meta.get(q('subscribe','wrong'))).status()===403);
 check('wrong mode refused',(await meta.get(q('unsubscribe',VERIFY))).status()===403);
 // Signed deliveries
 const body=delivery(textMessage('wamid.TEST1'));
 check('unsigned delivery refused',(await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json'},data:body})).status()===401);
 check('wrong signature refused',(await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(body+' ')},data:body})).status()===401);
 check('refused deliveries store nothing',(await events()).length===0);
 let diag=(await(await owner.ctx.get('/api/whatsapp/account')).json()).diagnostics;
 check('a signed delivery with a wrong signature is noted for the diagnosis, an unsigned one is not',diag.signature_rejected_at!==null&&diag.last_event_at===null&&diag.pending===0);
 r=await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(body)},data:body});
 let e=await events();
 check('signed message stored once and acknowledged',r.status()===200&&await r.text()==='EVENT_RECEIVED'&&e.length===1&&e[0].dedupe_key==='msg:wamid.TEST1'&&e[0].kind==='message'&&e[0].user_id===f.owner&&e[0].payload.message.text.body==='Hola');
 for(let i=0;i<10;i++)await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(body)},data:body});
 check('the same event delivered ten times is stored once',(await events()).length===1);
 diag=(await(await owner.ctx.get('/api/whatsapp/account')).json()).diagnostics;
 check('the diagnosis shows when the last message from Meta arrived',diag.last_event_at!==null&&diag.failed===0);
 check('another store does not get this store\'s diagnosis',(await(await other.ctx.get('/api/whatsapp/account')).json()).diagnostics===null);
 const statuses=delivery({body:{statuses:[{id:'wamid.OUT1',status:'sent',timestamp:'1777000100',recipient_id:'573001112233'},{id:'wamid.OUT1',status:'delivered',timestamp:'1777000101',recipient_id:'573001112233'}]}});
 for(let i=0;i<3;i++)await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(statuses)},data:statuses});
 e=await events();check('each delivery status is stored once',e.filter(x=>x.kind==='status').length===2&&e.some(x=>x.dedupe_key==='st:wamid.OUT1:delivered'));
 const foreign=delivery({phone:'999999999999',...textMessage('wamid.FOREIGN')});await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(foreign)},data:foreign});
 const otherWaba=delivery(textMessage('wamid.OTHERWABA'),'555555555555555');await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(otherWaba)},data:otherWaba});
 e=await events();const ignored=e.filter(x=>x.status==='ignored');
 check('events of another number or WhatsApp account are ignored without keeping their content',ignored.length===2&&ignored.every(x=>x.user_id===null&&Object.keys(x.payload).length===0));
 diag=(await(await owner.ctx.get('/api/whatsapp/account')).json()).diagnostics;
 check('messages for this number sent with another account id are shown in the diagnosis with that id',diag.waba_mismatch?.count===1&&diag.waba_mismatch.received_waba_id==='555555555555555');
 check('another store never sees that mismatch',(await(await other.ctx.get('/api/whatsapp/account')).json()).diagnostics===null);
 // A second store with its number in its own Meta app (own app secret and own verify token).
 const OTHER_PHONE='109876543210987',OTHER_WABA='108765432109876',OTHER_SECRET='otherStoreAppSecret0123456789ab';
 const signOther=b=>'sha256='+createHmac('sha256',OTHER_SECRET).update(b).digest('hex');
 check('the app secret must look like the one Meta shows',(await other.ctx.put('/api/whatsapp/account',{headers:other.H,data:{phone_number_id:OTHER_PHONE,waba_id:OTHER_WABA,token:TOKEN,app_secret:'bad secret!'}})).status()===422);
 r=await other.ctx.put('/api/whatsapp/account',{headers:other.H,data:{phone_number_id:OTHER_PHONE,waba_id:OTHER_WABA,token:TOKEN,app_secret:OTHER_SECRET}});const ownText=await r.text();const own=JSON.parse(ownText).account;
 check('own app secret saved encrypted, never returned, with a verify token for that account',r.status()===200&&own.own_app&&/^tv[a-f0-9]{40}$/.test(own.verify_token)&&!ownText.includes(OTHER_SECRET));
 check('the owner does not see the other store\'s verify token',!(await(await owner.ctx.get('/api/whatsapp/account')).text()).includes(own.verify_token));
 r=await meta.get(q('subscribe',own.verify_token,'777'));check('Meta can verify the store\'s own app with its token',r.status()===200&&await r.text()==='777');
 const otherBody=delivery({phone:OTHER_PHONE,...textMessage('wamid.OWNAPP1','Hola tienda 2')},OTHER_WABA);
 check('a delivery with an unknown signature is refused',(await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':signOther(otherBody+'x')},data:otherBody})).status()===401);
 r=await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':signOther(otherBody)},data:otherBody});e=await events();
 check('a message signed by the store\'s own app reaches only that store',r.status()===200&&e.some(x=>x.dedupe_key==='msg:wamid.OWNAPP1'&&x.user_id===f.otherOwner&&['pending','done'].includes(x.status)&&x.payload.message.text.body==='Hola tienda 2'));
 const injected=delivery(textMessage('wamid.INJECT1','falso'));
 r=await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':signOther(injected)},data:injected});
 check('a store\'s app cannot sign for another store\'s number',r.status()===401&&!(await events()).some(x=>x.dedupe_key==='msg:wamid.INJECT1'));
 const mixed=JSON.stringify({object:'whatsapp_business_account',entry:[JSON.parse(delivery({phone:OTHER_PHONE,...textMessage('wamid.MIXOWN')},OTHER_WABA)).entry[0],JSON.parse(delivery(textMessage('wamid.INJECT2','falso'))).entry[0]]});
 r=await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':signOther(mixed)},data:mixed});e=await events();
 check('in a mixed delivery only the signer\'s own number is accepted',r.status()===200&&e.some(x=>x.dedupe_key==='msg:wamid.MIXOWN'&&x.user_id===f.otherOwner)&&!e.some(x=>x.dedupe_key==='msg:wamid.INJECT2'));
 const browserCheck=async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{const pg=await(await b.newContext({storageState:await other.ctx.storageState(),viewport:{width:1440,height:1000}})).newPage();await pg.goto(base+'/panel/whatsapp/conexion');await pg.locator('.wa-own-app').waitFor();const text=await pg.locator('.wa-own-app').innerText();await pg.waitForTimeout(900);await pg.screenshot({path:'test-results/whatsapp-own-app.png',fullPage:true});return text.includes(own.verify_token)&&!text.includes(OTHER_SECRET);}finally{await b.close();}};
 check('the store sees the webhook card of its own app with its token',await browserCheck());
 await other.ctx.put('/api/whatsapp/account',{headers:other.H,data:{phone_number_id:OTHER_PHONE,waba_id:OTHER_WABA,own_app:false}});
 check('dropping the own app disables its verify token',(await meta.get(q('subscribe',own.verify_token))).status()===403&&(await(await other.ctx.get('/api/whatsapp/account')).json()).account.own_app===false);
 const huge='x'.repeat(3145729);check('payloads over 3 MB refused',(await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(huge)},data:huge})).status()===413);
 // Panel
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1440,height:1000}});const page=await ctx.newPage();page.on('pageerror',x=>errors.push(x.message));
 await page.goto(base+'/panel/whatsapp');await page.locator('.wa-tabs').waitFor();
 await page.locator('.wa-tabs a',{hasText:'Conexión'}).click();await page.waitForURL('**/panel/whatsapp/conexion');await page.locator('.wa-account').waitFor();
 check('menu shows Ventas WhatsApp and the Conexión tab opens the connection',await page.locator('.app-sidebar nav a',{hasText:'Ventas WhatsApp'}).count()===1&&(await page.locator('.wa-account').innerText()).includes('+57 300 555 0142'));
 await page.reload();await page.locator('.wa-account').waitFor();check('reloading the module page works',true);
 const diagText=await page.locator('.wa-diagnosis').first().innerText();
 check('the connection card shows the message diagnosis and the account-id mismatch with the id to use',/último mensaje o estado recibido/i.test(diagText)&&(await page.locator('.wa-diagnosis').first().locator('[role=alert]').innerText()).includes('555555555555555'));
 // Real case seen in production: only Meta's internal test app («WA DevX Webhook Events 1P App») was subscribed.
 devx=true;subscribed=false;await page.getByRole('button',{name:'Probar conexión'}).click();await page.locator('.wa-sub-ok',{hasText:'quedó suscrita'}).waitFor();
 check('testing the connection subscribes the app on its own, even with Meta\'s internal app present',subscribed&&(await page.locator('.wa-subscription').innerText()).includes('Tinbana WP')&&await page.locator('.wa-subscription',{hasText:'app interna de Meta'}).count()===0);
 subscribed=false;subscribeFails=true;await page.getByRole('button',{name:'Probar conexión'}).click();await page.locator('.wa-subscription',{hasText:'No se pudo suscribir tu app'}).waitFor();
 check('if Meta refuses the subscription, the test still connects and explains it with the button to retry',!subscribed&&(await page.locator('.wa-subscription').innerText()).includes('app interna de Meta')&&await page.getByRole('button',{name:'Suscribir mi app'}).isVisible());
 subscribeFails=false;await page.getByRole('button',{name:'Suscribir mi app'}).click();await page.locator('.wa-sub-ok',{hasText:'quedó suscrita'}).waitFor();
 check('the button retries and subscribes the app',subscribed&&(await page.locator('.wa-subscription').innerText()).includes('Tinbana WP'));
 await page.locator('.wa-soon').scrollIntoViewIfNeeded();await page.waitForTimeout(800);const soon=await page.locator('.wa-soon').evaluate(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {h:r.height,op:c.opacity,vis:c.visibility,anim:c.animationName,cls:el.className};});check('Meta signup card visible, button coming soon and disabled',soon.h>80&&+soon.op>0.9&&await page.getByRole('button',{name:/Conectar con Meta/}).isDisabled());
 await page.getByRole('button',{name:'Ver el paso a paso'}).click();const guide=page.locator('aside.wa-guide-drawer');await guide.waitFor();
 check('the guide opens in a side panel and explains the test number step by step with links to Meta',(await guide.locator('.wa-guide-steps li').count())===7&&(await guide.innerText()).includes('Usuarios del sistema')&&await guide.locator('a[href^="https://developers.facebook.com"]').count()>0);
 await guide.getByRole('tab',{name:'Mi número propio'}).click();
 check('and the own number with payment method and publishing the app',(await guide.locator('.wa-guide-steps li').count())===9&&/Publica tu app/.test(await guide.innerText())&&/método de pago/.test(await guide.innerText()));
 await page.getByRole('button',{name:'Reemplazar credenciales'}).click();await page.locator('input[name=phone_number_id]').fill('106540352242922');
 check('the page stays usable with the panel open (no backdrop): the form can be filled',await guide.isVisible()&&await page.locator('input[name=phone_number_id]').inputValue()==='106540352242922');
 await page.waitForTimeout(600);await page.screenshot({path:'test-results/whatsapp-guide.png'});
 await page.keyboard.press('Escape');await guide.waitFor({state:'detached'});check('Escape closes the panel',await guide.count()===0);
 await page.getByRole('button',{name:'Cancelar'}).click();
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(400);await page.screenshot({path:'test-results/whatsapp-connection.png',fullPage:true});
 const pad=await page.locator('.wa-account').evaluate(el=>{const card=el.getBoundingClientRect(),head=el.querySelector('.webhook-head').getBoundingClientRect();return {gap:Math.round(head.left-card.left),scrollLeft:el.scrollLeft};});
 check('focusing buttons never scrolls the card sideways (the halo is clipped)',pad.scrollLeft===0&&pad.gap>=20);
 await page.getByRole('button',{name:'Eliminar número'}).click();check('deleting asks for confirmation and explains what is removed',(await page.locator('.wa-confirm').innerText()).includes('conversaciones'));
 await page.getByRole('button',{name:'Cancelar'}).click();
 await page.evaluate(()=>{localStorage.setItem('tinvana-theme','dark');});await page.reload();await page.locator('.wa-account').waitFor();await page.waitForTimeout(300);await page.screenshot({path:'test-results/whatsapp-connection-dark.png',fullPage:true});
 await page.evaluate(()=>{localStorage.setItem('tinvana-theme','light');});
 await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('.wa-account').waitFor();
 check('connection fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/whatsapp-connection-mobile.png',fullPage:true});
 check('no browser errors',errors.length===0);
 console.log(`${checks} WhatsApp connection checks passed against a simulated Meta. Nothing reached Meta.`);
}finally{await helper('reset').catch(()=>{});await browser?.close();await owner?.ctx.dispose();await other?.ctx.dispose();await meta?.dispose();graph.close();}
