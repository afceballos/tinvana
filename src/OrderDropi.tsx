import {useEffect,useState} from 'react';
import {Icon} from './ui';

export type DropiState={status:'not_sent'|'sending'|'sent'|'failed'|'unknown';can_submit:boolean;can_resolve:boolean;dropi_order_id:string|null;message:string;checks:{key:string;label:string;ready:boolean}[];preview:Record<string,string|number|null>|null;last:{outcome?:string;message?:string;http_status?:number;finished_at?:string;request?:Record<string,string|number|null>}|null};
export type DropiTracking={status:string|null;carrier:string|null;guide:string|null;shipping_amount:number|null;novelty:string|null;history:{status:string;at:string|null;novelty:string|null}[];updated_at:string|null;synced_at?:string};
export type DropiCarrier={id:number|null;name:string;price:number|null;amount:number|null;error:string|null};
export type DropiSubmit={carrier_id:number|null;confirmed:boolean;confirmed_ack:boolean};
export const dropiStatus=(v:string|null|undefined)=>(v||'').replace(/_/g,' ');
const when=(v:string|null|undefined)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha';
export const dropiLabels:Record<DropiState['status'],string>={not_sent:'No enviado a Dropi',sending:'Enviando a Dropi',sent:'Creado en Dropi',failed:'Rechazado por Dropi',unknown:'Envío por verificar'};
const cash=(v:unknown)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v));
const rows:[string,(p:Record<string,string|number|null>)=>string][]=[['Destinatario',p=>`${p.name} ${p.surname}`],['Teléfono',p=>String(p.phone)],['Dirección',p=>String(p.dir)],['Departamento y ciudad',p=>`${p.state} · ${p.city}`],['Producto',p=>`ID ${p.product_id}${p.variation_id?' · variante '+p.variation_id:''} · ${p.quantity} und.`],['Valor a recaudar',p=>cash(p.total_order)],['Tipo',p=>`${p.rate_type} · ${p.status}`]];

export function OrderDropi({dropi,busy,onSubmit,onResolve,tracking=null,charged=null,onSync,loadCarriers}:{dropi:DropiState;busy:boolean;onSubmit:(options:DropiSubmit)=>void;onResolve:(body:Record<string,unknown>)=>void;tracking?:DropiTracking|null;charged?:string|null;onSync?:()=>void;loadCarriers?:()=>Promise<DropiCarrier[]>}){
 const margin=tracking?.shipping_amount!=null&&charged!=null?Number(charged)-tracking.shipping_amount:null;
 const [reviewed,setReviewed]=useState(false),[outcome,setOutcome]=useState(''),[external,setExternal]=useState(''),[note,setNote]=useState('');
 const [carriers,setCarriers]=useState<DropiCarrier[]|null>(null),[carrierState,setCarrierState]=useState<'idle'|'loading'|'error'>('idle'),[carrier,setCarrier]=useState('dropi');
 const [confirmed,setConfirmed]=useState(false),[ack,setAck]=useState(false);
 async function fetchCarriers(){if(!loadCarriers)return;setCarrierState('loading');try{const list=await loadCarriers();setCarriers(list);const cheapest=list.find(c=>c.price!==null&&c.id!==null);setCarrier(cheapest?String(cheapest.id):'dropi');setCarrierState('idle');}catch{setCarrierState('error');}}
 useEffect(()=>{if(dropi.can_submit&&carriers===null&&carrierState==='idle')void fetchCarriers();},[dropi.can_submit]);
 const chosen=carriers?.find(c=>String(c.id)===carrier)||null;const cheapestId=carriers?.find(c=>c.price!==null)?.id;
 const p=dropi.preview&&dropi.can_submit?{...dropi.preview,status:confirmed?'PENDIENTE (confirmada)':String(dropi.preview.status)}:dropi.preview;
 const requested=dropi.last?.request;const requestedCarrier=typeof requested?.shipping_company==='string'?requested.shipping_company:null;
 const carrierMismatch=!!(requestedCarrier&&tracking?.carrier&&tracking.carrier.toUpperCase()!==requestedCarrier.toUpperCase());
 const confirmIgnored=requested?.status==='PENDIENTE'&&tracking?.status==='PENDIENTE CONFIRMACION';
 return <section className="order-panel od-card"><header className="od-card-head"><span className="od-icon"><Icon name="send"/></span><h2>Envío a Dropi</h2></header>
  <p><span className={'order-state dropi-'+dropi.status}>{dropiLabels[dropi.status]}</span>{dropi.dropi_order_id&&<strong className="order-dropi-id"> Orden Dropi #{dropi.dropi_order_id}</strong>}</p>
  <p className="muted">{dropi.message}</p>
  {dropi.last?.message&&dropi.status!=='sent'&&<p className="order-dropi-last">Último resultado: {dropi.last.message}{dropi.last.http_status?` (HTTP ${dropi.last.http_status})`:''}</p>}
  {dropi.status!=='sent'&&<ul className="order-readiness">{dropi.checks.map(check=><li key={check.key}><span className={check.ready?'is-ready':'is-pending'}>{check.ready?'Listo':'Pendiente'}</span><span>{check.label}</span></li>)}</ul>}
  {p&&<dl className="order-dropi-preview">{rows.map(([k,f])=><div key={k}><dt>{k}</dt><dd>{f(p)}</dd></div>)}{dropi.can_submit&&<div><dt>Transportadora</dt><dd>{chosen?chosen.name:'La elige Dropi'}</dd></div>}</dl>}
  {dropi.can_submit&&<form className="dropi-send" onSubmit={e=>{e.preventDefault();if(reviewed&&(!confirmed||ack))onSubmit({carrier_id:chosen?.id??null,confirmed,confirmed_ack:ack});}}><fieldset disabled={busy}>
   {loadCarriers&&<fieldset className="dropi-choice"><legend>Transportadora</legend>
    {carrierState==='loading'&&<p className="small muted">Consultando transportadoras y fletes en Dropi…</p>}
    {carrierState==='error'&&<p className="small muted">No se pudieron consultar las transportadoras. Dropi elegirá según tu cuenta. <button type="button" className="text-button" onClick={()=>void fetchCarriers()}>Reintentar</button></p>}
    <label className={'dropi-option'+(carrier==='dropi'?' is-selected':'')}><input type="radio" name="dropi-carrier" value="dropi" checked={carrier==='dropi'} onChange={()=>setCarrier('dropi')}/><span><strong>Que Dropi elija</strong><small>Según la configuración de tu cuenta de Dropi.</small></span></label>
    {carriers?.map(c=><label key={c.name+c.id} className={'dropi-option'+(String(c.id)===carrier?' is-selected':'')+(c.price===null||c.id===null?' is-off':'')}><input type="radio" name="dropi-carrier" value={String(c.id)} disabled={c.price===null||c.id===null} checked={String(c.id)===carrier} onChange={()=>setCarrier(String(c.id))}/><span><strong>{c.name}{c.id!==null&&c.id===cheapestId&&<em>Más económica</em>}</strong><small>{c.price!==null?'Flete Dropi '+cash(c.price):c.error}</small></span></label>)}
   </fieldset>}
   <fieldset className="dropi-choice"><legend>Estado al enviar</legend>
    <label className={'dropi-option'+(!confirmed?' is-selected':'')}><input type="radio" name="dropi-mode" checked={!confirmed} onChange={()=>{setConfirmed(false);setAck(false);}}/><span><strong>Pendiente de confirmación</strong><small>Llega a Dropi sin confirmar; la revisas y confirmas tú allí.</small></span></label>
    <label className={'dropi-option'+(confirmed?' is-selected':'')}><input type="radio" name="dropi-mode" checked={confirmed} onChange={()=>setConfirmed(true)}/><span><strong>Confirmada</strong><small>Como marcar «Confirmar» en Dropi: la procesa de inmediato.</small></span></label>
    {confirmed&&<div className="store-warning dropi-confirm-warning" role="note"><p>Al enviarla confirmada, Dropi empieza a procesarla de inmediato y puede generar la guía. No podrás revisarla en Dropi antes de que avance; si algo está mal tendrás que cancelarla allí.</p><label className="order-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>Estoy de acuerdo con enviar esta orden confirmada.</span></label></div>}
   </fieldset>
   <label className="order-check"><input type="checkbox" required checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>Revisé los datos. Crear la orden en Dropi {confirmed?'confirmada':'con estado pendiente de confirmación'}.</span></label>
   <button className="primary" disabled={confirmed&&!ack}>{busy?'Enviando…':dropi.status==='failed'?'Reintentar envío a Dropi':confirmed?'Enviar confirmada a Dropi':'Enviar a Dropi'}</button>
  </fieldset></form>}
  {dropi.can_resolve&&<form className="order-dropi-resolve" onSubmit={e=>{e.preventDefault();onResolve({outcome,note,...(outcome==='created'?{dropi_order_id:external.trim()}:{})});}}><fieldset disabled={busy}><h3>¿Qué ves en tu panel de Dropi?</h3><label><select required value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">Selecciona el resultado</option><option value="created">La orden sí existe en Dropi</option><option value="not_created">La orden no existe en Dropi</option></select></label>{outcome==='created'&&<label>Número de orden en Dropi<input required inputMode="numeric" pattern="[1-9][0-9]{0,17}" value={external} onChange={e=>setExternal(e.target.value)}/></label>}<label>Nota de la verificación<textarea required maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Qué buscaste y qué encontraste en Dropi."/></label><button className="secondary">Registrar verificación</button></fieldset></form>}
  {dropi.status==='sent'&&<div className="dropi-tracking"><div className="dropi-tracking-head"><div><span className="eyebrow">Seguimiento en Dropi</span><strong className={'dropi-tracking-status'+(tracking?.novelty?' has-novelty':'')}>{tracking?.status?dropiStatus(tracking.status):'Sin consultar todavía'}</strong></div>{onSync&&<button type="button" className="secondary" disabled={busy} onClick={onSync}><Icon name="refresh"/>Actualizar desde Dropi</button>}</div>
   {requested&&<p className="small muted">Enviada {requested.status==='PENDIENTE'?'confirmada':'pendiente de confirmación'}{requestedCarrier?' · transportadora solicitada: '+requestedCarrier:' · transportadora: la elige Dropi'}.</p>}
   {carrierMismatch&&<p className="store-warning" role="note">Pediste {requestedCarrier}, pero Dropi asignó {tracking?.carrier}. Dropi no aplicó la transportadora elegida.</p>}
   {confirmIgnored&&<p className="store-warning" role="note">La enviaste confirmada, pero Dropi la muestra pendiente de confirmación. Confírmala en tu panel de Dropi.</p>}
   {tracking&&<dl className="order-dropi-preview"><div><dt>Transportadora</dt><dd>{tracking.carrier||'Por asignar'}</dd></div><div><dt>Guía</dt><dd>{tracking.guide||'Aún sin guía'}</dd></div><div><dt>Flete de Dropi</dt><dd>{tracking.shipping_amount==null?'Sin dato':cash(tracking.shipping_amount)}</dd></div><div><dt>Envío cobrado al cliente</dt><dd>{charged==null?'Sin cotizar':cash(charged)}</dd></div>{margin!=null&&<div className="dropi-margin"><dt>Diferencia de envío</dt><dd className={margin<0?'is-bad':'is-good'}>{(margin>=0?'+':'−')+cash(Math.abs(margin))}</dd></div>}</dl>}
   {tracking?.novelty&&<p className="store-warning" role="note">Novedad de la transportadora: {tracking.novelty}</p>}
   {!!tracking?.history.length&&<ol className="order-history cx-timeline dropi-history" aria-label="Historial de estados en Dropi">{[...tracking.history].reverse().map((h,i)=><li key={i}><strong>{dropiStatus(h.status)}</strong><time>{when(h.at)}</time>{h.novelty&&<p>{h.novelty}</p>}</li>)}</ol>}
   <p className="small muted">{tracking?.synced_at?'Última consulta: '+when(tracking.synced_at)+'. Se actualiza sola cada 10 minutos.':'El estado se consulta automáticamente cada 10 minutos o con el botón.'}</p></div>}
 </section>;
}
