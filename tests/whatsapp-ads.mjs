import {chromium,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHmac,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// WhatsApp stage 4: offers, Click to WhatsApp ads, offer codes, entries and the landing WhatsApp button.
// Simulated Graph API on 8446 and simulated OpenAI on 8447. Nothing reaches Meta or an AI provider.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/whatsapp-helper.php',...a])).stdout;
const SECRET=process.env.WHATSAPP_APP_SECRET;assert(SECRET&&process.env.AI_OPENAI_URL,'WhatsApp/AI test environment missing');
const PHONE='106540352242922',WABA='102290129340398',OTHER_PHONE='109876543210987',OTHER_WABA='108765432109876',TOKEN='EAAG'+'x'.repeat(60);
const tls={key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')};
const sends=[];let seq=0;
const graph=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const b=JSON.parse(raw||'{}');sends.push(b);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({messaging_product:'whatsapp',messages:[{id:'wamid.OUT'+(++seq)}]}));});});
const ai=[];
const openai=createServer(tls,(req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
 const p=JSON.parse(raw);const input=JSON.parse(p.input[0].content);ai.push(input);
 const empty={name:'',city:'',department:'',address:'',neighborhood:'',reference:'',quantity:'',variant:''};
 const last=[...input.history].reverse().find(m=>m.from==='cliente')?.text||'';
 let out;
 if(input.offer)out={reply:`¡Hola! ${input.offer.name}: ${input.offer.price_text}. ¿Lo pedimos?`,intent:'oferta',product_id:'',captured:/lo quiero/i.test(last)?{...empty,name:'Laura',city:'Pereira'}:empty,action:'none',handoff_reason:''};
 else if(!input.product)out={reply:'¡Hola! ¿Qué producto te interesa?',intent:'producto',product_id:'',captured:empty,action:'ask_product',handoff_reason:''};
 else out={reply:'Te cuento del producto.',intent:'info',product_id:input.product.id,captured:empty,action:'none',handoff_reason:''};
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(out)}]}],usage:{input_tokens:100,output_tokens:20}}));
});});
await new Promise(r=>graph.listen(8446,'127.0.0.1',r));await new Promise(r=>openai.listen(8447,'127.0.0.1',r));
async function login(email){const ctx=await request.newContext({baseURL:base});const s=await(await ctx.get('/api/auth/session')).json();await ctx.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email,password:f.password}});return {ctx,H:{'X-CSRF-Token':(await(await ctx.get('/api/auth/session')).json()).csrf}};}
let owner,other,meta;
const hookRaw=body=>meta.post('/whatsapp/webhook',{headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',SECRET).update(body).digest('hex')},data:body});
const say=(from,name,text,referral,phone=PHONE,waba=WABA)=>hookRaw(JSON.stringify({object:'whatsapp_business_account',entry:[{id:waba,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'15551550926',phone_number_id:phone},contacts:[{profile:{name},wa_id:from}],messages:[{from,id:'wamid.IN.'+randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:text},...(referral?{referral}:{})}]}}]}]}));
const ref=(id,headline)=>({source_url:'https://fb.me/x'+id.slice(-4),source_id:id,source_type:'ad',body:'Texto del anuncio '+headline,headline,media_type:'image',image_url:'https://scontent.example.test/'+id+'.jpg',ctwa_clid:'clid-'+id,welcome_message:{text:'¡Hola!'}});
const convOf=async phone=>(await(await owner.ctx.get('/api/whatsapp/conversations?q='+phone)).json()).conversations[0];
const detail=async id=>(await(await owner.ctx.get('/api/whatsapp/conversations/'+id)).json()).conversation;
const ads=async(who=owner)=>(await who.ctx.get('/api/whatsapp/ads')).json();
const lastAi=()=>ai.at(-1);
try{
 await helper('reset');
 owner=await login(f.email);other=await login(f.otherEmail);meta=await request.newContext({baseURL:base});
 await owner.ctx.put('/api/whatsapp/account',{headers:owner.H,data:{phone_number_id:PHONE,waba_id:WABA,token:TOKEN}});
 await other.ctx.put('/api/whatsapp/account',{headers:other.H,data:{phone_number_id:OTHER_PHONE,waba_id:OTHER_WABA,token:TOKEN}});
 const product2=(await helper('add-product')).trim();
 // Agent ready: AI connected and both products with approved sheets.
 await owner.ctx.put('/api/ai/connections/openai',{headers:owner.H,data:{key:'test-key-ads-openai-123456789'}});await owner.ctx.post('/api/ai/connections/openai/activate',{headers:owner.H});
 for(const pid of [f.product,product2]){await owner.ctx.put(`/api/whatsapp/sheets/${pid}`,{headers:owner.H,data:{content:{summary:'Ficha aprobada.',can_say:'Beneficios.',price_note:'',faq:[],must_not:''}}});await owner.ctx.post(`/api/whatsapp/sheets/${pid}/approve`,{headers:owner.H});}
 // Offers
 check('an offer needs a product, a name and valid units',(await owner.ctx.post('/api/whatsapp/offers',{headers:owner.H,data:{product_id:f.product,name:'',units:1,price_mode:'fixed',fixed_price:68000}})).status()===422&&(await owner.ctx.post('/api/whatsapp/offers',{headers:owner.H,data:{product_id:f.product,name:'x',units:0,price_mode:'fixed',fixed_price:1}})).status()===422);
 check('offers require CSRF',(await owner.ctx.post('/api/whatsapp/offers',{headers:{'X-CSRF-Token':'bad'},data:{product_id:f.product,name:'x',units:1,price_mode:'fixed',fixed_price:1}})).status()===419);
 let v=await(await owner.ctx.post('/api/whatsapp/offers',{headers:owner.H,data:{product_id:f.product,name:'el picatodo eléctrico',units:1,price_mode:'fixed',fixed_price:68000,landing_default:true}})).json();
 const pica1=v.offers[0];
 check('an offer gets a TB code, a server-computed price and the message to paste in the ad',/^TB-[A-Z0-9]{2,12}$/.test(pica1.code)&&pica1.price.text==='1 unidad · $68.000'&&pica1.message===`Hola, quiero el picatodo eléctrico (${pica1.code})`);
 v=await(await owner.ctx.post('/api/whatsapp/offers',{headers:owner.H,data:{product_id:product2,name:'2 cepillos eléctricos',units:2,price_mode:'fixed',fixed_price:99000,code:'TB-CEP2'}})).json();
 v=await(await owner.ctx.post('/api/whatsapp/offers',{headers:owner.H,data:{product_id:product2,name:'el cepillo eléctrico',units:1,price_mode:'fixed',fixed_price:59000,code:'TB-CEP1'}})).json();
 const cep2=v.offers.find(o=>o.code==='TB-CEP2'),cep1=v.offers.find(o=>o.code==='TB-CEP1');
 check('two offers of the same product with different combos',cep2.units===2&&cep2.price.text==='2 unidades · $99.000'&&cep1.price.text==='1 unidad · $59.000');
 check('a repeated code is refused',(await owner.ctx.post('/api/whatsapp/offers',{headers:owner.H,data:{product_id:product2,name:'otra',units:1,price_mode:'fixed',fixed_price:1,code:'TB-CEP1'}})).status()===409);
 check('tier pricing without active tiers says the price is pending',(await(await owner.ctx.post('/api/whatsapp/offers',{headers:owner.H,data:{product_id:f.product,name:'tramos',units:3,price_mode:'tiers'}})).json()).offers.find(o=>o.name==='tramos').price.text===null);
 // Ads prepared before publishing
 v=await(await owner.ctx.post('/api/whatsapp/ads',{headers:owner.H,data:{ad_id:'120210448812734471',name:'Anuncio A · Picatodo',offer_id:pica1.id}})).json();
 v=await(await owner.ctx.post('/api/whatsapp/ads',{headers:owner.H,data:{ad_id:'120210448812739902',name:'Anuncio B · Cepillo x2',offer_id:cep2.id}})).json();
 check('ads can be added before publishing with their offer',v.ads.length===2&&v.ads.every(a=>a.status==='active'&&a.origin==='manual'));
 check('an invalid ad id or a duplicate is refused',(await owner.ctx.post('/api/whatsapp/ads',{headers:owner.H,data:{ad_id:'abc',name:'x'}})).status()===422&&(await owner.ctx.post('/api/whatsapp/ads',{headers:owner.H,data:{ad_id:'120210448812734471',name:'x'}})).status()===409);
 // Ads A and B with the same «Hola»
 await say('573001110001','Laura Gómez','Hola',ref('120210448812734471','Picatodo 5 en 1'));let c=await detail((await convOf('573001110001')).id);
 check('ad A identifies its offer with high certainty and the agent presents it',c.entry.method==='ad'&&c.entry.certainty==='alta'&&c.entry.ad.name==='Anuncio A · Picatodo'&&c.entry.offer.code===pica1.code&&lastAi().offer.price_text==='1 unidad · $68.000'&&sends.at(-1).text.body.includes('$68.000'));
 check('the agent gets the product of the offer',lastAi().product.id===f.product);
 await say('573001110002','Carlos Ruiz','Hola',ref('120210448812739902','2 cepillos'));c=await detail((await convOf('573001110002')).id);
 check('ad B with the same «Hola» identifies a different product and combo',c.entry.offer.code==='TB-CEP2'&&lastAi().product.id===product2&&lastAi().offer.units===2&&sends.at(-1).text.body.includes('$99.000'));
 // New ad not assigned
 await say('573001110003','Ana Torres','Hola',ref('120210448812755508','2 cepillos con envío gratis'));c=await detail((await convOf('573001110003')).id);
 v=await ads();const fresh=v.ads.find(a=>a.ad_id==='120210448812755508');
 check('a new ad appears unassigned with the title and image Meta sent',fresh.status==='unassigned'&&fresh.origin==='first_message'&&fresh.name==='2 cepillos con envío gratis'&&fresh.source.image_url.endsWith('.jpg')&&v.unassigned===1);
 check('without an offer the agent asks which product, never picking one by default',c.entry.certainty==='baja'&&c.entry.offer===null&&lastAi().product===null&&lastAi().offer===null&&sends.at(-1).text.body.includes('Qué producto'));
 await owner.ctx.put('/api/whatsapp/ads/'+fresh.id,{headers:owner.H,data:{offer_id:cep2.id}});
 await say('573001110004','Diana López','Hola',ref('120210448812755508','2 cepillos con envío gratis'));c=await detail((await convOf('573001110004')).id);
 check('after assigning it, the next customer from that ad gets the offer',c.entry.offer.code==='TB-CEP2'&&(await ads()).ads.find(a=>a.ad_id==='120210448812755508').entries_7d===2);
 // Codes
 await say('573001110005','Jorge Medina','Hola, quiero el cepillo eléctrico (TB-CEP1)');c=await detail((await convOf('573001110005')).id);
 check('a typed code is only a hint (medium certainty) and the agent is told to confirm it',c.entry.method==='code_text'&&c.entry.certainty==='media'&&c.entry.offer.code==='TB-CEP1'&&lastAi().offer.certainty==='media');
 const landingText=(await helper('landing-text')).trim();
 check('the landing WhatsApp button carries the landing offer code with a signature',landingText.startsWith(`Hola, quiero el picatodo eléctrico (${pica1.code}-`)&&/-[A-Z0-9]{4}\)$/.test(landingText));
 await say('573001110006','Marta Ríos',landingText);c=await detail((await convOf('573001110006')).id);
 check('the signed landing code identifies the offer with high certainty',c.entry.method==='code_link'&&c.entry.certainty==='alta'&&c.entry.offer.code===pica1.code);
 await say('573001110007','Pedro Paz',landingText.replace(/-[A-Z0-9]{4}\)$/,'-ZZZZ)'));c=await detail((await convOf('573001110007')).id);
 check('an edited signature is treated as a typed code',c.entry.method==='code_text'&&c.entry.certainty==='media');
 await say('573001110008','Sofía Gil','Hola, ¿qué venden?');c=await detail((await convOf('573001110008')).id);
 check('a message without ad or code has no entry and the agent asks',c.entry===null&&lastAi().product===null);
 // Same phone, another ad
 await say('573001110001','Laura Gómez','Lo quiero, soy Laura de Pereira');
 await say('573001110001','Laura Gómez','Hola',ref('120210448812739902','2 cepillos'));c=await detail((await convOf('573001110001')).id);
 check('the same customer arriving by another ad is a new entry and the agent asks whether to continue',c.entry.offer.code==='TB-CEP2'&&lastAi().offer.new_entry_while_buying===true&&c.captured.some(x=>x.key==='city'&&x.value==='Pereira'));
 // Paused ad, archived offer
 const adA=(await ads()).ads.find(a=>a.ad_id==='120210448812734471');await owner.ctx.put('/api/whatsapp/ads/'+adA.id,{headers:owner.H,data:{status:'paused'}});
 await say('573001110009','Luis Paz','Hola',ref('120210448812734471','Picatodo 5 en 1'));c=await detail((await convOf('573001110009')).id);
 check('a paused ad does not assign its offer',c.entry.offer===null);
 await owner.ctx.delete('/api/whatsapp/offers/'+cep1.id,{headers:owner.H});
 await say('573001110010','Eva Ruiz','Quiero (TB-CEP1)');c=await detail((await convOf('573001110010')).id);
 check('an archived offer is no longer offered',c.entry===null&&!(await ads()).offers.some(o=>o.id===cep1.id));
 // Isolation
 check('another store sees none of these ads or offers',(await ads(other)).ads.length===0&&(await ads(other)).offers.length===0);
 check('another store cannot change them',(await other.ctx.put('/api/whatsapp/ads/'+adA.id,{headers:other.H,data:{status:'active'}})).status()===404&&(await other.ctx.delete('/api/whatsapp/offers/'+pica1.id,{headers:other.H})).status()===404);
 await say('573001110011','Lina','Hola',ref('120210448812734471','Picatodo 5 en 1'),OTHER_PHONE,OTHER_WABA);
 check('the same ad id at another store is a separate, unassigned ad of that store',(await ads(other)).ads.length===1&&(await ads(other)).ads[0].status==='unassigned'&&(await ads()).ads.find(a=>a.ad_id==='120210448812734471').offer.code===pica1.code);
 // Panel
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({storageState:await owner.ctx.storageState(),viewport:{width:1440,height:1000}});const page=await ctx.newPage();page.on('pageerror',x=>errors.push(x.message));
 await page.goto(base+'/panel/whatsapp/anuncios');await page.locator('.wa-ads-table tbody tr').first().waitFor();
 check('the Anuncios tab lists ads, offers and the messages to copy',await page.locator('.wa-ads-table tbody tr').count()===3&&await page.locator('.wa-offer-list li').count()===3&&await page.locator('.wa-msg-list li').count()===3);
 const reveal=async()=>{for(let y=0;y<4000;y+=500){await page.evaluate(v=>scrollTo(0,v),y);await page.waitForTimeout(120);}await page.waitForTimeout(700);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);};
 await reveal();await page.screenshot({path:'test-results/whatsapp-ads.png',fullPage:true});
 await page.locator('.wa-help-grid').scrollIntoViewIfNeeded();await page.waitForTimeout(600);await page.screenshot({path:'test-results/whatsapp-ads-guide.png'});
 await page.evaluate(()=>localStorage.setItem('tinvana-theme','dark'));await page.reload();await page.locator('.wa-ads-table').waitFor();await reveal();await page.screenshot({path:'test-results/whatsapp-ads-dark.png',fullPage:true});
 await page.evaluate(()=>localStorage.setItem('tinvana-theme','light'));
 await page.getByRole('button',{name:'+ Nueva oferta'}).click();await page.locator('.wa-inline-form').waitFor();
 await page.locator('.wa-inline-form input[placeholder="Ej. el picatodo eléctrico"]').fill('3 picatodos');await page.locator('.wa-inline-form input[type=number]').first().fill('3');
 await page.locator('.wa-inline-form label',{hasText:'Precio fijo'}).click();await page.locator('.wa-inline-form input[placeholder="Ej. 99000"]').fill('150000');
 await page.getByRole('button',{name:'Guardar oferta'}).click();await page.locator('.wa-offer-list li',{hasText:'3 picatodos'}).waitFor();
 check('a new offer is created from the panel',(await page.locator('.wa-offer-list li',{hasText:'3 picatodos'}).innerText()).includes('$150.000'));
 const lauraId=(await convOf('573001110001')).id;await page.goto(base+'/panel/whatsapp/'+lauraId);await page.locator('.wa-context').waitFor();
 check('the chat context shows the ad, the method, the certainty and the offer',/Origen de esta entrada/i.test(await page.locator('.wa-context').innerText())&&(await page.locator('.wa-context').innerText()).includes('TB-CEP2'));
 await page.waitForTimeout(400);await page.screenshot({path:'test-results/whatsapp-ads-chat.png'});
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/panel/whatsapp/anuncios');await page.locator('.wa-ads-table').waitFor();
 check('the Anuncios page fits mobile (the table scrolls inside its card)',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForTimeout(400);await page.screenshot({path:'test-results/whatsapp-ads-mobile.png',fullPage:true});
 check('no browser errors',errors.length===0);
 console.log(`${checks} WhatsApp ads checks passed against a simulated Meta and a simulated AI. Nothing reached Meta or an AI provider.`);
}finally{await helper('reset').catch(()=>{});await browser?.close();await owner?.ctx.dispose();await other?.ctx.dispose();await meta?.dispose();graph.close();openai.close();}
