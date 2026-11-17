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

type Status={status:'pending'|'paid'|'closed';declined:boolean;amount:number;currency:string;quantity:number;order_number:string|null;tracking_url:string|null;retry_url:string|null};

/** Back from Wompi: asks the server (a few times while Wompi's event arrives) and shows the result. */
export async function followPayment(form:HTMLFormElement|null,money:(v:number|null)=>string){
 const ref=new URLSearchParams(location.search).get('pago')||'';if(!form||!/^tb-[a-f0-9]{16}$/.test(ref))return;
 const url=form.action.replace(/\/lead$/,'/pago/'+ref);const dialog=document.createElement('dialog');dialog.className='pay-result';dialog.setAttribute('aria-labelledby','pay-result-title');
 dialog.innerHTML='<h2 id="pay-result-title">Confirmando tu pago…</h2><p data-pay-text>Wompi nos está avisando el resultado. Esto toma unos segundos.</p><div class="pay-result-actions"></div>';
 document.body.append(dialog);dialog.showModal();
 const title=dialog.querySelector('h2')!,text=dialog.querySelector<HTMLElement>('[data-pay-text]')!,actions=dialog.querySelector<HTMLElement>('.pay-result-actions')!;
 const close=()=>{dialog.close();dialog.remove();history.replaceState(null,'',location.pathname);};
 const button=(label:string,primary:boolean,act:()=>void)=>{const b=document.createElement('button');b.type='button';b.className=primary?'primary':'secondary';b.textContent=label;b.addEventListener('click',act);actions.append(b);return b;};
 let s:Status|null=null;
 for(let i=0;i<10;i++){try{const r=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'}});if(r.ok){s=await r.json() as Status;if(s.status!=='pending'||s.declined)break;}}catch{}await new Promise(res=>setTimeout(res,3000));}
 actions.textContent='';
 if(s?.status==='paid'){
  title.textContent='¡Pago recibido!';text.textContent='Tu pedido'+(s.order_number?' '+s.order_number:'')+' quedó pagado por '+money(s.amount)+'. Te escribiremos para coordinar la entrega.';
  // Purchase only once per payment, with the payment reference as event id (the Conversions API will reuse it).
  let sent=false;try{sent=sessionStorage.getItem('tb-paid:'+ref)==='1';sessionStorage.setItem('tb-paid:'+ref,'1');}catch{}
  if(!sent)trackPurchase({value:s.amount,currency:s.currency,quantity:s.quantity||1,orderNumber:s.order_number,eventId:ref});
  if(s.tracking_url){const a=document.createElement('a');a.className='secondary';a.href=s.tracking_url;a.textContent='Ver mi pedido';actions.append(a);}
  button('Listo',true,close).focus();return;
 }
 if(s?.status==='closed'){title.textContent='Este pago ya no está disponible';text.textContent='El pedido se canceló porque no se recibió el pago a tiempo. Si quieres el producto, haz un pedido nuevo.';button('Entendido',true,close).focus();return;}
 if(s?.declined){title.textContent='El pago no se aprobó';text.textContent='Tu banco o Wompi rechazó el pago. Tu pedido sigue reservado: puedes intentarlo de nuevo con otro medio de pago.';}
 else{title.textContent='Aún no vemos tu pago';text.textContent='Si ya pagaste, Wompi puede tardar unos minutos en avisarnos; te escribiremos cuando se confirme. Si no alcanzaste a pagar, puedes intentarlo de nuevo.';}
 if(s?.retry_url){const retry=s.retry_url;button('Intentar de nuevo',true,()=>{location.assign(retry);}).focus();}
 button('Cerrar',false,close);
}
