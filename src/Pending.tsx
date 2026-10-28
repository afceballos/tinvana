import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api,post} from './api';
import {useFeedbackState} from './Notifications';
import {InlineLoading} from './Loading';
import {Icon} from './ui';
import './pending.css';

type Item={key:string;title:string;detail:string;since:string|null;links:{label:string;to:string}[];reviewable:boolean;warn:string|null};
type Section={key:string;title:string;urgent:boolean;items:Item[]};
type View={sections:Section[];urgent:number;total:number;message?:string};
const ICONS:Record<string,string>={chats:'chat',novelties:'truck',confirm:'check',dropi:'send',failed:'close',templates:'mail'};
const HINT:Record<string,string>={chats:'El cliente escribió y nadie le ha respondido.',novelties:'Problemas en la entrega reportados por la transportadora.',confirm:'Borradores que el cliente no confirmó o que no se le pudieron enviar.',dropi:'Pedidos confirmados que todavía no están en Dropi.',failed:'Mensajes, avisos, recordatorios y correos de los últimos 7 días.',templates:'Plantillas que usas en confirmaciones o avisos y que Meta no deja enviar.'};

/** «Hace 3 h», «hace 2 días»… */
export function ago(v:string|null):string{
 if(!v)return '';const m=Math.max(0,Math.round((Date.now()-new Date(v).getTime())/60000));
 if(m<1)return 'ahora';if(m<60)return 'hace '+m+' min';const h=Math.round(m/60);if(h<24)return 'hace '+h+' h';const d=Math.round(h/24);return 'hace '+d+(d===1?' día':' días');
}

/** Stage 6C: what needs a person, most urgent first. Items solve themselves from their link; some can be marked as reviewed. */
export function PendingPage(){
 const [view,setView]=useState<View|null>(null);const [busy,setBusy]=useState('');
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 const load=()=>api<View>('/api/pending').then(setView).catch(e=>setError((e as Error).message));
 useEffect(()=>{void load();const id=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);return()=>window.clearInterval(id);},[]);
 if(!view)return <InlineLoading title="Cargando pendientes"/>;
 async function review(key:string){setBusy(key);setError('');try{const r=await post<View>('/api/pending/review',{key});setView(r);setNotice(r.message||'Marcado como revisado.');window.dispatchEvent(new Event('tinbana:pending'));}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <div className="pending-page">
  <div className="section-heading"><div><span className="eyebrow">Operación del día</span><h1>Pendientes</h1></div><span className="pill">{view.total===0?'Todo al día':view.total===1?'1 pendiente':view.total+' pendientes'}</span></div>
  <p className="muted">Lo que necesita a una persona, de lo más urgente a lo menos. Cada pendiente desaparece cuando lo resuelves desde su enlace; los que no se resuelven solos se pueden marcar como revisados.</p>
  {view.total===0&&<section className="panel pending-empty"><span className="webhook-logo" aria-hidden="true"><Icon name="check"/></span><div><h2>Todo al día</h2><p className="muted">No hay chats esperando, novedades ni envíos con problemas.</p></div></section>}
  {view.sections.filter(s=>s.items.length).map(s=><section key={s.key} className={'panel pending-section'+(s.urgent?' is-urgent':'')} aria-labelledby={'pending-'+s.key}>
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name={ICONS[s.key]||'bell'}/></span><div><span className="eyebrow">{s.urgent?'Urgente':'Por revisar'}</span><h2 id={'pending-'+s.key}>{s.title}</h2></div><span className={'pending-count'+(s.urgent?' is-urgent':'')}>{s.items.length}</span></div>
   <p className="small muted">{HINT[s.key]}</p>
   <ul className="pending-list">{s.items.map(i=><li key={i.key}>
    <div className="pending-main"><div className="pending-top"><strong>{i.title}</strong>{i.since&&<time dateTime={i.since} title={new Date(i.since).toLocaleString('es-CO')}>{ago(i.since)}</time>}</div>
     <p>{i.detail}</p>{i.warn&&<p className="pending-warn" role="note">{i.warn}</p>}</div>
    <div className="pending-actions">{i.links.map(l=><Link key={l.to} className="secondary" to={l.to}>{l.label}</Link>)}{i.reviewable&&<button type="button" className="secondary" disabled={busy===i.key} onClick={()=>void review(i.key)}>{busy===i.key?'Guardando…':'Marcar como revisado'}</button>}</div>
   </li>)}</ul>
  </section>)}
 </div>;
}

/** Menu counter of urgent pendings (chats waiting for an advisor and Dropi novelties), refreshed every minute. */
export function usePendingCount(enabled:boolean,path:string):number{
 const [n,setN]=useState(0);
 useEffect(()=>{if(!enabled){setN(0);return;}let stop=false;
  const read=()=>{if(document.visibilityState!=='visible')return;api<{urgent:number}>('/api/pending/count').then(r=>{if(!stop)setN(r.urgent);}).catch(()=>{});};
  read();const id=window.setInterval(read,60000);window.addEventListener('tinbana:pending',read);
  return()=>{stop=true;window.clearInterval(id);window.removeEventListener('tinbana:pending',read);};},[enabled,path]);
 return n;
}
