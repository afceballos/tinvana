// Account mail through the real SMTP code path against a local TLS test server. No external service is contacted and no database is written.
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:tls';
import assert from 'node:assert/strict';
const run=promisify(execFile),php='.tools/php/php.exe';
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
let rejectRecipient=false;const messages=[];
const server=createServer({key:await readFile('.tools/test-key.pem'),cert:await readFile('.tools/test-cert.pem')},socket=>{
 socket.setEncoding('utf8');socket.setTimeout(20000,()=>socket.destroy());socket.write('220 localhost ESMTP test\r\n');let buffer='',data=false,body='',auth=0;
 socket.on('data',chunk=>{buffer+=chunk;let pos;while((pos=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,pos);buffer=buffer.slice(pos+2);
  if(data){if(line==='.'){data=false;messages.push(body);body='';socket.write('250 queued\r\n');}else body+=line+'\r\n';continue;}
  if(auth){auth--;socket.write(auth?'334 UGFzc3dvcmQ6\r\n':'235 authenticated\r\n');}
  else if(line.startsWith('EHLO'))socket.write('250-localhost\r\n250 AUTH LOGIN\r\n');
  else if(line==='AUTH LOGIN'){auth=2;socket.write('334 VXNlcm5hbWU6\r\n');}
  else if(line.startsWith('MAIL FROM'))socket.write('250 OK\r\n');
  else if(line.startsWith('RCPT TO'))socket.write(rejectRecipient?'550 rejected for test\r\n':'250 OK\r\n');
  else if(line==='DATA'){data=true;socket.write('354 go\r\n');}
  else if(line==='QUIT'){socket.write('221 bye\r\n');socket.end();}
  else socket.write('250 OK\r\n');}});
});
await new Promise(r=>server.listen(2525,'127.0.0.1',r));
const diagnose=async(to)=>{try{const r=await run(php,['backend/tests/account-diagnose.php',to],{timeout:60000});return JSON.parse(r.stdout.trim().split('\n').pop());}catch(e){return JSON.parse((e.stdout||'').trim().split('\n').pop());}};
const decode=raw=>{const parts=[];const text=raw.replace(/\r\n/g,'\n');const mime=[...text.matchAll(/Content-Transfer-Encoding: (base64|quoted-printable)\n\n([\s\S]*?)(?=\n--b|\n--$)/g)];for(const m of mime)parts.push(m[1]==='base64'?Buffer.from(m[2].replace(/\s/g,''),'base64').toString('utf8'):Buffer.from(m[2].replace(/=\n/g,'').replace(/=([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16))),'latin1').toString('utf8'));return text+'\n'+parts.join('\n');};
try{
 const ok=await diagnose('admin@tinbana.test');
 check('diagnose reports a complete configuration and a reachable server',ok.lines.some(l=>l==='SMTP_HOST definido: ok')&&ok.lines.some(l=>/^Conexión al servidor SMTP: ok/.test(l)));
 check('diagnose delivers the test message and never prints secrets',ok.ok===true&&ok.lines.some(l=>/Envío de prueba a admin@tinbana\.test: aceptado/.test(l))&&!ok.lines.join('\n').includes('test-only-password'));
 check('exactly one message reached the SMTP server',messages.length===1);
 const mail=decode(messages[0]);
 check('sender name and subject use the Tinvana brand',/From: Tinvana <admin@tinbana\.test>/.test(mail)&&/Subject: (=\?UTF-8\?[BQ]\?[^?]+\?=|Correo de prueba · Tinvana)/.test(mail));
 check('HTML body is branded, has the call to action and no Zenzales leftovers',/Tinvana · Ideas que toman vuelo/.test(mail)&&/#ff6a00/i.test(mail)&&/Abrir Tinvana/.test(mail)&&!/Zenzales/i.test(mail));
 check('logo is embedded as an inline image',/Content-ID: <tinvana-logo>/.test(messages[0])&&/Content-Type: image\/png/.test(messages[0]));
 check('plain-text alternative is present',/Content-Type: text\/plain/.test(messages[0])&&/mensaje de prueba/.test(mail));
 rejectRecipient=true;
 const bad=await diagnose('rechazado@tinbana.test');
 check('a rejected recipient is reported without leaking the address or credentials',bad.ok===false&&bad.lines.some(l=>/Envío de prueba: FALLA \(Exception: .*\)/.test(l))&&!bad.lines.join('\n').includes('rechazado@tinbana.test')&&!bad.lines.join('\n').includes('test-only-password'));
 console.log(`${passed} checks passed`);
}finally{server.close();}
