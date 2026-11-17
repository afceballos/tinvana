// Wompi phase 1: store connection (four keys, encrypted), read-only key checks, the store's events URL with checksum,
// the sandbox test payment and plan gating. Wompi is simulated on https://127.0.0.1:8449 (WOMPI_API_URL); nothing reaches Wompi.
// Runs only against the isolated local test database (tests/run-suites.ps1 -Only wompi-connection).
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8081',fixture=JSON.parse(await readFile('.tools/test-fixture.json','utf8'));let count=0;
const check=(name,value)=>{assert(value,name);count++;console.log('PASS '+name);};
const run=promisify(execFile);const helper=async(...a)=>(await run('.tools/php/php.exe',['backend/tests/whatsapp-helper.php',...a])).stdout;
const sha=s=>createHash('sha256').update(s).digest('hex');
// Fake keys with Wompi's formats (not real ones).
const K={public_key:'pub_test_FakePublicKey000000000001',private_key:'prv_test_FakePrivateKey00000000001',events_secret:'test_events_FakeEventsSecret0000001',integrity_secret:'test_integrity_FakeIntegrity00000001'};
const received=[];
const wompi=createServer({key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')},(req,res)=>{
 received.push({url:req.url,auth:req.headers.authorization||''});const json=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 if(req.url===`/v1/merchants/${K.public_key}`)return json(200,{data:{name:'Comercio simulado',accepted_payment_methods:['CARD','PSE','NEQUI'],presigned_acceptance:{acceptance_token:'simulated'}}});
 if(req.url.startsWith('/v1/merchants/'))return json(422,{error:{type:'INPUT_VALIDATION_ERROR'}});
 if(req.url.startsWith('/v1/transactions?reference=tb-check-'))return req.headers.authorization===`Bearer ${K.private_key}`?json(200,{data:[],meta:{}}):json(401,{error:{type:'INVALID_ACCESS_TOKEN'}});
 json(404,{error:{type:'NOT_FOUND'}});
});
await new Promise(r=>wompi.listen(8449,'127.0.0.1',r));
class Client {
 cookie='';csrf='';
 async request(path,method='GET',body,token=this.csrf,headers={}){const response=await fetch(base+path,{method,redirect:'manual',headers:{Cookie:this.cookie,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':token}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});for(const c of response.headers.getSetCookie?.()||[]){const pair=c.split(';')[0];const name=pair.split('=')[0];this.cookie=[...this.cookie.split('; ').filter(x=>x&&!x.startsWith(name+'=')),pair].join('; ');}const text=await response.text();let data=null;try{data=JSON.parse(text);}catch{}return {response,data,text};}
 async init(){const r=await this.request('/api/auth/session');this.csrf=r.data.csrf;return r;}
 async login(email){await this.init();const r=await this.request('/api/auth/login','POST',{email,password:fixture.password});if(r.data.csrf)this.csrf=r.data.csrf;assert.equal(r.response.status,200);return r;}
}
const owner=new Client(),other=new Client();await owner.login(fixture.email);await other.login(fixture.otherEmail);
const event=(tx,secret=K.events_secret,environment='test')=>{const timestamp=1763400000;const props=['transaction.id','transaction.status','transaction.amount_in_cents'];const checksum=sha(tx.id+tx.status+tx.amount_in_cents+timestamp+secret);return {event:'transaction.updated',data:{transaction:{payment_method_type:'CARD',currency:'COP',...tx}},environment,signature:{properties:props,checksum},timestamp,sent_at:'2026-11-17T18:00:00.000Z'};};
const deliver=(url,body,checksum)=>fetch(url.replace(/^https?:\/\/[^/]+/,base),{method:'POST',headers:{'Content-Type':'application/json',...(checksum?{'X-Event-Checksum':checksum}:{})},body:JSON.stringify(body)});
try{
 check('starts without account',(await owner.request('/api/wompi/account')).data.account===null);
 check('save needs CSRF',(await owner.request('/api/wompi/account','PUT',K,'bad')).response.status===419);
 check('missing key refused',(await owner.request('/api/wompi/account','PUT',{...K,events_secret:''})).response.status===422);
 check('bad format refused',(await owner.request('/api/wompi/account','PUT',{...K,private_key:'sk_live_123'})).response.status===422);
 check('mixed environments refused',(await owner.request('/api/wompi/account','PUT',{...K,private_key:'prv_prod_FakePrivateKey00000000001'})).response.status===422);
 check('unknown field refused',(await owner.request('/api/wompi/account','PUT',{...K,extra:'x'})).response.status===422);
 let r=await owner.request('/api/wompi/account','PUT',K);let a=r.data?.account;
 check('saved and tested against the simulator',r.response.status===200&&a.status==='connected'&&a.environment==='test'&&a.merchant_name==='Comercio simulado'&&a.payment_methods.join()==='CARD,PSE,NEQUI'&&/^Conexión con Wompi comprobada/.test(r.data.message));
 check('secret keys never come back',!r.text.includes('prv_test_')&&!r.text.includes('test_events_')&&!r.text.includes('test_integrity_'));
 check('private key sent only as Bearer to the search',received.some(x=>x.url.startsWith('/v1/transactions?reference=tb-check-')&&x.auth===`Bearer ${K.private_key}`)&&received.filter(x=>x.url.startsWith('/v1/merchants/')).every(x=>x.auth===''));
 const url=a.events_url;check('store gets its own events URL',/\/wompi\/events\/we[a-f0-9]{40}$/.test(url));
 check('other store does not see it',(await other.request('/api/wompi/account')).data.account===null);
 r=await owner.request('/api/wompi/account','PUT',{...K,private_key:'prv_test_WrongPrivateKey0000000001'});
 check('wrong private key marked as error',r.data.account.status==='error'&&/llave privada/.test(r.data.account.last_error));
 r=await owner.request('/api/wompi/account','PUT',{public_key:K.public_key,private_key:K.private_key,events_secret:'',integrity_secret:''});
 check('update keeps stored secrets and the URL',r.data.account.status==='connected'&&r.data.account.events_url===url);
 check('switching environment needs all four keys',(await owner.request('/api/wompi/account','PUT',{public_key:'pub_prod_FakePublicKey000000000001',private_key:'',events_secret:'',integrity_secret:''})).response.status===422);
 // Events.
 const tx={id:'1001-1763400000-11111',status:'APPROVED',amount_in_cents:1000000,reference:'tb-test-abc123'};
 check('wrong checksum refused (401)',(await deliver(url,event(tx,'test_events_Other'))).status===401);
 a=(await owner.request('/api/wompi/account')).data.account;check('rejection is recorded',!!a.last_rejected_at&&!a.last_event_at);
 check('signed event accepted',(await deliver(url,event(tx))).status===200);
 check('duplicate acknowledged',(await deliver(url,event(tx))).status===200);
 const ev=event({...tx,status:'DECLINED'});check('checksum read from the header',(await deliver(url,ev,ev.signature.checksum.toUpperCase())).status===200);
 check('event of the other environment not kept',(await deliver(url,event({...tx,id:'2002-1',status:'APPROVED'},K.events_secret,'prod'))).status===200);
 let v=(await owner.request('/api/wompi/account')).data;
 check('events stored once per transaction and status',v.events.length===2&&v.events.some(e=>e.status==='APPROVED'&&e.amount===10000&&e.payment_method==='CARD'&&e.reference==='tb-test-abc123')&&v.events.some(e=>e.status==='DECLINED'));
 check('secrets shown as proven',!!v.account.last_event_at&&!!v.account.integrity_checked_at);
 check('unknown URL is 404',(await deliver(base+'/wompi/events/we'+'0'.repeat(40),event(tx))).status===404);
 check('GET on the events URL refused',(await fetch(url.replace(/^https?:\/\/[^/]+/,base))).status===405);
 check('other store events are separate',(await other.request('/api/wompi/account')).data.events.length===0);
 // Sandbox test payment.
 r=await owner.request('/api/wompi/account/test-payment','POST',{});const pay=new URL(r.data.url);const ref=pay.searchParams.get('reference');
 check('test payment is a signed Web Checkout',pay.origin+pay.pathname==='https://checkout.wompi.co/p/'&&/^tb-test-[a-f0-9]{16}$/.test(ref)&&pay.searchParams.get('amount-in-cents')==='1000000'&&pay.searchParams.get('signature:integrity')===sha(ref+'1000000COP'+K.integrity_secret));
 // Wompi refuses the whole checkout with a non-public return address, so the local APP_URL (http://127.0.0.1) sends none.
 check('no local return address sent to Wompi',!pay.searchParams.has('redirect-url'));
 // Plan gating.
 await helper('override',JSON.stringify({features:{payments:false}}));
 check('plan without payments refused',(await owner.request('/api/wompi/account')).response.status===403);
 await helper('override',JSON.stringify({}));
 r=await owner.request('/api/wompi/account','DELETE',{});
 check('disconnect removes the account',r.data.account===null&&(await deliver(url,event(tx))).status===404);
 console.log(`OK ${count} checks passed`);
}finally{
 await owner.request('/api/wompi/account','DELETE',{});wompi.close();
}
