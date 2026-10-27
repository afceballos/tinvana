import {useEffect,useState} from 'react';
import {api} from './api';
import {useFeedbackState} from './Notifications';
import {InlineLoading} from './Loading';
import {Icon} from './ui';
import {chime} from './NotificationBell';
import './notification-bell.css';

type Settings={events:Record<string,boolean>;channels:Record<string,boolean>;email:string};
type View={settings:Settings;events:Record<string,string>;channels:Record<string,string>;account_email:string};
const permissionText:Record<string,string>={granted:'Permitidas en este navegador',denied:'Bloqueadas: actívalas en la configuración del navegador para este sitio',default:'Todavía no las has permitido'};

// Same card system as the rest of the panel (webhook-current, webhook-head).
export function NotificationSettings(){
 const [view,setView]=useState<View|null>(null);const [draft,setDraft]=useState<Settings|null>(null);const [busy,setBusy]=useState(false);
 const [permission,setPermission]=useState<string>('Notification' in window?Notification.permission:'unsupported');
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{api<View>('/api/notifications/settings').then(v=>{setView(v);setDraft(v.settings);}).catch(e=>setError((e as Error).message));},[]);
 if(!view||!draft)return <InlineLoading title="Cargando notificaciones"/>;
 const dirty=JSON.stringify(draft)!==JSON.stringify(view.settings);
 const toggle=(group:'events'|'channels',k:string)=>setDraft({...draft,[group]:{...draft[group],[k]:!draft[group][k]}});
 return <>
  <div className="section-heading"><div><span className="eyebrow">Tu cuenta</span><h1>Notificaciones</h1></div></div>
  <p className="muted">Elige qué te avisa Tinvana y por dónde. Por ahora los avisos vienen de Ventas por WhatsApp: cuando un chat necesita a una persona de tu equipo.</p>
  <section className="panel narrow webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="bell"/></span><div><span className="eyebrow">Qué te avisamos</span><h2>Eventos</h2></div></div>
   <div className="notify-options">{Object.entries(view.events).map(([k,label])=><label key={k} className="wa-check"><input type="checkbox" checked={draft.events[k]} onChange={()=>toggle('events',k)}/>{label}</label>)}</div>
  </section>
  <section className="panel narrow webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="send"/></span><div><span className="eyebrow">Por dónde</span><h2>Canales</h2></div></div>
   <div className="notify-options">{Object.entries(view.channels).map(([k,label])=><label key={k} className="wa-check"><input type="checkbox" checked={draft.channels[k]} onChange={()=>toggle('channels',k)}/>{label}</label>)}</div>
   {draft.channels.sound&&<div className="row"><button type="button" className="secondary" onClick={()=>chime()}>Probar sonido</button></div>}
   {draft.channels.browser&&<div className="notify-permission"><p className="small"><strong>Notificaciones del navegador:</strong> {permission==='unsupported'?'Este navegador no las admite':permissionText[permission]}.</p>
    {permission==='default'&&<button type="button" className="secondary" onClick={()=>void Notification.requestPermission().then(p=>{setPermission(p);if(p==='granted')setNotice('Listo: este navegador te mostrará los avisos aunque estés en otra pestaña.');})}>Permitir en este navegador</button>}</div>}
   {draft.channels.email&&<label>Correo para los avisos<input type="email" maxLength={254} value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})} placeholder={view.account_email}/><span className="small muted">Déjalo vacío para usar el correo de tu cuenta ({view.account_email}). Se envía con el mismo sistema de correos de los pedidos.</span></label>}
   <p className="small muted">El sonido y la notificación del navegador funcionan mientras Tinvana esté abierto en alguna pestaña. El correo llega aunque no estés en Tinvana.</p>
  </section>
  <div className="row"><button className="primary" disabled={busy||!dirty} onClick={()=>{setBusy(true);api<View>('/api/notifications/settings',{method:'PUT',body:JSON.stringify(draft)}).then(v=>{setView(v);setDraft(v.settings);setNotice('Notificaciones guardadas.');}).catch(e=>setError((e as Error).message)).finally(()=>setBusy(false));}}>{busy?'Guardando…':'Guardar notificaciones'}</button>{dirty&&<button className="secondary" disabled={busy} onClick={()=>setDraft(view.settings)}>Descartar cambios</button>}</div>
 </>;
}
