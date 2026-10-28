import {useEffect,useRef,useState} from 'react';
import {api,post} from './api';
import {useFeedbackState} from './Notifications';
import {InlineLoading} from './Loading';
import {Icon} from './ui';
import './mail-settings.css';

type Kind='buyer_received'|'owner_new_order'|'buyer_confirmed'|'buyer_cancelled'|'buyer_guide'|'buyer_in_transit'|'buyer_novelty'|'buyer_delivered';
type MessageKind=Exclude<Kind,'owner_new_order'>;
type Settings={enabled:Record<Kind,boolean>;sender_name:string;reply_to:string;owner_email:string;messages:Record<MessageKind,string>};
type View={settings:Settings;account_email:string;mail_configured:boolean};
const kinds:{kind:Kind;title:string;who:string;icon:string}[]=[
 {kind:'buyer_received',title:'Pedido recibido',who:'Al comprador, cuando envía el formulario de una landing.',icon:'check'},
 {kind:'owner_new_order',title:'Nuevo pedido',who:'A ti, al correo de avisos, con sus datos y un botón para abrir el pedido.',icon:'truck'},
 {kind:'buyer_confirmed',title:'Pedido confirmado',who:'Al comprador, cuando registras su aceptación.',icon:'send'},
 {kind:'buyer_cancelled',title:'Pedido cancelado',who:'Al comprador, cuando cancelas el pedido.',icon:'close'},
 {kind:'buyer_guide',title:'Guía generada',who:'Al comprador, cuando Dropi genera la guía (con número y transportadora).',icon:'box'},
 {kind:'buyer_in_transit',title:'Pedido en camino',who:'Al comprador, cuando la transportadora lo lleva hacia su dirección.',icon:'truck'},
 {kind:'buyer_novelty',title:'Novedad en la entrega',who:'Al comprador, cuando Dropi reporta una novedad (dirección, ausencia…).',icon:'bell'},
 {kind:'buyer_delivered',title:'Pedido entregado',who:'Al comprador, cuando Dropi lo marca como entregado.',icon:'check'},
];

// Same card system as the GHL and Dropi connection pages (webhook-current, webhook-head, webhook-state).
export function MailSettingsPage(){
 const [view,setView]=useState<View|null>(null);const [draft,setDraft]=useState<Settings|null>(null);const [busy,setBusy]=useState(false);
 const [preview,setPreview]=useState<{kind:Kind;subject:string;html:string}|null>(null);const dialog=useRef<HTMLDialogElement>(null);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{const c=new AbortController();api<View>('/api/mail-settings',{signal:c.signal}).then(r=>{setView(r);setDraft(r.settings);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[]);
 useEffect(()=>{if(preview&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[preview]);
 if(!view||!draft)return <InlineLoading title="Cargando tus correos"/>;
 const dirty=JSON.stringify(draft)!==JSON.stringify(view.settings);
 const set=(patch:Partial<Settings>)=>setDraft({...draft,...patch});
 async function save(){setBusy(true);setError('');try{const r=await api<View>('/api/mail-settings',{method:'PUT',body:JSON.stringify({settings:draft})});setView(r);setDraft(r.settings);setNotice('Configuración de correos guardada.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function open(kind:Kind){setBusy(true);try{const r=await post<{subject:string;html:string}>('/api/mail-settings/preview/'+kind,{settings:draft});setPreview({kind,...r});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function test(kind:Kind){setBusy(true);setError('');try{const r=await post<{message:string}>('/api/mail-settings/test',{kind});setNotice(r.message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const active=kinds.filter(k=>draft.enabled[k.kind]).length;
 return <>
  <div className="section-heading"><div><span className="eyebrow">Comunicación con tus compradores</span><h1>Correos de pedidos</h1></div><span className="pill">{active===1?'1 correo activo':`${active} correos activos`}</span></div>
  <p className="muted">Elige qué correos se envían cuando entra, se confirma o se cancela un pedido, y cuando cambia su estado en Dropi. Todos usan el diseño de Tinbana y se envían automáticamente en menos de un minuto.</p>
  {!view.mail_configured&&<p className="store-warning" role="note">El servidor todavía no tiene configurado el envío de correos. Puedes dejar todo listo; se enviarán cuando el administrador lo active.</p>}
  <section className="panel narrow webhook-current mail-card">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="mail"/></span><div><span className="eyebrow">Remitente</span><h2>Quién envía y a quién responden</h2></div><span className={'webhook-state '+(view.mail_configured?'on':'off')}>{view.mail_configured?'Envío activo':'Sin configurar'}</span></div>
   <label>Nombre del remitente<input value={draft.sender_name} maxLength={60} onChange={e=>set({sender_name:e.target.value})} placeholder="Tu tienda"/><span className="small muted">Es el nombre que ve el comprador. Los correos salen desde la dirección de la plataforma con este nombre.</span></label>
   <label>Correo de respuesta<input type="email" value={draft.reply_to} maxLength={254} required onChange={e=>set({reply_to:e.target.value})}/><span className="small muted">Si el comprador responde un correo, la respuesta llega aquí.</span></label>
   <label>Correo para avisos de nuevos pedidos<input type="email" value={draft.owner_email} maxLength={254} required onChange={e=>set({owner_email:e.target.value})}/><span className="small muted">Tu correo de acceso es {view.account_email}.</span></label>
  </section>
  <section className="panel narrow webhook-current mail-card">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="send"/></span><div><span className="eyebrow">Correos automáticos</span><h2>Qué correos se envían</h2></div></div>
   <ul className="mail-kinds">{kinds.map(k=>{const on=draft.enabled[k.kind];const message=k.kind==='owner_new_order'?null:k.kind as MessageKind;return <li key={k.kind} className={'mail-kind'+(on?' is-on':'')}>
    <div className="mail-kind-head"><span className="mail-kind-icon" aria-hidden="true"><Icon name={k.icon}/></span><div><strong>{k.title}</strong><p>{k.who}</p></div>
     <label className="mail-switch"><input type="checkbox" checked={on} onChange={e=>set({enabled:{...draft.enabled,[k.kind]:e.target.checked}})}/><span aria-hidden="true"/><span className="sr-only">Enviar «{k.title}»</span></label></div>
    {on&&message&&<label className="mail-message">Mensaje adicional (opcional)<textarea maxLength={500} rows={3} value={draft.messages[message]} placeholder="Ej.: Despachamos de lunes a sábado. Ten a mano el valor exacto si pagas contra entrega." onChange={e=>set({messages:{...draft.messages,[message]:e.target.value}})}/><span className="small muted">{draft.messages[message].length}/500 · Solo texto; aparece en un recuadro dentro del correo.</span></label>}
    <button type="button" className="secondary mail-preview-button" disabled={busy} onClick={()=>void open(k.kind)}>Vista previa</button>
   </li>;})}</ul>
  </section>
  <div className="mail-save"><button className="primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?'Guardando…':'Guardar cambios'}</button>{dirty?<span className="small muted">Tienes cambios sin guardar.</span>:<span className="small muted">Todo guardado.</span>}</div>
  {preview&&<dialog ref={dialog} className="mail-preview" aria-labelledby="mail-preview-title" onClose={()=>setPreview(null)}>
   <header><div><span className="eyebrow">Vista previa</span><h2 id="mail-preview-title">{kinds.find(k=>k.kind===preview.kind)?.title}</h2><p className="small muted">Asunto: {preview.subject}</p></div><button type="button" className="secondary" aria-label="Cerrar vista previa" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></header>
   <iframe title={'Vista previa: '+preview.subject} sandbox="" srcDoc={preview.html}/>
   <footer><span className="small muted">Datos de ejemplo. {dirty?'Incluye tus cambios sin guardar.':''}</span><button type="button" className="primary" disabled={busy||dirty||!view.mail_configured} title={dirty?'Guarda los cambios antes de enviarte una prueba':undefined} onClick={()=>void test(preview.kind)}>Enviarme una prueba</button></footer>
  </dialog>}
 </>;
}
