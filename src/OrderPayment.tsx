import {useState} from 'react';
import {money,post} from './api';
import {useFeedbackState} from './Notifications';
import {Icon} from './ui';

// Online payment of an order (Wompi phase 2): state, breakdown, Wompi transaction and the retry link for the buyer.
export type PaymentData={amount?:number;goods?:number;discount?:number;discount_percent?:number;shipping?:number;attempts?:number;last_status?:string;transaction_id?:string;method?:string|null;mismatch?:{amount_in_cents:number;transaction_id?:string}};
export type PaymentFields={id:string;payment_method?:'cod'|'online';payment_status?:'pending'|'paid'|'expired';payment_reference?:string|null;payment?:PaymentData|null;payment_due_at?:string|null;paid_at?:string|null;sale_status:string;product_data:{landing_url?:string}};
const when=(v?:string|null)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'—';
const methods:Record<string,string>={CARD:'Tarjeta',PSE:'PSE',NEQUI:'Nequi',DAVIPLATA:'Daviplata',BANCOLOMBIA_TRANSFER:'Botón Bancolombia',BANCOLOMBIA_QR:'QR Bancolombia',BANCOLOMBIA_COLLECT:'Corresponsal Bancolombia',BANCOLOMBIA_BNPL:'Compra ahora, paga después',SU_PLUS:'SU+ Pay'};

export function OrderPayment({o}:{o:PaymentFields}){
 const [,setNotice]=useFeedbackState('success');const [,setError]=useFeedbackState('error');
 // Phase 3: send the link in the WhatsApp chat (24-hour window) or open the store's own WhatsApp with it ready.
 const [busy,setBusy]=useState(false);const [fallback,setFallback]=useState<{wa_me:string|null;message:string}|null>(null);
 async function sendLink(){setBusy(true);setFallback(null);try{const r=await post<{sent:boolean;wa_me:string|null;message:string}>('/api/orders/'+o.id+'/payment-link',{channel:'whatsapp'});if(r.sent)setNotice(r.message);else setFallback({wa_me:r.wa_me,message:r.message});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(o.payment_method!=='online')return null;
 const p=o.payment||{};const paid=o.payment_status==='paid',expired=o.payment_status==='expired';
 const state=paid?['on','Pagado']:expired?['off','Vencido']:['off','Esperando pago'];
 const retry=!paid&&!expired&&o.sale_status!=='cancelled'&&o.product_data.landing_url&&o.payment_reference?o.product_data.landing_url+'/pagar/'+o.payment_reference:null;
 const declined=['DECLINED','ERROR','VOIDED'].includes(p.last_status||'');
 return <section className="order-panel od-card od-payment">
  <header className="od-card-head"><span className="od-icon"><Icon name="card"/></span><h2>Pago en línea · Wompi</h2><span className={'webhook-state '+state[0]}>{state[1]}</span></header>
  <dl className="od-pay-facts">
   <div><dt>Total {paid?'pagado':'a pagar'}</dt><dd><strong>{money(p.amount??null)}</strong></dd></div>
   <div><dt>Productos</dt><dd>{money(p.goods??null)}</dd></div>
   {(p.discount??0)>0&&<div><dt>Descuento en línea ({p.discount_percent} %)</dt><dd>−{money(p.discount??0)}</dd></div>}
   <div><dt>Envío (pago anticipado)</dt><dd>{(p.shipping??0)>0?money(p.shipping??0):'Sin envío cobrado'}</dd></div>
   {paid&&<><div><dt>Pagado el</dt><dd>{when(o.paid_at)}</dd></div><div><dt>Medio</dt><dd>{p.method?methods[p.method]||p.method:'—'}</dd></div><div><dt>Transacción Wompi</dt><dd><code>{p.transaction_id||'—'}</code></dd></div></>}
   {!paid&&!expired&&<div><dt>Se cancela solo si no paga antes del</dt><dd>{when(o.payment_due_at)}</dd></div>}
   <div><dt>Intentos de pago</dt><dd>{p.attempts??0}</dd></div>
  </dl>
  {declined&&!paid&&<p className="store-warning" role="note">El último intento de pago fue rechazado. El cliente puede intentarlo de nuevo con el link.</p>}
  {p.mismatch&&!paid&&<p className="store-warning" role="alert">Wompi aprobó un pago por {money(p.mismatch.amount_in_cents/100)}, distinto al total del pedido. No se marcó como pagado: revísalo en tu panel de Wompi.</p>}
  {paid&&o.sale_status==='cancelled'&&<p className="store-warning" role="alert">Wompi aprobó el pago después de que el pedido se canceló. Reactívalo o reembolsa el dinero desde tu panel de Wompi.</p>}
  {expired&&<p className="small muted">Pasaron 48 horas sin un pago aprobado (se consultó a Wompi antes de cancelarlo).</p>}
  {retry&&<div className="od-pay-link"><span className="small muted">Link para que el cliente pague o reintente:</span><div className="webhook-url"><Icon name="link"/><code>{retry}</code><button type="button" className="secondary" onClick={()=>void navigator.clipboard?.writeText(retry).then(()=>setNotice('Link de pago copiado.'),()=>setError('No se pudo copiar el link.'))}>Copiar</button></div>
   <div className="row"><button type="button" className="primary" disabled={busy} onClick={()=>void sendLink()}><Icon name="whatsapp"/>{busy?'Enviando…':'Enviar link por WhatsApp'}</button></div>
   {fallback&&<div className="od-pay-fallback" role="status"><p className="small">{fallback.message}</p>{fallback.wa_me&&<a className="secondary" href={fallback.wa_me} target="_blank" rel="noopener noreferrer"><Icon name="external"/>Abrir en mi WhatsApp</a>}</div>}</div>}
  <p className="small muted">El pedido solo cuenta como pagado cuando Wompi lo confirma con un aviso firmado.</p>
 </section>;
}
