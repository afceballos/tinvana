// Store pixels (Meta, Google Analytics 4, Google Ads, Tag Manager) and domain verification: validation, isolation,
// landing markup, CSP and the Purchase value in the order response.
// Runs only against the isolated local test database (tests/run-suites.ps1 -Only store-tracking); removes what it creates.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let count=0;
const check=(name,value)=>{assert(value,name);count++;console.log('PASS '+name);};
class Client {
 cookie='';csrf='';
 async request(path,method='GET',body,token=this.csrf){const response=await fetch(base+path,{method,redirect:'manual',headers:{Cookie:this.cookie,...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});for(const c of response.headers.getSetCookie?.()||[]){const pair=c.split(';')[0];const name=pair.split('=')[0];this.cookie=[...this.cookie.split('; ').filter(x=>x&&!x.startsWith(name+'=')),pair].join('; ');}const text=await response.text();let data=null;try{data=JSON.parse(text);}catch{}return {response,data,text};}
 async init(){const r=await this.request('/api/auth/session');this.csrf=r.data.csrf;return r;}
 async login(email){await this.init();const r=await this.request('/api/auth/login','POST',{email,password:fixture.password});if(r.data.csrf)this.csrf=r.data.csrf;assert.equal(r.response.status,200);return r;}
}
const owner=new Client(),other=new Client(),visitor=new Client();
await owner.login(fixture.email);await other.login(fixture.otherEmail);await visitor.init();
const empty={metaPixel:'',ga4:'',googleAds:'',googleAdsLabel:'',gtm:'',metaVerify:'',googleVerify:''};
const lead=(extra={})=>({country_code:'CO',department_code:'11',city_code:'11001',address:'Calle 123 # 45-67',address_details:'Casa',postal_code:'110111',phone_country:'CO',first_name:'Ana',last_name:'Pixel',email:'pixel@example.test',phone:'3001234567',idempotency_key:randomUUID(),website:'',quantity:1,...extra});
const page=async slug=>{const r=await fetch(base+'/p/'+slug);return {html:await r.text(),csp:r.headers.get('content-security-policy')||''};};
let pid=null;
try{
 check('starts empty',JSON.stringify((await owner.request('/api/store/tracking')).data.tracking)===JSON.stringify(empty));
 check('save needs CSRF',(await owner.request('/api/store/tracking','PUT',{...empty,metaPixel:'123456789012345'},'bad')).response.status===419);
 check('bad pixel refused',(await owner.request('/api/store/tracking','PUT',{...empty,metaPixel:'<script>'})).response.status===422);
 check('bad GA4 refused',(await owner.request('/api/store/tracking','PUT',{...empty,ga4:'UA-1234-5'})).response.status===422);
 check('conversion label needs Ads ID',(await owner.request('/api/store/tracking','PUT',{...empty,googleAdsLabel:'AbCdEf123'})).response.status===422);
 check('unknown field refused',(await owner.request('/api/store/tracking','PUT',{...empty,customCode:'<script>alert(1)</script>'})).response.status===422);
 const saved=await owner.request('/api/store/tracking','PUT',{metaPixel:' 123456789012345 ',ga4:'g-ab12cd34ef',googleAds:'aw-987654321',googleAdsLabel:'AbCdEf123',gtm:'gtm-ab12cd3',metaVerify:'<meta name="facebook-domain-verification" content="abcdefghij0123456789klmnopqrst" />',googleVerify:'Zx_9-abcdefghijklmnopqrstuv'});
 const t=saved.data?.tracking;
 check('saved and normalized',saved.response.status===200&&t.metaPixel==='123456789012345'&&t.ga4==='G-AB12CD34EF'&&t.googleAds==='AW-987654321'&&t.gtm==='GTM-AB12CD3'&&t.metaVerify==='abcdefghij0123456789klmnopqrst');
 check('other store does not see them',JSON.stringify((await other.request('/api/store/tracking')).data.tracking)===JSON.stringify(empty));
 const product=await owner.request('/api/products/own','POST',{name:'Producto con píxel',price:50000,images:[]});pid=product.data.id;
 const landing=(await owner.request('/api/products/'+pid+'/landing','POST',{})).data.landing;
 const content={...landing.content,blocks:landing.content.blocks.map(b=>({...b,visible:b.type==='hero'}))};
 await owner.request('/api/landings/'+landing.id,'PUT',{content,slug:landing.slug});
 check('landing published',(await owner.request('/api/landings/'+landing.id+'/publish','POST',{})).response.status===200);
 let p=await page(landing.slug);
 const json=p.html.match(/<script type="application\/json" id="tb-tracking">(.*?)<\/script>/)?.[1];const config=json?JSON.parse(json):null;
 check('landing carries the pixel config',config&&config.meta==='123456789012345'&&config.ga4==='G-AB12CD34EF'&&config.ads==='AW-987654321'&&config.adsLabel==='AbCdEf123'&&config.gtm==='GTM-AB12CD3'&&config.product.price===50000&&config.product.currency==='COP'&&config.product.name==='Producto con píxel');
 check('verification tags in the head',p.html.includes('<meta name="facebook-domain-verification" content="abcdefghij0123456789klmnopqrst">')&&p.html.includes('<meta name="google-site-verification" content="Zx_9-abcdefghijklmnopqrstuv">'));
 check('no inline script added',!/<script>(?!<\/script>)/.test(p.html)&&!p.html.includes('fbq('));
 check('CSP opens only the tracking domains',/script-src 'self' [^;]*https:\/\/connect\.facebook\.net/.test(p.csp)&&/script-src [^;]*https:\/\/www\.googletagmanager\.com/.test(p.csp)&&/connect-src [^;]*https:\/\/www\.facebook\.com/.test(p.csp)&&/frame-src 'self' [^;]*td\.doubleclick\.net/.test(p.csp)&&!/unsafe-inline[^;]*;?\s*$/.test(p.csp.split('script-src')[1].split(';')[0]));
 const order=await visitor.request('/p/'+landing.slug+'/lead','POST',lead({quantity:2}),visitor.csrf);
 check('order response carries the Purchase value',order.response.status===202&&order.data.purchase?.value===100000&&order.data.purchase.currency==='COP'&&order.data.purchase.quantity===2);
 await owner.request('/api/store/tracking','PUT',{...empty,metaPixel:'123456789012345'});p=await page(landing.slug);
 check('only Meta: no Google domains',p.csp.includes('connect.facebook.net')&&!p.csp.includes('googletagmanager')&&!p.html.includes('google-site-verification'));
 await owner.request('/api/store/tracking','PUT',empty);p=await page(landing.slug);
 check('without IDs the page stays as before',!p.html.includes('tb-tracking')&&!p.csp.includes('facebook')&&!p.csp.includes('frame-src'));
 console.log(`OK ${count} checks passed`);
}finally{
 await owner.request('/api/store/tracking','PUT',empty);
 if(pid)await owner.request('/api/products/'+pid,'DELETE');
}
