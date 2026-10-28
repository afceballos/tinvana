import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {api,post} from '../api';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import {WhatsAppTabs} from './WhatsAppTabs';
import './templates.css';

export type Template={id:string;name:string;language:string;category:string;status:string;body:string;footer:string|null;buttons:string[];variables:{key:string;example:string}[];purpose:string;synced_at:string|null;sendable:boolean};
type Preset={name:string;category:string;language:string;body:string;footer:string;buttons:string[];examples:Record<string,string>};
type View={templates:Template[];presets:Record<string,Preset>;languages:Record<string,string>;categories:Record<string,string>;connected:boolean;message?:string};
type Form={name:string;category:string;language:string;body:string;footer:string;buttons:string[];examples:Record<string,string>;purpose:string};
const STATUS:Record<string,[string,string]>={APPROVED:['is-ok','Aprobada'],PENDING:['is-warn','En revisión'],IN_APPEAL:['is-warn','En apelación'],REJECTED:['is-bad','Rechazada'],PAUSED:['is-muted','Pausada'],DISABLED:['is-bad','Desactivada'],DELETED:['is-muted','Eliminada en Meta'],PENDING_DELETION:['is-muted','Eliminándose']};
const VARS=['nombre','producto','cantidad','total','ciudad','direccion','tienda'];
const keysOf=(body:string)=>[...new Set([...body.matchAll(/\{\{\s*([a-z][a-z0-9_]{0,29})\s*\}\}/g)].map(m=>m[1]))];
const empty:Form={name:'',category:'utility',language:'es_CO',body:'',footer:'',buttons:[''],examples:{},purpose:'custom'};

/** WhatsApp-like preview of a template, with variables replaced by values or examples. */
export function TemplatePreview({body,footer,buttons,values}:{body:string;footer?:string|null;buttons:string[];values:Record<string,string>}){
 const parts=body.split(/(\{\{\s*[a-z][a-z0-9_]{0,29}\s*\}\})/g);
 return <div className="tpl-preview" aria-label="Vista previa del mensaje"><div className="tpl-bubble">
  <p>{parts.map((p,i)=>{const m=p.match(/^\{\{\s*([a-z][a-z0-9_]{0,29})\s*\}\}$/);return m?<mark key={i}>{values[m[1]]||'{{'+m[1]+'}}'}</mark>:<span key={i}>{p}</span>;})}</p>
  {footer&&<small>{footer}</small>}
 </div>{buttons.filter(Boolean).map((b,i)=><div className="tpl-btn" key={i}>{b}</div>)}</div>;
}

export function WhatsAppTemplatesPage(){
 const [view,setView]=useState<View|null>(null);const [form,setForm]=useState<Form|null>(null);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');const area=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{api<View>('/api/whatsapp/templates').then(setView).catch(e=>setError((e as Error).message));},[]);
 async function run(task:()=>Promise<View>){setBusy(true);setError('');try{const r=await task();setView(r);if(r.message)setNotice(r.message);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 if(!view)return <><WhatsAppTabs/><InlineLoading title="Cargando plantillas"/></>;
 if(!view.connected)return <><WhatsAppTabs/><p className="store-warning">Primero conecta tu número en <Link to="/panel/whatsapp/conexion">Conexión</Link>.</p></>;
 const insert=(k:string)=>{if(!form)return;const el=area.current;const token='{{'+k+'}}';const at=el?el.selectionStart:form.body.length;const body=form.body.slice(0,at)+token+form.body.slice(el?el.selectionEnd:at);setForm({...form,body});requestAnimationFrame(()=>{el?.focus();el?.setSelectionRange(at+token.length,at+token.length);});};
 const usePreset=(purpose:string,p:Preset)=>setForm({name:p.name,category:p.category,language:p.language,body:p.body,footer:p.footer,buttons:[...p.buttons],examples:{...p.examples},purpose});
 const has=(name:string)=>view.templates.some(t=>t.name===name&&t.status!=='DELETED');
 return <>
  <WhatsAppTabs/>
  <p className="muted">WhatsApp solo deja escribir primero, o después de 24 horas sin respuesta del cliente, con plantillas aprobadas por Meta. Tinbana las crea y las envía a revisión; Meta cobra cada conversación que inicias con una plantilla.</p>
  <section className="panel webhook-current tpl-list-card">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="mail"/></span><div><span className="eyebrow">Aprobadas por Meta</span><h2>Plantillas</h2></div><button className="secondary" disabled={busy} onClick={()=>void run(()=>post<View>('/api/whatsapp/templates/sync'))}><Icon name="refresh"/>Actualizar estados</button></div>
   <ul className="tpl-list">{view.templates.map(t=><li key={t.id}>
    <div className="tpl-list-main"><div className="tpl-list-top"><strong>{t.name}</strong><span className={'wa-tag '+(STATUS[t.status]?.[0]||'is-muted')}>{STATUS[t.status]?.[1]||t.status}</span><span className="small muted">{view.categories[t.category]?.split(' (')[0]||t.category} · {view.languages[t.language]||t.language}{t.purpose==='external'?' · creada en Meta':''}</span></div>
     <p className="tpl-body">{t.body}</p>{t.buttons.length>0&&<div className="tpl-chips">{t.buttons.map(b=><span key={b}>{b}</span>)}</div>}</div>
    <button className="secondary danger" disabled={busy} onClick={()=>void run(()=>api<View>('/api/whatsapp/templates/'+t.id,{method:'DELETE'}))}>Eliminar</button>
   </li>)}{!view.templates.length&&<li className="wa-empty">Aún no tienes plantillas. Usa una sugerida o crea la tuya.</li>}</ul>
  </section>
  {!form&&<section className="panel webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="automation"/></span><div><span className="eyebrow">Listas para enviar a revisión</span><h2>Plantillas sugeridas</h2></div></div>
   <div className="tpl-presets">{Object.entries(view.presets).map(([purpose,p])=><div key={purpose} className="tpl-preset">
    <strong>{purpose==='order_confirmation'?'Confirmación de pedido':purpose==='order_status'?'Aviso de estado del pedido':'Saludo para nuevo chat'}</strong><span className="small muted">{view.categories[p.category]}</span>
    <TemplatePreview body={p.body} footer={p.footer} buttons={p.buttons} values={p.examples}/>
    <button className="secondary" disabled={busy||has(p.name)} onClick={()=>usePreset(purpose,p)}>{has(p.name)?'Ya la tienes':'Usar y revisar'}</button>
   </div>)}</div>
   <div className="row"><button className="primary" onClick={()=>setForm({...empty,buttons:['']})}>+ Crear plantilla propia</button></div>
  </section>}
  {form&&<section className="panel webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="mail"/></span><div><span className="eyebrow">Se envía a Meta para aprobación</span><h2>Nueva plantilla</h2></div></div>
   <div className="tpl-editor">
    <form className="editor-form" onSubmit={e=>{e.preventDefault();const keys=keysOf(form.body);void run(()=>post<View>('/api/whatsapp/templates',{...form,buttons:form.buttons.filter(b=>b.trim()),examples:Object.fromEntries(keys.map(k=>[k,form.examples[k]||'']))})).then(ok=>{if(ok)setForm(null);});}}>
     <label>Nombre<input required value={form.name} maxLength={60} pattern="[a-z0-9_]{1,60}" onChange={e=>setForm({...form,name:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_')})} placeholder="confirmacion_pedido"/><span className="small muted">Minúsculas, números y guion bajo. No lo ve el cliente.</span></label>
     <div className="tpl-two"><label>Categoría<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{Object.entries(view.categories).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
      <label>Idioma<select value={form.language} onChange={e=>setForm({...form,language:e.target.value})}>{Object.entries(view.languages).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label></div>
     <label>Mensaje<textarea ref={area} required rows={6} maxLength={1024} value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/><span className="small muted">{form.body.length}/1024 · Insertar variable:</span></label>
     <div className="tpl-chips is-buttons">{VARS.map(v=><button type="button" key={v} onClick={()=>insert(v)}>{'{{'+v+'}}'}</button>)}</div>
     {keysOf(form.body).length>0&&<fieldset><legend>Ejemplos para la revisión de Meta</legend>{keysOf(form.body).map(k=><label key={k}>{'{{'+k+'}}'}<input required maxLength={200} value={form.examples[k]||''} onChange={e=>setForm({...form,examples:{...form.examples,[k]:e.target.value}})}/></label>)}</fieldset>}
     <label>Pie (opcional)<input maxLength={60} value={form.footer} onChange={e=>setForm({...form,footer:e.target.value})}/></label>
     <fieldset><legend>Botones de respuesta rápida <span className="muted">(hasta 3)</span></legend>{form.buttons.map((b,i)=><div className="tpl-btn-row" key={i}><input maxLength={25} value={b} aria-label={'Botón '+(i+1)} onChange={e=>setForm({...form,buttons:form.buttons.map((x,j)=>j===i?e.target.value:x)})}/><button type="button" className="secondary" onClick={()=>setForm({...form,buttons:form.buttons.filter((_,j)=>j!==i)})}>Quitar</button></div>)}
      {form.buttons.length<3&&<button type="button" className="secondary" onClick={()=>setForm({...form,buttons:[...form.buttons,'']})}>Agregar botón</button>}</fieldset>
     <div className="row"><button className="primary" disabled={busy}>{busy?'Enviando…':'Enviar a Meta para aprobación'}</button><button type="button" className="secondary" onClick={()=>setForm(null)}>Cancelar</button></div>
    </form>
    <div><span className="eyebrow">Así lo verá el cliente</span><TemplatePreview body={form.body} footer={form.footer} buttons={form.buttons} values={form.examples}/></div>
   </div>
  </section>}
 </>;
}

/** Sends an approved template: to a new number (new chat) or in an existing chat whose 24-hour window is closed. */
export function TemplateSendDialog({conversationId,phone,name,onClose,onSent}:{conversationId?:string;phone?:string;name?:string|null;onClose:()=>void;onSent:(conversationId:string)=>void}){
 const [list,setList]=useState<Template[]|null>(null);const [tid,setTid]=useState('');const [to,setTo]=useState(phone||'');const [who,setWho]=useState(name||'');const [values,setValues]=useState<Record<string,string>>({});const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();api<{templates:Template[]}>('/api/whatsapp/templates').then(r=>{const ok=r.templates.filter(t=>t.sendable);setList(ok);if(ok[0])setTid(ok[0].id);}).catch(e=>setError((e as Error).message));},[setError]);
 const t=list?.find(x=>x.id===tid);
 useEffect(()=>{if(t&&who&&t.variables.some(v=>v.key==='nombre'))setValues(v=>({...v,nombre:v.nombre||who.split(' ')[0]}));},[t,who]);
 return <dialog ref={dialog} className="tpl-dialog" onClose={onClose} aria-labelledby="tpl-dialog-title">
  <form method="dialog" onSubmit={e=>{e.preventDefault();if(!t)return;setBusy(true);setError('');
   post<{conversation_id:string;message:{status:string;error:string|null}}>(conversationId?`/api/whatsapp/conversations/${conversationId}/template`:'/api/whatsapp/chats',{template_id:t.id,values,consent,phone:to,name:who})
    .then(r=>{if(r.message.status==='failed')setError(r.message.error||'Meta no aceptó el mensaje.');onSent(r.conversation_id);dialog.current?.close();}).catch(err=>setError((err as Error).message)).finally(()=>setBusy(false));}}>
   <div className="tpl-dialog-head"><h2 id="tpl-dialog-title">{conversationId?'Enviar plantilla':'Nuevo chat'}</h2><button type="button" className="tpl-close" aria-label="Cerrar" onClick={()=>dialog.current?.close()}>×</button></div>
   {!list?<InlineLoading title="Cargando plantillas"/>:!list.length?<p className="store-warning">No tienes plantillas aprobadas. Créalas en <Link to="/panel/whatsapp/plantillas" onClick={()=>dialog.current?.close()}>Plantillas</Link>; Meta las revisa antes de poder usarlas.</p>:<>
    {!conversationId&&<div className="tpl-two"><label>Número de WhatsApp<input required inputMode="tel" value={to} onChange={e=>setTo(e.target.value)} placeholder="+57 300 123 4567"/></label><label>Nombre (opcional)<input value={who} maxLength={200} onChange={e=>setWho(e.target.value)}/></label></div>}
    <label>Plantilla<select value={tid} onChange={e=>{setTid(e.target.value);setValues({});}}>{list.map(x=><option key={x.id} value={x.id}>{x.name} · {x.category==='marketing'?'marketing':'utilidad'}</option>)}</select></label>
    {t&&t.variables.map(v=><label key={v.key}>{'{{'+v.key+'}}'}<input required maxLength={500} value={values[v.key]||''} onChange={e=>setValues({...values,[v.key]:e.target.value})} placeholder={v.example}/></label>)}
    {t&&<TemplatePreview body={t.body} footer={t.footer} buttons={t.buttons} values={values}/>}
    <label className="wa-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Este cliente me dio permiso para escribirle por WhatsApp</label>
    <p className="small muted">Meta cobra la conversación que inicias con una plantilla. Cuando el cliente responda podrás escribirle libremente durante 24 horas.</p>
    <div className="row"><button className="primary" disabled={busy||!consent||!t}>{busy?'Enviando…':'Enviar'}</button><button type="button" className="secondary" onClick={()=>dialog.current?.close()}>Cancelar</button></div>
   </>}
  </form>
 </dialog>;
}
