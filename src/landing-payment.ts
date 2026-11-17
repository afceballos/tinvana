// Online payment on a public landing (Wompi phase 2). The server fixes the amount and signs the checkout; this file only
// shows the choice, follows the buyer back from Wompi (?pago=<reference>) and asks the server for the result. The
// return address never confirms a payment: the order is paid only when Wompi's signed event reaches the server.
import {trackPurchase} from './landing-tracking';

export const payOnline=(form:HTMLFormElement|null)=>{const f=form?.querySelector<HTMLInputElement>('[name=payment][type=hidden],[name=payment]:checked');return f?.value==='online';};
export const payDiscount=(form:HTMLFormElement|null)=>Number(form?.querySelector<HTMLElement>('.pay-choice')?.dataset.payDiscount||0)||0;

/** Discount line, total to pay and button label for the current choice. */
export function renderPay(form:HTMLFormElement|null,product:number|null,shipping:number|null,money:(v:number|null)=>string){
 if(!form)return;const online=payOnline(form);const box=form.querySelector<HTMLElement>('[data-pay-total]');
 const button=form.querySelector<HTMLButtonElement>('button[type=submit]');
 if(button&&!button.disabled&&button.dataset.labelCod)button.textContent=online?button.dataset.labelOnline!:button.dataset.labelCod;
 if(!box)return;box.hidden=!online||product===null;if(box.hidden)return;
 const discount=Math.round((product as number)*payDiscount(form)/100);
 box.querySelector('[data-pay-discount]')!.textContent=discount>0?'−'+money(discount):money(0);
 box.querySelector('[data-pay-grand]')!.textContent=money((product as number)-discount+(shipping??0))+(shipping===null&&document.body.dataset.shipping==='dropi'?' + envío':'');
}

type Receipt={store:string;order_number:string;product:string;variant:string;quantity:number;goods:number;discount:number;shipping:number;amount:number;method:string|null;transaction_id:string|null;reference:string;paid_at:string|null};
type Status={status:'pending'|'paid'|'closed';declined:boolean;amount:number;currency:string;quantity:number;order_number:string|null;tracking_url:string|null;retry_url:string|null;receipt:Receipt|null};
const METHODS:Record<string,string>={CARD:'Tarjeta',PSE:'PSE',NEQUI:'Nequi',DAVIPLATA:'Daviplata',BANCOLOMBIA_TRANSFER:'Botón Bancolombia',BANCOLOMBIA_QR:'QR Bancolombia',BANCOLOMBIA_COLLECT:'Corresponsal Bancolombia',BANCOLOMBIA_BNPL:'Compra ahora, paga después',SU_PLUS:'SU+ Pay'};
const when=(iso:string|null)=>iso?new Date(iso).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}):'';
// Animated marks (CSS draws the strokes; with reduced motion they appear drawn).
const ICONS={
 ok:'<svg class="pay-mark is-ok" viewBox="0 0 64 64" aria-hidden="true"><circle class="pay-ring" cx="32" cy="32" r="29"/><path class="pay-stroke" d="M19 33.5l8.5 8.5L45.5 24"/></svg>',
 bad:'<svg class="pay-mark is-bad" viewBox="0 0 64 64" aria-hidden="true"><circle class="pay-ring" cx="32" cy="32" r="29"/><path class="pay-stroke" d="M23 23l18 18"/><path class="pay-stroke is-second" d="M41 23L23 41"/></svg>',
 wait:'<svg class="pay-mark is-wait" viewBox="0 0 64 64" aria-hidden="true"><circle class="pay-ring" cx="32" cy="32" r="29"/><circle class="pay-spin" cx="32" cy="32" r="29"/></svg>',
 info:'<svg class="pay-mark is-info" viewBox="0 0 64 64" aria-hidden="true"><circle class="pay-ring" cx="32" cy="32" r="29"/><path class="pay-stroke" d="M32 20v16"/><path class="pay-stroke is-second" d="M32 44v.5"/></svg>'};

/** Proof of payment as a PNG image the buyer saves (canvas, no libraries). */
function receiptImage(r:Receipt,money:(v:number|null)=>string):Promise<Blob|null>{
 const rows:[string,string][]=[['Pedido',r.order_number],['Producto',r.product+(r.variant?' · '+r.variant:'')],['Cantidad',String(r.quantity)],['Productos',money(r.goods)],...(r.discount>0?[['Descuento pago en línea','−'+money(r.discount)] as [string,string]]:[]),['Envío',r.shipping>0?money(r.shipping):'Incluido'],['Medio de pago',r.method?METHODS[r.method]||r.method:'Wompi'],['Fecha',when(r.paid_at)],['Transacción Wompi',r.transaction_id||'—'],['Referencia',r.reference]];
 const W=720,pad=48,rowH=46,H=330+rows.length*rowH+70,c=document.createElement('canvas');c.width=W*2;c.height=H*2;const g=c.getContext('2d');if(!g)return Promise.resolve(null);
 g.scale(2,2);g.fillStyle='#fff8f1';g.fillRect(0,0,W,H);g.fillStyle='#fff';g.strokeStyle='#ffe0cd';g.lineWidth=2;
 const box=(x:number,y:number,w:number,h:number,rad:number)=>{g.beginPath();g.moveTo(x+rad,y);g.arcTo(x+w,y,x+w,y+h,rad);g.arcTo(x+w,y+h,x,y+h,rad);g.arcTo(x,y+h,x,y,rad);g.arcTo(x,y,x+w,y,rad);g.closePath();};
 box(24,24,W-48,H-48,24);g.fill();g.stroke();
 const font=(size:number,weight=400)=>`${weight} ${size}px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif`;
 g.fillStyle='#16a34a';g.beginPath();g.arc(W/2,104,34,0,Math.PI*2);g.fill();g.strokeStyle='#fff';g.lineWidth=6;g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(W/2-15,106);g.lineTo(W/2-4,117);g.lineTo(W/2+17,94);g.stroke();
 g.textAlign='center';g.fillStyle='#1e1e1e';g.font=font(28,800);g.fillText('Pago recibido',W/2,176);
 g.fillStyle='#75665c';g.font=font(16);g.fillText((r.store||'Tienda')+' · Comprobante de pago',W/2,204);
 g.fillStyle='#1e1e1e';g.font=font(40,800);g.fillText(money(r.amount),W/2,262);
 let y=310;g.textAlign='left';
 for(const [k,v] of rows){g.strokeStyle='#ffe0cd';g.lineWidth=1;g.beginPath();g.moveTo(pad+20,y-30);g.lineTo(W-pad-20,y-30);g.stroke();
  g.fillStyle='#75665c';g.font=font(15);g.fillText(k,pad+20,y);g.textAlign='right';g.fillStyle='#1e1e1e';g.font=font(15,600);
  let text=v;while(g.measureText(text).width>380&&text.length>4)text=text.slice(0,-2);if(text!==v)text=text.slice(0,-1)+'…';g.fillText(text,W-pad-20,y);g.textAlign='left';y+=rowH;}
 g.textAlign='center';g.fillStyle='#75665c';g.font=font(13);g.fillText('Pago procesado de forma segura por Wompi. Guarda este comprobante.',W/2,H-60);
 return new Promise(res=>c.toBlob(b=>res(b),'image/png'));
}

/** Back from Wompi: asks the server (a few times while Wompi's event arrives) and shows the result. */
export async function followPayment(form:HTMLFormElement|null,money:(v:number|null)=>string){
 const ref=new URLSearchParams(location.search).get('pago')||'';if(!form||!/^tb-[a-f0-9]{16}$/.test(ref))return;
 const url=form.action.replace(/\/lead$/,'/pago/'+ref);const dialog=document.createElement('dialog');dialog.className='pay-result';dialog.setAttribute('aria-labelledby','pay-result-title');dialog.setAttribute('aria-describedby','pay-result-text');
 dialog.innerHTML='<div class="pay-icon">'+ICONS.wait+'</div><h2 id="pay-result-title">Confirmando tu pago…</h2><p id="pay-result-text">Wompi nos está avisando el resultado. Esto toma unos segundos.</p><div class="pay-receipt" hidden></div><div class="pay-result-actions"></div>';
 document.body.append(dialog);dialog.showModal();
 const icon=dialog.querySelector<HTMLElement>('.pay-icon')!,title=dialog.querySelector('h2')!,text=dialog.querySelector<HTMLElement>('#pay-result-text')!,actions=dialog.querySelector<HTMLElement>('.pay-result-actions')!,box=dialog.querySelector<HTMLElement>('.pay-receipt')!;
 const close=()=>{dialog.close();dialog.remove();history.replaceState(null,'',location.pathname);};
 const button=(label:string,primary:boolean,act:()=>void)=>{const b=document.createElement('button');b.type='button';b.className=primary?'primary':'secondary';b.textContent=label;b.addEventListener('click',act);actions.append(b);return b;};
 const show=(kind:keyof typeof ICONS,t:string,p:string)=>{icon.innerHTML=ICONS[kind];dialog.dataset.state=kind;title.textContent=t;text.textContent=p;};
 let s:Status|null=null;
 for(let i=0;i<10;i++){try{const r=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'}});if(r.ok){s=await r.json() as Status;if(s.status!=='pending'||s.declined)break;}}catch{}await new Promise(res=>setTimeout(res,3000));}
 actions.textContent='';
 if(s?.status==='paid'){
  show('ok','¡Pago recibido!','Tu pedido'+(s.order_number?' '+s.order_number:'')+' quedó confirmado. Te escribiremos para coordinar la entrega.');
  // Purchase only once per payment, with the payment reference as event id (the Conversions API will reuse it).
  let sent=false;try{sent=sessionStorage.getItem('tb-paid:'+ref)==='1';sessionStorage.setItem('tb-paid:'+ref,'1');}catch{}
  if(!sent)trackPurchase({value:s.amount,currency:s.currency,quantity:s.quantity||1,orderNumber:s.order_number,eventId:ref});
  const r=s.receipt;
  if(r){
   const line=(k:string,v:string,strong=false)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;if(strong)dd.className='is-total';return [dt,dd];};
   const dl=document.createElement('dl');
   for(const [k,v,strong] of [['Total pagado',money(r.amount),true],['Pedido',r.order_number,false],['Producto',r.product+(r.variant?' · '+r.variant:'')+' × '+r.quantity,false],['Medio de pago',r.method?METHODS[r.method]||r.method:'Wompi',false],['Fecha',when(r.paid_at),false],['Transacción Wompi',r.transaction_id||'—',false]] as [string,string,boolean][])dl.append(...line(k,v,strong));
   box.append(dl);box.hidden=false;
   button('Descargar comprobante',false,async()=>{const blob=await receiptImage(r,money);if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='comprobante-'+r.order_number+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);});
  }
  if(s.tracking_url){const a=document.createElement('a');a.className='secondary';a.href=s.tracking_url;a.textContent='Ver mi pedido';actions.append(a);}
  button('Listo',true,close).focus();return;
 }
 if(s?.status==='closed'){show('info','Este pago ya no está disponible','El pedido se canceló porque no se recibió el pago a tiempo. Si quieres el producto, haz un pedido nuevo.');button('Entendido',true,close).focus();return;}
 if(s?.declined)show('bad','El pago no se aprobó','Tu banco o Wompi rechazó el pago. Tu pedido sigue reservado: puedes intentarlo de nuevo con otro medio de pago.');
 else show('info','Aún no vemos tu pago','Si ya pagaste, Wompi puede tardar unos minutos en avisarnos; te escribiremos cuando se confirme. Si no alcanzaste a pagar, puedes intentarlo de nuevo.');
 if(s?.retry_url){const retry=s.retry_url;button('Intentar de nuevo',true,()=>{location.assign(retry);}).focus();}
 button('Cerrar',false,close);
}
