// Routes <subdomain>.<APP_URL host> to the published landing against the isolated local database.
import fs from 'node:fs';import http from 'node:http';import crypto from 'node:crypto';import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const env={...process.env};for(const [k,v] of Object.entries(JSON.parse(fs.readFileSync('.tools/test-env.json','utf8'))))env[k]=String(v);
if(env.DB_HOST!=='127.0.0.1'||env.DB_DATABASE!=='zenzales_test')throw new Error('Isolated local database required.');
const port=8085,base='panel.example.test';env.APP_URL='http://'+base+':'+port;env.APP_ENV='test';
const php='.tools/php/php.exe',tag=crypto.randomBytes(4).toString('hex');
const helper=(op)=>spawnSync(php,['backend/tests/subdomain-helper.php',op,tag],{env,encoding:'utf8'});
let passed=0;const check=(name,ok)=>{if(!ok)throw new Error('FAIL: '+name);passed++;console.log('PASS '+name);};
const get=(host,path,method='GET')=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path,method,headers:{Host:host+':'+port}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body}));});r.on('error',reject);r.end();});
let server;
try{
  const setup=helper('setup');if(setup.status!==0)throw new Error('setup failed: '+(setup.stderr||setup.stdout).slice(0,400));
  const fx=JSON.parse(setup.stdout);
  server=spawn(php,['-S','127.0.0.1:'+port,'-t','backend/public','backend/router.php'],{env,stdio:'ignore'});
  for(let i=0;i<40;i++){try{await get(base,'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
  const sub=await get(fx.sub.subdomain+'.'+base,'/');
  check('subdomain serves its landing',sub.status===200&&sub.body.includes(fx.sub.title));
  check('subdomain page links its own canonical address',sub.body.includes('http://'+fx.sub.subdomain+'.'+base));
  check('subdomain does not show another landing',!sub.body.includes(fx.normal.title));
  const head=await get(fx.sub.subdomain+'.'+base,'/','HEAD');check('HEAD works on the subdomain',head.status===200);
  const unknown=await get('no-existe.'+base,'/');check('unknown subdomain is 404',unknown.status===404&&!unknown.body.includes(fx.sub.title));
  const normalPath=await get(base,'/p/'+fx.sub.slug);check('normal /p/ link still works for a landing with subdomain',normalPath.status===200&&normalPath.body.includes(fx.sub.title));
  const normal=await get(base,'/p/'+fx.normal.slug);check('landing without subdomain keeps its /p/ link',normal.status===200&&normal.body.includes(fx.normal.title));
  const www=await get('www.'+base,'/');check('www is not treated as a landing',www.status!==404||!www.body.includes(fx.sub.title));
  const reservedLanding=await get('mail.'+base,'/');check('reserved names are not landings',!reservedLanding.body.includes(fx.sub.title));
  const root=await get(base,'/');check('main domain keeps the app',root.status===200&&!root.body.includes(fx.sub.title));
  const sitemap=await get(base,'/sitemap.xml');check('sitemap lists the subdomain address',sitemap.body.includes('<loc>http://'+fx.sub.subdomain+'.'+base+'</loc>')&&sitemap.body.includes('/p/'+fx.normal.slug));
  helper('unpublish');
  const off=await get(fx.sub.subdomain+'.'+base,'/');check('unpublished landing stops answering on its subdomain',off.status===404);
  console.log('OK '+passed+' checks');
}finally{if(server)server.kill();helper('cleanup');}
