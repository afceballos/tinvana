// Each user is a store: <name>.<APP_URL host>/p/<slug> serves only that user's published landings. Isolated local database.
import fs from 'node:fs';import http from 'node:http';import crypto from 'node:crypto';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const env={...process.env};for(const [k,v] of Object.entries(JSON.parse(fs.readFileSync('.tools/test-env.json','utf8'))))env[k]=String(v);
if(env.DB_HOST!=='127.0.0.1'||env.DB_DATABASE!=='zenzales_test')throw new Error('Isolated local database required.');
const port=8085,base='panel.example.test';env.APP_URL='http://'+base+':'+port;env.APP_ENV='test';
const php='.tools/php/php.exe',tag=crypto.randomBytes(4).toString('hex');
const helper=(op)=>spawnSync(php,['backend/tests/store-helper.php',op,tag],{env,encoding:'utf8'});
let passed=0;const check=(name,ok)=>{if(!ok)throw new Error('FAIL: '+name);passed++;console.log('PASS '+name);};
const get=(host,path,method='GET')=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path,method,headers:{Host:host+':'+port}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body}));});r.on('error',reject);r.end();});
let server;
try{
  const setup=helper('setup');if(setup.status!==0)throw new Error('setup failed: '+(setup.stderr||setup.stdout).slice(0,400));
  const fx=JSON.parse(setup.stdout);const A=fx.a.store+'.'+base,B=fx.b.store+'.'+base;
  server=spawn(php,['-S','127.0.0.1:'+port,'-t','backend/public','backend/router.php'],{env,stdio:'ignore'});
  for(let i=0;i<40;i++){try{await get(base,'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
  const own=await get(A,'/p/'+fx.a.slug);
  check('a store serves its own landing under /p/',own.status===200&&own.body.includes(fx.a.title));
  check('the page announces its address inside the store',own.body.includes('http://'+A+'/p/'+fx.a.slug));
  check('HEAD works inside the store',(await get(A,'/p/'+fx.a.slug,'HEAD')).status===200);
  const foreign=await get(A,'/p/'+fx.b.slug);check('a store does not serve another store\'s landing',foreign.status===404&&!foreign.body.includes(fx.b.title));
  const noStore=await get(A,'/p/'+fx.c.slug);check('a store does not serve a landing of a user without a store',noStore.status===404);
  check('another store serves its own landing',(await get(B,'/p/'+fx.b.slug)).status===200);
  check('lead route is checked against the store owner',(await get(A,'/p/'+fx.b.slug+'/lead','POST')).status===404);
  const root=await get(A,'/');check('store root has no page yet (404)',root.status===404);
  const unknown=await get('no-existe.'+base,'/p/'+fx.a.slug);check('unknown store is 404 for everything',unknown.status===404&&!unknown.body.includes(fx.a.title));
  check('unknown store is 404 on the root too',(await get('no-existe.'+base,'/')).status===404);
  check('nested hosts are not stores',(await get('x.'+fx.a.store+'.'+base,'/p/'+fx.a.slug)).status===404);
  for(const slug of [fx.a.slug,fx.b.slug,fx.c.slug]){const main=await get(base,'/p/'+slug);check('main domain keeps /p/'+slug.slice(0,20)+'…',main.status===200);}
  check('main domain keeps the app',(await get(base,'/')).status===200);
  const www=await get('www.'+base,'/');check('www is not a store',www.status===200);
  check('reserved names are not stores',(await get('mail.'+base,'/')).status===200);
  const sitemap=await get(base,'/sitemap.xml');
  check('sitemap lists store addresses and normal ones',sitemap.body.includes('<loc>http://'+A+'/p/'+fx.a.slug+'</loc>')&&sitemap.body.includes('<loc>http://'+base+':'+port+'/p/'+fx.c.slug+'</loc>'));
  helper('unpublish');
  check('an unpublished landing stops answering in its store',(await get(A,'/p/'+fx.a.slug)).status===404);
  helper('clear');
  check('removing the store name closes the old address',(await get(A,'/p/'+fx.a.slug)).status===404);
  console.log('OK '+passed+' checks');
}finally{if(server)server.kill();helper('cleanup');}
