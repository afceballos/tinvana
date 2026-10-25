// "Editar landing" on a store subdomain: the page asks the main domain (with its session) whether the viewer owns it.
// Own server with APP_URL=http://panel.example.test:8086; the browser resolves *.example.test to 127.0.0.1. Isolated local database.
import fs from 'node:fs';import crypto from 'node:crypto';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const env={...process.env};for(const [k,v] of Object.entries(JSON.parse(fs.readFileSync('.tools/test-env.json','utf8'))))env[k]=String(v);
if(env.DB_HOST!=='127.0.0.1'||env.DB_DATABASE!=='zenzales_test')throw new Error('Isolated local database required.');
const port=8086,main='panel.example.test';env.APP_URL='http://'+main+':'+port;env.APP_ENV='test';
const php='.tools/php/php.exe',tag=crypto.randomBytes(4).toString('hex');
const helper=op=>spawnSync(php,['backend/tests/store-helper.php',op,tag],{env,encoding:'utf8'});
let checks=0;const check=(name,ok)=>{assert(ok,name);checks++;console.log('PASS '+name);};
let server,browser;
try{
 const setup=helper('setup');if(setup.status!==0)throw new Error('setup failed: '+(setup.stderr||setup.stdout).slice(0,300));
 const fx=JSON.parse(setup.stdout);const cred=JSON.parse(helper('password').stdout);
 server=spawn(php,['-S','127.0.0.1:'+port,'-t','backend/public','backend/router.php'],{env,stdio:'ignore'});
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--host-resolver-rules=MAP *.example.test 127.0.0.1, MAP example.test 127.0.0.1']});
 const store=`http://${fx.a.store}.${main}:${port}/p/${fx.a.slug}`,other=`http://${fx.b.store}.${main}:${port}/p/${fx.b.slug}`;
 for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{headers:{Host:main+':'+port}});if(r)break;}catch{await new Promise(r=>setTimeout(r,250));}}
 // Visitor
 const visitor=await browser.newContext();const vp=await visitor.newPage();await vp.goto(store);await vp.locator('h1').first().waitFor();await vp.waitForTimeout(800);
 check('store page asks the main domain who is viewing',await vp.evaluate(()=>document.body.dataset.ownerCheck||'')===`http://${main}:${port}/api/landings/`+(await vp.evaluate(()=>document.body.dataset.ownerCheck.split('/')[5]))+'/owner');
 check('visitors do not get the shortcut on the store subdomain',await vp.locator('.owner-edit').count()===0);await visitor.close();
 // Owner signs in on the main domain, then opens the store page
 const ctx=await browser.newContext();const page=await ctx.newPage();
 await page.goto(`http://${main}:${port}/login`);await page.getByLabel('Email').fill(cred.email);await page.getByLabel('Contraseña').fill(cred.password);await page.getByRole('button',{name:/Iniciar sesión/}).click();await page.waitForURL(/\/panel\//);
 await page.goto(store);await page.locator('.owner-edit').waitFor({timeout:8000});
 const href=await page.locator('.owner-edit').getAttribute('href');
 check('owner gets the shortcut on the store subdomain, pointing to the main-domain editor',href.startsWith(`http://${main}:${port}/panel/landings/`));
 await page.screenshot({path:'test-results/owner-edit-store.png'});
 await page.locator('.owner-edit').click();await page.waitForURL('**/panel/landings/**');check('shortcut opens the editor on the main domain',new URL(page.url()).host===`${main}:${port}`);
 // Same owner on another store's landing
 await page.goto(other);await page.locator('h1').first().waitFor();await page.waitForTimeout(1200);
 check('owner does not get it on someone else\'s store',await page.locator('.owner-edit').count()===0);
 // The answer is readable only by store subdomains of this domain
 const foreign=await fetch(`http://127.0.0.1:${port}/api/landings/00000000-0000-0000-0000-000000000000/owner`,{headers:{Host:main+':'+port,Origin:'https://evil.example.com'}});
 check('other sites cannot read the answer',!foreign.headers.get('access-control-allow-origin')&&(await foreign.json()).owner===false);
 console.log(`${checks} store owner edit checks passed. Local isolated database only.`);
}finally{await browser?.close();if(server)server.kill();helper('cleanup');}
