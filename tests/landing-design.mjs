import {chromium,request} from '@playwright/test';
import {readFile,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
// Landing redesign: styles, fonts, readable button text, grid without gaps, floating WhatsApp/share, savings,
// sticky buy bar, scroll reveals with a no-JavaScript fallback, reduced motion and the template settings. Local only.
const base='http://127.0.0.1:8081',f=JSON.parse(await readFile('.tools/test-fixture.json','utf8')),run=promisify(execFile);let checks=0,browser;
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/orders-helper.php',...a])).stdout;
const uuid=()=>crypto.randomUUID();
const item=(title,description='')=>({id:uuid(),title,description,value:'',quantity:'',image:'',icon:'check',rating:null,date:'',visible:true});
const block=(type,variant,data,style={})=>({id:uuid(),type,visible:true,variant,style:{tone:'paper',space:'normal',align:'left',ratio:'landscape',...style},data});
const owner=await request.newContext({baseURL:base});let H;
async function save(content){const r=await owner.put('/api/landings/'+f.landing,{headers:H,data:{content,slug:f.slug}});assert(r.status()===200,'save '+r.status()+' '+await r.text());return (await r.json()).landing;}
try{
 await helper('reset-limits');
 const s=await(await owner.get('/api/auth/session')).json();await owner.post('/api/auth/login',{headers:{'X-CSRF-Token':s.csrf},data:{email:f.email,password:f.password}});H={'X-CSRF-Token':(await(await owner.get('/api/auth/session')).json()).csrf};
 // Template settings
 let t=(await(await owner.get('/api/template-settings')).json()).settings;
 check('template exposes style, font and share options with defaults',t.theme==='modern'&&t.font==='rubik'&&t.share&&t.share.copy===false);
 check('invalid style rejected',(await owner.put('/api/template-settings',{headers:H,data:{...t,theme:'neon'}})).status()===422);
 t=(await(await owner.put('/api/template-settings',{headers:H,data:{...t,primaryColor:'#193e35',backgroundColor:'#fafbf7'}})).json()).settings;
 check('old default palette counts as no colors and takes the new defaults',t.primaryColor==='#ff6a00'&&t.backgroundColor==='#fff8f1');
 // Landing content
 const landing=(await(await owner.get('/api/landings/'+f.landing)).json()).landing;const c=landing.content;
 const hero=c.blocks.find(b=>b.type==='hero');
 c.publicPrice=89900;c.commerce={...c.commerce,previousPrice:119900,stickyMobile:true,showShipping:true,shipping:'Envío a todo el país'};
 c.visual={...c.visual,primaryColor:'#ff6a00',backgroundColor:'#fff8f1',whatsapp:'573001234567',theme:'modern',font:'rubik',share:{native:false,whatsapp:true,facebook:true,copy:true}};
 const long=Array.from({length:10},(_,i)=>'<p>Párrafo '+(i+1)+' con información del producto para comprobar que la imagen acompaña la lectura cuando el texto es largo.</p>').join('');
 hero.data={...hero.data,text:long};
 c.blocks=[hero,
  block('usage','stepper',{title:'Cómo se usa',subtitle:'',items:[item('Abre la caja','Retira el empaque.'),item('Llénalo','Agrega agua.'),item('Disfruta','Listo para usar.')]},{align:'center'}),
  block('imageText','image-left',{title:'Pensado para tu día',subtitle:'',text:long,image:'',ctaText:'',items:[]}),
  block('benefits','cards',{title:'Por qué te va a gustar',subtitle:'Cuatro razones',items:[item('Resistente','Dura años.'),item('Liviano','Pesa poco.'),item('Fácil de limpiar','Agua y jabón.'),item('Garantía','Seis meses.')]},{align:'right'}),
  block('testimonials','cards',{title:'Lo que dicen',subtitle:'',items:[{...item('Ana P.','Me encantó, llegó rápido.'),rating:5},{...item('Luis R.','Muy buena calidad.'),rating:4}]}),
  block('faq','accordion',{title:'Preguntas frecuentes',subtitle:'',items:[item('¿Cuánto tarda?','<p>De 2 a 5 días.</p>'),item('¿Puedo pagar al recibir?','<p>Sí, contra entrega.</p>')]}),
  block('cta','band',{title:'Pídelo hoy',subtitle:'Últimas unidades',text:'',image:'',ctaText:'Quiero el mío'},{align:'center'})];
 await save(c);check('landing published with the new design',(await owner.post('/api/landings/'+f.landing+'/publish',{headers:H})).status()===200);
 const visitor=await request.newContext({baseURL:base});const html=await(await visitor.get('/p/'+f.slug)).text();await visitor.dispose();
 check('page declares style, font and readable button text',html.includes('data-theme="modern"')&&html.includes('data-font="rubik"')&&html.includes('--on-primary:#151311')&&html.includes('rel="preload" href="/landing-fonts/rubik.woff2"'));
 check('old base stylesheets no longer loaded',!html.includes('href="/landing.css"')&&!html.includes('/brand/brand.css'));
 check('real savings shown from the previous price',html.includes('Ahorras 25%'));
 check('footer is Tinvana, not the old name',html.includes('Página creada con Tinvana')&&!html.includes('Zenzales'));
 const runtime=await stat('backend/public/landing-assets/landing-runtime.js');const code=await readFile('backend/public/landing-assets/landing-runtime.js','utf8');
 check(`landing script is lighter and has no animation library (${Math.round(runtime.size/1024)} KB)`,runtime.size<110*1024&&!/GreenSock|gsap\.com/i.test(code));
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/p/'+f.slug);await page.locator('.type-hero h1').waitFor();
 check('buy button uses the readable text color',await page.locator('.type-hero .buy-trigger').evaluate(e=>getComputedStyle(e).color)==='rgb(21, 19, 17)');
 check('landing font applied',(await page.locator('.type-hero h1').evaluate(e=>getComputedStyle(e).fontFamily)).includes('Landing'));
 const cards=page.locator('.type-benefits .block-item');const row=await page.locator('.type-benefits .block-items').boundingBox();const last=await cards.nth(3).boundingBox();const first=await cards.nth(0).boundingBox();
 check('fourth card fills the last row of a three-column grid',Math.abs(last.width-row.width)<2&&first.width<row.width/2);
 const wa=page.locator('.float-wa');const box=await wa.boundingBox();
 check('WhatsApp floats at the bottom right with the product message',(await wa.getAttribute('href')).startsWith('https://wa.me/573001234567?text=Hola')&&box.x>1440-120&&box.y>900-120);
 await page.locator('.share-toggle').click();await page.locator('.share-panel').waitFor();
 check('share menu offers the enabled channels',await page.locator('.share-option',{hasText:'WhatsApp'}).count()===1&&await page.locator('.share-option',{hasText:'Facebook'}).count()===1&&await page.locator('[data-share-copy]').count()===1);
 await page.locator('[data-share-copy]').click();await page.locator('.share-status',{hasText:'Enlace copiado'}).waitFor();
 check('copy link confirms and copies the landing address',(await page.evaluate(()=>navigator.clipboard.readText())).includes('/p/'+f.slug));
 await page.keyboard.press('Escape');check('share menu closes with Escape',!(await page.locator('.share-menu').evaluate(e=>e.open)));
 await page.screenshot({path:'test-results/landing-modern.png'});
 const faq=page.locator('.type-faq');await faq.scrollIntoViewIfNeeded();await page.waitForTimeout(900);
 check('sections reveal when they scroll into view',await faq.evaluate(e=>e.classList.contains('is-in'))&&await page.locator('.type-faq .block-accordion').first().evaluate(e=>getComputedStyle(e).opacity)==='1');
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);await page.screenshot({path:'test-results/landing-modern-full.png',fullPage:true});
 check('testimonial ratings render as stars',await page.locator('.type-testimonials .testimonial-rating').first().getAttribute('aria-label')==='5 de 5 estrellas');
 // Sticky media beside long text
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200);const heroTop=(await page.locator('.type-hero').boundingBox()).y;await page.evaluate(y=>window.scrollTo(0,y+300),heroTop);await page.waitForTimeout(300);
 check('product image stays in view while the long description scrolls',await page.locator('.type-hero .hero-media').evaluate(e=>getComputedStyle(e).position)==='sticky'&&(await page.locator('.type-hero .hero-media').boundingBox()).y>=0&&(await page.locator('.type-hero .hero-media').boundingBox()).y<200);
 const it=page.locator('.type-imageText');const itTop=(await it.boundingBox()).y+await page.evaluate(()=>scrollY);await page.evaluate(y=>window.scrollTo(0,y+300),itTop);await page.waitForTimeout(300);
 check('image + text keeps the image in view with long text',(await page.locator('.type-imageText .editorial-image').boundingBox()).y<200&&(await page.locator('.type-imageText .editorial-image').boundingBox()).y>=0);
 // Steps centered
 const step=page.locator('.type-usage .block-item').first();const sb=await step.boundingBox();const nb=await step.locator('.item-number').boundingBox();
 check('centered steps: title and numbers share the alignment',Math.abs((nb.x+nb.width/2)-(sb.x+sb.width/2))<3&&await page.locator('.type-usage h2').evaluate(e=>getComputedStyle(e).textAlign)==='center');
 const card=page.locator('.type-benefits .block-item').first();const cardBox=await card.boundingBox();const iconBox=await card.locator('.item-icon').boundingBox();
 check('right alignment moves title, text and card icons to the right',await page.locator('.type-benefits h2').evaluate(e=>getComputedStyle(e).textAlign)==='right'&&await card.evaluate(e=>getComputedStyle(e).textAlign)==='right'&&cardBox.x+cardBox.width-(iconBox.x+iconBox.width)<40);
 // Call to action: title, text, then price and button, centered, without the purchase box
 const cta=page.locator('.type-cta');await cta.scrollIntoViewIfNeeded();await page.waitForTimeout(700);const cb=await cta.boundingBox();const bb=await cta.locator('.buy-trigger').boundingBox();
 check('call to action shows price and button after the text, centered',await cta.locator('.purchase-box').count()===0&&await cta.locator('.cta-actions .cta-price').count()===1&&Math.abs((bb.x+bb.width/2)-(cb.x+cb.width/2))<4);
 await page.screenshot({path:'test-results/landing-cta.png'});await page.evaluate(()=>window.scrollTo(0,0));
 // The dialog opened from the closing call to action (no quantity there) lets the buyer choose how many.
 await page.locator('.type-cta .buy-trigger').click();await page.locator('#purchase-dialog[open]').waitFor();
 await page.locator('#purchase-dialog .order-quantity [data-quantity-step="1"]').click();await page.locator('#purchase-dialog .order-quantity [data-quantity-step="1"]').click();
 check('quantity can be chosen inside the order dialog',await page.locator('#purchase-dialog [data-summary-quantity]').textContent()==='3'&&await page.locator('[data-lead-quantity]').inputValue()==='3'&&(await page.locator('#purchase-dialog [data-summary-total]').textContent()).includes('269.700')&&await page.locator('.type-hero [data-quantity]').inputValue()==='3');
 await page.screenshot({path:'test-results/landing-dialog-quantity.png'});await page.keyboard.press('Escape');
 // Mobile: sticky bar appears after the hero purchase box, floating buttons move above it.
 const m=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const mp=await m.newPage();mp.on('pageerror',e=>errors.push(e.message));
 await mp.goto(base+'/p/'+f.slug);await mp.locator('.type-hero h1').waitFor();await mp.waitForTimeout(400);
 check('sticky bar hidden while the hero purchase box is visible',!(await mp.locator('.mobile-purchase').evaluate(e=>e.classList.contains('is-visible'))));
 await mp.evaluate(()=>window.scrollTo(0,400));await mp.waitForTimeout(500);
 check('sticky bar shows while reading a long description before the purchase box',await mp.locator('.mobile-purchase').evaluate(e=>e.classList.contains('is-visible'))&&await mp.evaluate(()=>document.querySelector('[data-hero-buy]').getBoundingClientRect().top>innerHeight));
 await mp.locator('.type-faq').scrollIntoViewIfNeeded();await mp.waitForTimeout(700);
 check('sticky bar appears after scrolling past the product',await mp.locator('.mobile-purchase').evaluate(e=>e.classList.contains('is-visible')));
 const bar=await mp.locator('.mobile-purchase').boundingBox();const fwa=await mp.locator('.float-wa').boundingBox();
 check('floating buttons sit above the sticky bar',fwa.y+fwa.height<=bar.y+1);
 check('mobile has no horizontal scroll',await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mp.screenshot({path:'test-results/landing-modern-mobile.png'});await m.close();
 // Without JavaScript the content stays visible.
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:1280,height:900}});const np=await nojs.newPage();await np.goto(base+'/p/'+f.slug);
 check('without JavaScript every section is visible',await np.locator('.type-faq .block-accordion').first().evaluate(e=>getComputedStyle(e).opacity)==='1'&&await np.locator('.type-benefits .block-item').first().evaluate(e=>getComputedStyle(e).opacity)==='1');
 check('without JavaScript the share menu still opens',await np.locator('.share-menu summary').count()===1);await nojs.close();
 // Reduced motion: no animations.
 const rm=await browser.newContext({reducedMotion:'reduce'});const rp=await rm.newPage();await rp.goto(base+'/p/'+f.slug);await rp.locator('.type-hero h1').waitFor();
 check('reduced motion keeps the page still',await rp.locator('.type-hero .hero-media').evaluate(e=>getComputedStyle(e).animationName)==='none'&&!(await rp.evaluate(()=>document.body.classList.contains('motion-ready'))));await rm.close();
 // Other styles
 for(const [theme,font] of [['warm','fraunces'],['bold','grotesk']]){
  c.visual={...c.visual,theme,font};await save(c);await owner.post('/api/landings/'+f.landing+'/publish',{headers:H});
  const tp=await ctx.newPage();await tp.goto(base+'/p/'+f.slug);await tp.locator('.type-hero h1').waitFor();await tp.waitForTimeout(1000);
  check(`${theme} style renders with ${font}`,await tp.evaluate(()=>document.body.dataset.theme)===theme&&await tp.evaluate(()=>document.body.dataset.font)===font);
  if(theme==='bold')check('bold style paints the hero with the brand color',await tp.locator('.type-hero').evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(255, 106, 0)');
  if(theme==='warm')check('warm style folds the card corner',(await tp.locator('.type-benefits .block-item').first().evaluate(e=>getComputedStyle(e).clipPath)).includes('polygon'));
  await tp.screenshot({path:`test-results/landing-${theme}.png`});for(let y=0;y<4000;y+=500){await tp.evaluate(v=>window.scrollTo(0,v),y);await tp.waitForTimeout(150);}await tp.waitForTimeout(800);await tp.evaluate(()=>window.scrollTo(0,0));await tp.screenshot({path:`test-results/landing-${theme}-full.png`,fullPage:true});
  await tp.setViewportSize({width:390,height:844});check(`${theme} fits mobile`,await tp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await tp.screenshot({path:`test-results/landing-${theme}-mobile.png`,fullPage:true});await tp.close();
 }
 // Background rhythm an AI landing receives (hero on the page color, then white / soft tint, closing band).
 c.visual={...c.visual,theme:'modern',font:'rubik'};c.blocks=c.blocks.map((b,i)=>({...b,style:{...b.style,tone:b.type==='hero'||b.type==='cta'?'paper':['white','soft'][(i-1)%2]}}));await save(c);await owner.post('/api/landings/'+f.landing+'/publish',{headers:H});
 const ap=await ctx.newPage();await ap.goto(base+'/p/'+f.slug);await ap.locator('.type-hero h1').waitFor();for(let y=0;y<4000;y+=500){await ap.evaluate(v=>window.scrollTo(0,v),y);await ap.waitForTimeout(150);}await ap.waitForTimeout(800);await ap.evaluate(()=>window.scrollTo(0,0));
 check('alternating backgrounds render distinctly',await ap.locator('.type-benefits').evaluate(e=>getComputedStyle(e).backgroundColor)!==await ap.locator('.type-testimonials').evaluate(e=>getComputedStyle(e).backgroundColor));
 await ap.screenshot({path:'test-results/landing-ai-rhythm.png',fullPage:true});await ap.close();
 check('no browser errors',errors.length===0);
 console.log(`${checks} landing design checks passed. Local isolated database only.`);
}finally{await browser?.close();await owner.dispose();}
