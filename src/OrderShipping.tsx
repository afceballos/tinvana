import {useState} from 'react';
import {Icon} from './ui';
import type {DropiTracking} from './OrderDropi';

/** Order of an own product (no Dropi): the store marks each shipping step; the customer gets the same notices. Backend: OwnProducts::ship. */
export const ownLabels:Record<string,string>={not_requested:'Por despachar',pending:'En preparación',guide_generated:'Despachado',in_transit:'En camino',novelty:'Con novedad',delivered:'Entregado',returned:'Devuelto',cancelled:'Cancelado'};
const when=(v:string|null|undefined)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha';
const NOTICE:Record<string,string>={guide_generated:'El cliente recibe un aviso con la guía y la transportadora.',in_transit:'El cliente recibe un aviso de que va en camino.',novelty:'El cliente recibe el aviso con esta nota y tú lo ves en Pendientes.',delivered:'El cliente recibe un aviso de entrega.',pending:'Sin aviso al cliente.',returned:'Sin aviso al cliente. Si controlas stock, las unidades vuelven al inventario.'};

export function OrderShipping({state,confirmed,cancelled,message,states,canShip,stockUnits,tracking,busy,onShip}:{state:string;confirmed:boolean;cancelled:boolean;message:string;states:Record<string,string>;canShip:boolean;stockUnits:number|null;tracking:DropiTracking|null;busy:boolean;onShip:(body:Record<string,unknown>)=>void}){
 const options=Object.keys(states).filter(k=>k!==state);
 const [next,setNext]=useState(''),[carrier,setCarrier]=useState(tracking?.carrier||''),[guide,setGuide]=useState(tracking?.guide||''),[note,setNote]=useState('');
 const chosen=next||options.find(k=>k==='guide_generated')||options[0]||'';
 return <section className="order-panel od-card"><header className="od-card-head"><span className="od-icon"><Icon name="truck"/></span><h2>Envío</h2></header>
  <p><span className={'order-state ship-'+state}>{cancelled?'Cancelado':ownLabels[state]||state}</span></p>
  <p className="muted">{message}</p>
  {stockUnits!=null&&<p className="small muted">Este pedido descontó {stockUnits} {stockUnits===1?'unidad':'unidades'} del stock.</p>}
  {tracking&&(tracking.carrier||tracking.guide)&&<dl className="order-dropi-preview"><div><dt>Transportadora</dt><dd>{tracking.carrier||'Sin indicar'}</dd></div><div><dt>Guía</dt><dd>{tracking.guide||'Sin guía'}</dd></div></dl>}
  {tracking?.novelty&&<p className="store-warning" role="note">Novedad: {tracking.novelty}</p>}
  {canShip&&confirmed&&!cancelled&&<form className="ship-form" onSubmit={e=>{e.preventDefault();onShip({state:chosen,carrier,guide,note});setNext('');setNote('');}}><fieldset disabled={busy}>
   <label>Nuevo estado<select value={chosen} onChange={e=>setNext(e.target.value)}>{options.map(k=><option key={k} value={k}>{states[k]}</option>)}</select></label>
   {['guide_generated','in_transit','delivered'].includes(chosen)&&<div className="ship-pair"><label>Transportadora <small>(opcional)</small><input maxLength={60} value={carrier} onChange={e=>setCarrier(e.target.value)} placeholder="Ej.: Servientrega"/></label><label>Número de guía <small>(opcional)</small><input maxLength={80} value={guide} onChange={e=>setGuide(e.target.value)}/></label></div>}
   <label>{chosen==='novelty'?'Qué pasó':'Nota'} {chosen!=='novelty'&&<small>(opcional, queda en el historial)</small>}<textarea maxLength={500} rows={2} required={chosen==='novelty'} value={note} onChange={e=>setNote(e.target.value)} placeholder={chosen==='novelty'?'Ej.: No había nadie en la dirección; la transportadora vuelve mañana.':''}/></label>
   <p className="small muted">{NOTICE[chosen]}</p>
   <button className="primary">{busy?'Guardando…':'Marcar «'+(states[chosen]||'')+'»'}</button>
  </fieldset></form>}
  {!!tracking?.history?.length&&<ol className="order-history cx-timeline dropi-history" aria-label="Historial de envío">{[...tracking.history].reverse().map((h,i)=><li key={i}><strong>{h.status}</strong><time>{when(h.at)}</time>{h.novelty&&<p>{h.novelty}</p>}{h.note&&<p className="dropi-note">{h.note}</p>}</li>)}</ol>}
 </section>;
}
