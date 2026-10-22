// Startup screen: the static HTML loader and the React loader must share one centered layout (no jump to the top). Mocked API only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TINVANA_BASE||'http://127.0.0.1:8081';
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const metrics=()=>{const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};return {origami:box('.startup-origami'),h1:box('.startup-center h1'),track:box('.loader-track'),brand:box('.startup-brand'),footer:box('.startup-footer'),center:box('.startup-center'),vh:innerHeight};};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const [width,height] of [[1440,900],[390,800]]){
  const plain=await browser.newContext({viewport:{width,height},javaScriptEnabled:false});const staticPage=await plain.newPage();await staticPage.goto(base+'/panel/catalogo');await staticPage.locator('.startup-loader').waitFor();await staticPage.waitForTimeout(500);
  const html=await staticPage.evaluate(metrics);await plain.close();
  const ctx=await browser.newContext({viewport:{width,height}});const page=await ctx.newPage();
  await page.route('**/api/**',async route=>{await new Promise(r=>setTimeout(r,2500));route.fulfill({status:200,contentType:'application/json',body:'{"user":null,"csrf":"x"}'});});
  await page.goto(base+'/panel/catalogo');await page.locator('.startup-loader').waitFor();await page.waitForTimeout(1900);
  const react=await page.evaluate(metrics);await ctx.close();
  const mid=react.center.y+react.center.h/2;
  check(`React loader content is vertically centered at ${width}px`,Math.abs(mid-react.vh/2)<40);
  for(const key of ['origami','h1','track','brand','footer'])check(`${key} does not move between HTML and React at ${width}px`,JSON.stringify(html[key])===JSON.stringify(react[key]));
 }
 console.log(`${passed} checks passed`);
}finally{await browser.close();}
