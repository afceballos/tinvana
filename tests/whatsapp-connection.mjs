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
const graphCalls=[];
const graph=createServer({key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')},(req,res)=>{
 graphCalls.push(req.method+' '+req.url);const auth=req.headers.authorization||'';
 const send=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 if(auth!=='Bearer '+TOKEN)return send(401,{error:{message:'Invalid OAuth access token.',type:'OAuthException',code:190}});
 if(req.method==='GET'&&req.url.startsWith('/'+PHONE+'?'))return send(200,{verified_name:'Tienda Andrés',display_phone_number:'+57 300 555 0142',quality_rating:'GREEN',id:PHONE});
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
 check('the test only reads the number (no message sent)',graphCalls.length===1&&graphCalls[0].startsWith('GET /'+PHONE+'?fields='));
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
 r=await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(body)},data:body});
 let e=await events();
 check('signed message stored once and acknowledged',r.status()===200&&await r.text()==='EVENT_RECEIVED'&&e.length===1&&e[0].dedupe_key==='msg:wamid.TEST1'&&e[0].kind==='message'&&e[0].user_id===f.owner&&e[0].payload.message.text.body==='Hola');
 for(let i=0;i<10;i++)await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(body)},data:body});
 check('the same event delivered ten times is stored once',(await events()).length===1);
 const statuses=delivery({body:{statuses:[{id:'wamid.OUT1',status:'sent',timestamp:'1777000100',recipient_id:'573001112233'},{id:'wamid.OUT1',status:'delivered',timestamp:'1777000101',recipient_id:'573001112233'}]}});
 for(let i=0;i<3;i++)await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(statuses)},data:statuses});
 e=await events();check('each delivery status is stored once',e.filter(x=>x.kind==='status').length===2&&e.some(x=>x.dedupe_key==='st:wamid.OUT1:delivered'));
 const foreign=delivery({phone:'999999999999',...textMessage('wamid.FOREIGN')});await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(foreign)},data:foreign});
 const otherWaba=delivery(textMessage('wamid.OTHERWABA'),'555555555555555');await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(otherWaba)},data:otherWaba});
 e=await events();const ignored=e.filter(x=>x.status==='ignored');
 check('events of another number or WhatsApp account are ignored without keeping their content',ignored.length===2&&ignored.every(x=>x.user_id===null&&Object.keys(x.payload).length===0));
 const huge='x'.repeat(3145729);check('payloads over 3 MB refused',(await meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign(huge)},data:huge})).status()===413);
 // Panel
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1440,height:1000}});const page=await ctx.newPage();page.on('pageerror',x=>errors.push(x.message));
 await page.goto(base+'/panel/whatsapp');await page.waitForURL('**/panel/whatsapp/conexion');await page.locator('.wa-account').waitFor();
 check('menu shows Ventas WhatsApp and opens the connection',await page.locator('.app-sidebar nav a',{hasText:'Ventas WhatsApp'}).count()===1&&(await page.locator('.wa-account').innerText()).includes('+57 300 555 0142'));
 await page.reload();await page.locator('.wa-account').waitFor();check('reloading the module page works',true);
 await page.locator('.wa-soon').scrollIntoViewIfNeeded();await page.waitForTimeout(800);const soon=await page.locator('.wa-soon').evaluate(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {h:r.height,op:c.opacity,vis:c.visibility,anim:c.animationName,cls:el.className};});check('Meta signup card visible, button coming soon and disabled',soon.h>80&&+soon.op>0.9&&await page.getByRole('button',{name:/Conectar con Meta/}).isDisabled());
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(400);await page.screenshot({path:'test-results/whatsapp-connection.png',fullPage:true});
 await page.getByRole('button',{name:'Eliminar número'}).click();check('deleting asks for confirmation and explains what is removed',(await page.locator('.wa-confirm').innerText()).includes('conversaciones'));
 await page.getByRole('button',{name:'Cancelar'}).click();
 await page.evaluate(()=>{localStorage.setItem('tinvana-theme','dark');});await page.reload();await page.locator('.wa-account').waitFor();await page.waitForTimeout(300);await page.screenshot({path:'test-results/whatsapp-connection-dark.png',fullPage:true});
 await page.evaluate(()=>{localStorage.setItem('tinvana-theme','light');});
 await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('.wa-account').waitFor();
 check('connection fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/whatsapp-connection-mobile.png',fullPage:true});
 check('no browser errors',errors.length===0);
 console.log(`${checks} WhatsApp connection checks passed against a simulated Meta. Nothing reached Meta.`);
}finally{await helper('reset').catch(()=>{});await browser?.close();await owner?.ctx.dispose();await other?.ctx.dispose();await meta?.dispose();graph.close();}
