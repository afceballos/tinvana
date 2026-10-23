import {useState} from 'react';
import {Icon} from './ui';

export type DropiState={status:'not_sent'|'sending'|'sent'|'failed'|'unknown';can_submit:boolean;can_resolve:boolean;dropi_order_id:string|null;message:string;checks:{key:string;label:string;ready:boolean}[];preview:Record<string,string|number|null>|null;last:{outcome?:string;message?:string;http_status?:number;finished_at?:string}|null};
export const dropiLabels:Record<DropiState['status'],string>={not_sent:'No enviado a Dropi',sending:'Enviando a Dropi',sent:'Creado en Dropi',failed:'Rechazado por Dropi',unknown:'Envío por verificar'};
const cash=(v:unknown)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v));
const rows:[string,(p:Record<string,string|number|null>)=>string][]=[['Destinatario',p=>`${p.name} ${p.surname}`],['Teléfono',p=>String(p.phone)],['Dirección',p=>String(p.dir)],['Departamento y ciudad',p=>`${p.state} · ${p.city}`],['Producto',p=>`ID ${p.product_id}${p.variation_id?' · variante '+p.variation_id:''} · ${p.quantity} und.`],['Valor a recaudar',p=>cash(p.total_order)],['Tipo',p=>`${p.rate_type} · ${p.status}`]];

export function OrderDropi({dropi,busy,onSubmit,onResolve}:{dropi:DropiState;busy:boolean;onSubmit:()=>void;onResolve:(body:Record<string,unknown>)=>void}){
 const [reviewed,setReviewed]=useState(false),[outcome,setOutcome]=useState(''),[external,setExternal]=useState(''),[note,setNote]=useState('');
 const p=dropi.preview;
 return <section className="order-panel od-card"><header className="od-card-head"><span className="od-icon"><Icon name="send"/></span><h2>Envío a Dropi</h2></header>
  <p><span className={'order-state dropi-'+dropi.status}>{dropiLabels[dropi.status]}</span>{dropi.dropi_order_id&&<strong className="order-dropi-id"> Orden Dropi #{dropi.dropi_order_id}</strong>}</p>
  <p className="muted">{dropi.message}</p>
  {dropi.last?.message&&dropi.status!=='sent'&&<p className="order-dropi-last">Último resultado: {dropi.last.message}{dropi.last.http_status?` (HTTP ${dropi.last.http_status})`:''}</p>}
  {dropi.status!=='sent'&&<ul className="order-readiness">{dropi.checks.map(check=><li key={check.key}><span className={check.ready?'is-ready':'is-pending'}>{check.ready?'Listo':'Pendiente'}</span><span>{check.label}</span></li>)}</ul>}
  {p&&<dl className="order-dropi-preview">{rows.map(([k,f])=><div key={k}><dt>{k}</dt><dd>{f(p)}</dd></div>)}</dl>}
  {dropi.can_submit&&<form onSubmit={e=>{e.preventDefault();if(reviewed)onSubmit();}}><fieldset disabled={busy}><label className="order-check"><input type="checkbox" required checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>Revisé los datos. Crear la orden en Dropi con estado pendiente de confirmación.</span></label><button className="primary">{busy?'Enviando…':dropi.status==='failed'?'Reintentar envío a Dropi':'Enviar a Dropi'}</button></fieldset></form>}
  {dropi.can_resolve&&<form className="order-dropi-resolve" onSubmit={e=>{e.preventDefault();onResolve({outcome,note,...(outcome==='created'?{dropi_order_id:external.trim()}:{})});}}><fieldset disabled={busy}><h3>¿Qué ves en tu panel de Dropi?</h3><label><select required value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">Selecciona el resultado</option><option value="created">La orden sí existe en Dropi</option><option value="not_created">La orden no existe en Dropi</option></select></label>{outcome==='created'&&<label>Número de orden en Dropi<input required inputMode="numeric" pattern="[1-9][0-9]{0,17}" value={external} onChange={e=>setExternal(e.target.value)}/></label>}<label>Nota de la verificación<textarea required maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Qué buscaste y qué encontraste en Dropi."/></label><button className="secondary">Registrar verificación</button></fieldset></form>}
 </section>;
}
