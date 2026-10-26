import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {post,getCsrf,ApiError} from '../api';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import {WhatsAppTabs} from './WhatsAppTabs';
import './inbox.css';

type Last={body:string;type:string;sender:string;direction:'in'|'out';status:string};
type Summary={id:string;name:string|null;phone:string;owner_mode:'ai'|'human';handoff_reason:string|null;unread:number;stage:string;last_message_at:string|null;last_customer_at:string|null;window_open:boolean;window_closes_at:string|null;version:number;last:Last|null};
type Message={id:string;direction:'in'|'out';type:string;body:string;status:string;sender:string;error:string|null;created_at:string;status_at:string|null;supported:boolean;local?:'sending'|'unconfirmed'};
type ListView={unchanged?:boolean;stamp:string;conversations?:Summary[];counts?:{total:number;today:number;ai:number;human:number;unread:number};connected?:boolean};
type DetailView={unchanged?:boolean;stamp:string;conversation?:Summary&{contact_since:string;has_referral:boolean};messages?:Message[]};
type Filter='all'|'ai'|'human'|'unread';

const FILTERS:[Filter,string][]=[['all','Todas'],['ai','IA'],['human','Asesor'],['unread','No leídas']];
const MEDIA:Record<string,string>={image:'Imagen',audio:'Audio',video:'Video',document:'Documento',sticker:'Sticker',location:'Ubicación',contacts:'Contacto'};
const STATUS:Record<string,string>={queued:'Enviado a WhatsApp',sent:'Enviado',delivered:'Entregado',read:'Leído',played:'Reproducido',failed:'No entregado'};
const tz='America/Bogota';
const initials=(c:{name:string|null;phone:string})=>(c.name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()).join('')||c.phone.slice(-2);
const display=(c:{name:string|null;phone:string})=>c.name||'+'+c.phone;
const phone=(p:string)=>'+'+p.replace(/^(\d{2})(\d{3})(\d{3})(\d+)$/,'$1 $2 $3 $4');
function day(d:Date){return d.toLocaleDateString('es-CO',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});}
function shortTime(v:string|null){
 if(!v)return '';const d=new Date(v),now=new Date();
 if(day(d)===day(now))return d.toLocaleTimeString('es-CO',{timeZone:tz,hour:'numeric',minute:'2-digit'});
 if(day(d)===day(new Date(now.getTime()-864e5)))return 'ayer';
 if(now.getTime()-d.getTime()<6*864e5)return d.toLocaleDateString('es-CO',{timeZone:tz,weekday:'short'});
 return d.toLocaleDateString('es-CO',{timeZone:tz,day:'numeric',month:'short'});
}
function dayLabel(v:string){const d=new Date(v),now=new Date();if(day(d)===day(now))return 'Hoy';if(day(d)===day(new Date(now.getTime()-864e5)))return 'Ayer';return d.toLocaleDateString('es-CO',{timeZone:tz,weekday:'long',day:'numeric',month:'long'});}
function remaining(closes:string|null){if(!closes)return '';const ms=new Date(closes).getTime()-Date.now();if(ms<=0)return '';const h=Math.floor(ms/36e5),m=Math.floor(ms%36e5/6e4);return h?`${h} h ${m} min`:`${m} min`;}
function preview(l:Last|null){
 if(!l)return 'Sin mensajes';const text=l.body||(MEDIA[l.type]?MEDIA[l.type]+' recibido':l.type==='reaction'?'Reacción':'Mensaje no compatible');
 return (l.direction==='out'?(l.sender==='ai'?'IA: ':'Tú: '):'')+text;
}
// Polling must not count as activity (X-Session-Probe) nor light the global loading bar, so it uses fetch directly.
async function poll<T>(path:string):Promise<T|null>{
 const r=await fetch(path,{credentials:'same-origin',headers:{'X-Session-Probe':'1'}});
 if(r.status===401){window.dispatchEvent(new Event('session-expired'));return null;}
 if(!r.ok)throw new ApiError(((await r.json().catch(()=>({}))) as {error?:string}).error||'No se pudo actualizar la bandeja.',r.status);
 return r.json() as Promise<T>;
}
function usePolling(task:()=>Promise<void>,deps:unknown[]){
 const ref=useRef(task);ref.current=task;
 useEffect(()=>{
  let stop=false,timer=0;
  const tick=async()=>{if(stop)return;try{await ref.current();}catch{/* the next tick retries */}if(!stop)timer=window.setTimeout(tick,document.visibilityState==='visible'?4000:20000);};
  const wake=()=>{if(document.visibilityState==='visible'){clearTimeout(timer);void tick();}};
  void tick();document.addEventListener('visibilitychange',wake);
  return()=>{stop=true;clearTimeout(timer);document.removeEventListener('visibilitychange',wake);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },deps);
}

export function WhatsAppInbox(){
 const {id}=useParams();const navigate=useNavigate();
 const [filter,setFilter]=useState<Filter>('all');const [query,setQuery]=useState('');const [search,setSearch]=useState('');
 const [list,setList]=useState<ListView|null>(null);const stamp=useRef('');const [nudge,setNudge]=useState(0);
 const [,setError]=useFeedbackState('error');
 useEffect(()=>{const t=setTimeout(()=>setSearch(query.trim()),300);return()=>clearTimeout(t);},[query]);
 useEffect(()=>{stamp.current='';},[filter,search]);
 usePolling(async()=>{
  const r=await poll<ListView>(`/api/whatsapp/conversations?filter=${filter}&q=${encodeURIComponent(search)}&stamp=${stamp.current}`);
  if(!r||r.unchanged)return;stamp.current=r.stamp;setList(r);
 },[filter,search,nudge]);
 // After an action in the open chat the list is fetched again right away instead of waiting for the next tick.
 const refreshList=useCallback(()=>{stamp.current='';setNudge(n=>n+1);},[]);
 if(!list)return <><WhatsAppTabs/><InlineLoading title="Cargando la bandeja"/></>;
 const counts=list.counts!;const items=list.conversations||[];
 return <>
  <WhatsAppTabs unread={counts.unread}/>
  {!list.connected&&<section className="panel narrow webhook-current"><div className="webhook-head"><span className="webhook-logo wa-logo" aria-hidden="true"><Icon name="whatsapp"/></span><div><span className="eyebrow">Primer paso</span><h2>Conecta tu número de WhatsApp</h2></div></div><p className="small muted">Cuando tu número esté conectado, aquí verás cada conversación con tus clientes.</p><div className="row"><Link className="button primary" to="/panel/whatsapp/conexion">Ir a Conexión</Link></div></section>}
  <div className={'wa-stats'+(id?' has-chat':'')} role="list" aria-label="Resumen de conversaciones">
   {([['today','Conversaciones hoy'],['ai','Con la IA'],['human','Con un asesor'],['unread','Sin leer']] as const).map(([k,label])=><div role="listitem" key={k} className={'wa-stat'+(k==='unread'&&counts.unread?' is-alert':'')}><strong>{counts[k]}</strong><span>{label}</span></div>)}
  </div>
  <div className={'wa-inbox'+(id?' has-chat':'')}>
   <aside className="wa-list" aria-label="Conversaciones">
    <div className="wa-col-head"><h2>Conversaciones</h2><span className="wa-live" title="Se actualiza sola cada pocos segundos">En vivo</span></div>
    <label className="wa-search"><Icon name="search"/><span className="sr-only">Buscar por nombre o teléfono</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nombre o teléfono"/></label>
    <div className="wa-filters" role="group" aria-label="Filtrar conversaciones">{FILTERS.map(([k,label])=><button key={k} type="button" className={filter===k?'is-active':''} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{label}</button>)}</div>
    <ul className="wa-items">
     {items.map(c=><li key={c.id}><Link to={'/panel/whatsapp/'+c.id} className={'wa-item'+(c.id===id?' is-active':'')+(c.unread?' is-unread':'')} aria-current={c.id===id?'page':undefined}>
      <span className="wa-avatar" aria-hidden="true">{initials(c)}</span>
      <span className="wa-item-main"><span className="wa-item-top"><strong>{display(c)}</strong><time dateTime={c.last_message_at||undefined}>{shortTime(c.last_message_at)}</time></span>
       <span className="wa-item-preview">{preview(c.last)}</span>
       <span className="wa-item-tags"><span className={'wa-tag '+(c.owner_mode==='ai'?'is-ai':'is-human')}>{c.owner_mode==='ai'?'IA':'Asesor'}</span>{!c.window_open&&<span className="wa-tag is-muted">Ventana cerrada</span>}{c.unread>0&&<span className="wa-unread" aria-label={c.unread+' sin leer'}>{c.unread}</span>}</span>
      </span>
     </Link></li>)}
     {!items.length&&<li className="wa-empty">{search||filter!=='all'?'No hay conversaciones con ese filtro.':'Todavía no hay conversaciones. Aparecerán aquí cuando un cliente escriba a tu número.'}</li>}
    </ul>
   </aside>
   {id?<Conversation key={id} id={id} onChange={refreshList} onBack={()=>navigate('/panel/whatsapp')} onError={setError}/>:<section className="wa-chat wa-placeholder"><Icon name="chat"/><p>Elige una conversación para verla.</p></section>}
  </div>
 </>;
}

function Conversation({id,onChange,onBack,onError}:{id:string;onChange:()=>void;onBack:()=>void;onError:(m:string)=>void}){
 const [view,setView]=useState<DetailView|null>(null);const [missing,setMissing]=useState(false);const stamp=useRef('');
 const [pending,setPending]=useState<Message[]>([]);const [text,setText]=useState('');const [busy,setBusy]=useState(false);
 const scroller=useRef<HTMLDivElement>(null);const stick=useRef(true);const [,setNotice]=useFeedbackState('success');const [,tick]=useState(0);
 const load=useCallback(async()=>{
  try{const r=await poll<DetailView>(`/api/whatsapp/conversations/${id}?stamp=${stamp.current}`);if(!r||r.unchanged)return;stamp.current=r.stamp;setView(r);
   setPending(p=>p.filter(m=>!r.messages!.some(x=>x.id===m.id)));
   if(r.conversation!.unread>0&&document.visibilityState==='visible'){await fetch(`/api/whatsapp/conversations/${id}/read`,{method:'POST',credentials:'same-origin',headers:{'X-Session-Probe':'1','X-CSRF-Token':getCsrf()}});onChange();}
  }catch(e){if(e instanceof ApiError&&e.status===404)setMissing(true);else throw e;}
 },[id,onChange]);
 usePolling(load,[id]);
 useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),30000);return()=>clearInterval(t);},[]);
 const messages=[...(view?.messages||[]),...pending];
 useLayoutEffect(()=>{const el=scroller.current;if(el&&stick.current)el.scrollTop=el.scrollHeight;},[messages.length,view?.stamp]);
 if(missing)return <section className="wa-chat wa-placeholder"><p>Esta conversación no existe o no es tuya.</p><button className="secondary" onClick={onBack}>Volver a la bandeja</button></section>;
 if(!view?.conversation)return <section className="wa-chat"><InlineLoading title="Cargando la conversación"/></section>;
 const c=view.conversation;const human=c.owner_mode==='human';const left=remaining(c.window_closes_at);
 const blocked=!human?'Toma la conversación para responder.':!c.window_open?'La ventana de 24 horas está cerrada: solo se pueden enviar plantillas aprobadas hasta que el cliente vuelva a escribir.':'';
 async function act(path:'take'|'release'){
  setBusy(true);try{const r=await post<DetailView>(`/api/whatsapp/conversations/${id}/${path}`,{version:c.version});stamp.current=r.stamp;setView(r);onChange();setNotice(path==='take'?'Tomaste la conversación. La IA y los mensajes automáticos no escribirán en este chat.':'La conversación volvió a la IA.');}
  catch(e){onError((e as Error).message);stamp.current='';void load();}finally{setBusy(false);}
 }
 async function send(m:Message){
  setPending(p=>[...p.filter(x=>x.id!==m.id),{...m,local:'sending'}]);stick.current=true;
  try{const r=await post<{message:Message}>(`/api/whatsapp/conversations/${id}/messages`,{client_id:m.id,body:m.body});setPending(p=>p.map(x=>x.id===m.id?r.message:x));stamp.current='';onChange();if(r.message.status==='failed')onError(r.message.error||'El mensaje no se envió.');}
  catch(e){
   // A network error leaves the result unknown; resending reuses the same id, so the server never sends it twice.
   if(e instanceof ApiError&&e.status<500){setPending(p=>p.filter(x=>x.id!==m.id));setText(t=>t||m.body);onError(e.message);}
   else setPending(p=>p.map(x=>x.id===m.id?{...x,local:'unconfirmed'}:x));
  }
 }
 function submit(){const body=text.trim();if(!body||blocked)return;setText('');void send({id:crypto.randomUUID(),direction:'out',type:'text',body,status:'queued',sender:'agent',error:null,created_at:new Date().toISOString(),status_at:null,supported:true});}
 let lastDay='';
 return <>
  <section className="wa-chat" aria-label={'Conversación con '+display(c)}>
   <header className="wa-chat-head">
    <button type="button" className="wa-back" onClick={onBack} aria-label="Volver a la bandeja"><Icon name="chevron"/></button>
    <span className="wa-avatar" aria-hidden="true">{initials(c)}</span>
    <div className="wa-chat-who"><strong>{display(c)}</strong><span>{phone(c.phone)}</span></div>
    {human?<button type="button" className="secondary" disabled={busy} onClick={()=>void act('release')}>Devolver a la IA</button>:<button type="button" className="primary" disabled={busy} onClick={()=>void act('take')}>Tomar conversación</button>}
   </header>
   {!human&&<p className="wa-banner" role="note">El agente de IA llega en la próxima etapa. Por ahora, toma la conversación para responder tú.</p>}
   <div className="wa-messages" ref={scroller} onScroll={e=>{const el=e.currentTarget;stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}} aria-live="polite">
    {messages.map(m=>{const label=dayLabel(m.created_at);const sep=label!==lastDay;lastDay=label;
     return <div key={m.id} className="wa-msg-wrap">{sep&&<div className="wa-day"><span>{label}</span></div>}
      <div className={'wa-msg '+(m.direction==='in'?'is-in':'is-out')+(m.status==='failed'||m.local==='unconfirmed'?' is-failed':'')}>
       {m.direction==='out'&&<span className="wa-msg-sender">{m.sender==='ai'?'Agente IA':m.sender==='template'?'Plantilla':'Asesor'}</span>}
       {m.supported?(m.type==='reaction'?<p className="wa-reaction">Reaccionó {m.body||'(quitó la reacción)'}</p>:<p>{m.body}</p>)
        :<p className="wa-unsupported"><Icon name={m.type==='image'?'image':'box'}/>{(MEDIA[m.type]||'Archivo')+' recibido (no compatible todavía)'}{m.body&&<span>{m.body}</span>}</p>}
       <span className="wa-msg-meta"><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString('es-CO',{timeZone:tz,hour:'numeric',minute:'2-digit'})}</time>{m.direction==='out'&&<Ticks m={m}/>}</span>
       {(m.status==='failed'&&m.error)&&<span className="wa-msg-error">{m.error}</span>}
       {m.local==='unconfirmed'&&<span className="wa-msg-error">No se pudo confirmar el envío. <button type="button" className="link" onClick={()=>void send(m)}>Reintentar</button> (no se duplicará).</span>}
      </div></div>;})}
    {!messages.length&&<p className="wa-empty">Sin mensajes todavía.</p>}
   </div>
   <form className="wa-composer" onSubmit={e=>{e.preventDefault();submit();}}>
    {blocked&&<p className="wa-composer-note">{blocked}</p>}
    <div className="wa-composer-row">
     <label className="sr-only" htmlFor="wa-text">Mensaje</label>
     <textarea id="wa-text" rows={1} value={text} maxLength={4096} disabled={!!blocked} placeholder={blocked?'':'Escribe un mensaje'} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/>
     <button className="primary wa-send" disabled={!!blocked||!text.trim()} aria-label="Enviar"><Icon name="send"/></button>
    </div>
    {text.length>3500&&<span className="small muted">{4096-text.length} caracteres disponibles</span>}
   </form>
  </section>
  <aside className="wa-context" aria-label="Contexto de la conversación">
   <h2>Contexto</h2>
   <section><h3>Cliente</h3><dl><div><dt>Nombre en WhatsApp</dt><dd>{c.name||'Sin nombre'}</dd></div><div><dt>Teléfono</dt><dd>{phone(c.phone)}</dd></div><div><dt>Escribió por primera vez</dt><dd>{new Date(c.contact_since).toLocaleDateString('es-CO',{timeZone:tz,day:'numeric',month:'long',year:'numeric'})}</dd></div><div><dt>Llegó desde</dt><dd>{c.has_referral?'Un anuncio o publicación':'Mensaje directo'}</dd></div></dl></section>
   <section><h3>Responsable</h3><p className={'wa-mode '+(human?'is-human':'is-ai')}>{human?'Asesor':'Agente IA'}</p>{c.handoff_reason&&<p className="small muted">{c.handoff_reason}</p>}<p className="small muted">{human?'La IA y los mensajes automáticos no escriben mientras atiendas este chat. Ningún temporizador lo devuelve a la IA.':'Al tomarla, la IA y los mensajes automáticos dejan de escribir en este chat.'}</p></section>
   <section><h3>Ventana de 24 horas</h3>{c.window_open?<p className="wa-window is-open"><Icon name="clock"/>Abierta · cierra en {left||'menos de un minuto'}</p>:<p className="wa-window"><Icon name="clock"/>Cerrada</p>}<p className="small muted">WhatsApp permite responder con texto libre hasta 24 horas después del último mensaje del cliente. Después solo se pueden enviar plantillas aprobadas por Meta.</p></section>
  </aside>
 </>;
}
function Ticks({m}:{m:Message}){
 if(m.local==='sending')return <span className="wa-ticks" title="Enviando"><Icon name="clock"/></span>;
 if(m.local==='unconfirmed'||m.status==='failed')return <span className="wa-ticks is-failed" title="No entregado">!</span>;
 const label=STATUS[m.status]||m.status;
 return <span className={'wa-ticks is-'+m.status} title={label} aria-label={label}>{m.status==='queued'?<Icon name="clock"/>:m.status==='sent'?'✓':'✓✓'}</span>;
}
