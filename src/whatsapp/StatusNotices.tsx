import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../api';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import {TemplatePreview} from './WhatsAppTemplates';

type State='guide_generated'|'in_transit'|'novelty'|'delivered';
type Kind='unconfirmed'|'abandoned';
type Settings={whatsapp:Record<State,boolean>;template_id:string|null;reminders:Record<Kind,boolean>};
type Reminder={id:string;kind:Kind;status:string;channel:string|null;error:string|null;order_id:string|null;conversation_id:string|null;created_at:string;order_number:string|null;who:string|null};
type Tpl={id:string;name:string;status:string;body:string;purpose:string;problem:string|null};
type Recent={id:string;order_id:string;order_number:string|null;customer:string;state:State;status:string;channel:string|null;error:string|null;conversation_id:string|null;created_at:string;sent_at:string|null};
type View={settings:Settings;states:Record<State,string>;reminder_kinds:Record<Kind,string>;reminders:Reminder[];values:Record<string,string>;connected:boolean;template_ready:boolean;templates:Tpl[];recent:Recent[];message?:string};
const HINT:Record<State,string>={guide_generated:'Con el número de guía y la transportadora.',in_transit:'Con el enlace para consultar el pedido.',novelty:'Además el chat pasa a un asesor y te llega un aviso.',delivered:'Con un agradecimiento por la compra.'};
const RHINT:Record<Kind,string>={unconfirmed:'3 horas después del resumen sin respuesta. Dentro de las 24 horas se le muestra de nuevo; si no, se reenvía la plantilla de confirmación. Si 24 horas después tampoco responde, te avisamos.',abandoned:'Si dio datos de compra a la IA y dejó de responder hace 2 horas, un mensaje para retomar (sin plantilla ni costo).'};
const RSTATUS:Record<string,[string,string]>={sent:['is-warn','Esperando respuesta'],answered:['is-ok','Respondió'],no_answer:['is-bad','Sin respuesta'],skipped:['is-muted','No enviado'],failed:['is-bad','Falló']};
const STATUS:Record<string,[string,string]>={queued:['is-muted','En cola'],sending:['is-muted','Enviando'],sent:['is-ok','Enviado'],skipped:['is-muted','No enviado'],failed:['is-bad','Falló']};
const EXAMPLE={nombre:'Laura',pedido:'TB-7KQ2-MX9P',estado:'va en camino con Servientrega (guía 240012345678)',guia:'240012345678',transportadora:'Servientrega',seguimiento:'https://tutienda.tinbana.com/pedido',producto:'Picatodo eléctrico',tienda:'Tu tienda'};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'';

/** Stage 6A: WhatsApp notices of the Dropi order status. The email ones are switched in «Correos de pedidos». */
export function StatusNotices(){
 const [view,setView]=useState<View|null>(null);const [draft,setDraft]=useState<Settings|null>(null);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 const load=(v:View)=>{setView(v);setDraft(v.settings);};
 useEffect(()=>{api<View>('/api/whatsapp/notices').then(load).catch(e=>setError((e as Error).message));},[]);
 if(!view||!draft)return <InlineLoading title="Cargando avisos"/>;
 const chosen=view.templates.find(t=>t.id===draft.template_id);const usable=view.templates.filter(t=>!t.problem);
 const dirty=JSON.stringify(draft)!==JSON.stringify(view.settings);const on=Object.values(draft.whatsapp).filter(Boolean).length;
 async function save(){setBusy(true);setError('');try{const r=await api<View>('/api/whatsapp/notices',{method:'PUT',body:JSON.stringify(draft)});load(r);setNotice(r.message||'Avisos guardados.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <>
  <section className="panel webhook-current wn-card">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="truck"/></span><div><span className="eyebrow">Seguimiento de Dropi</span><h2>Avisos de estado del pedido</h2></div><span className={'webhook-state '+(on?'on':'off')}>{on?on+' de 4 activos':'Apagados'}</span></div>
   <p className="muted">Cuando cambia el estado de un pedido en Dropi, el cliente recibe un WhatsApp. También le llega un correo, que puedes activar o desactivar en <Link to="/panel/correos">Correos de pedidos</Link>.</p>
   <div className="wa-agent-form">
    <div className="wn-states">{(Object.keys(view.states) as State[]).map(k=><label key={k} className="wa-switch"><input type="checkbox" checked={draft.whatsapp[k]} onChange={e=>setDraft({...draft,whatsapp:{...draft.whatsapp,[k]:e.target.checked}})}/><span><strong>{view.states[k]}</strong><small>{HINT[k]}</small></span></label>)}</div>
    <fieldset><legend>Plantilla para cuando el cliente no ha escrito en 24 horas</legend>
     <p className="small muted">Si el cliente te escribió en las últimas 24 horas, el aviso va como mensaje normal. Si no, WhatsApp exige una plantilla aprobada (Meta la cobra por conversación). Sin plantilla, ese aviso solo le llega por correo.</p>
     {!view.templates.length?<p className="store-warning">Crea la sugerida «Aviso de estado del pedido» en <Link to="/panel/whatsapp/plantillas">Plantillas</Link> y espera la aprobación de Meta.</p>:<>
      <label>Plantilla de avisos<select value={draft.template_id||''} onChange={e=>setDraft({...draft,template_id:e.target.value||null})}><option value="">Sin plantilla (solo dentro de las 24 horas)</option>{view.templates.map(t=><option key={t.id} value={t.id} disabled={!!t.problem}>{t.name}{t.problem?' · '+(t.status==='APPROVED'?'no sirve':'sin aprobar'):''}</option>)}</select></label>
      {!usable.length&&<p className="store-warning">Ninguna plantilla sirve todavía: debe estar aprobada, sin botones y con variables de los avisos. Crea la sugerida en <Link to="/panel/whatsapp/plantillas">Plantillas</Link>.</p>}
      {chosen&&<div className="wc-preview"><TemplatePreview body={chosen.body} footer={null} buttons={[]} values={EXAMPLE}/><p className="small muted">Ejemplo con datos ficticios.</p></div>}
     </>}
     <details className="wc-vars"><summary>Variables que Tinbana llena en un aviso</summary><ul>{Object.entries(view.values).map(([k,l])=><li key={k}><code>{'{{'+k+'}}'}</code> {l}</li>)}</ul></details>
    </fieldset>
    <div className="row"><button className="primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?'Guardando…':'Guardar avisos'}</button>{dirty&&<button className="secondary" disabled={busy} onClick={()=>setDraft(view.settings)}>Descartar cambios</button>}</div>
   </div>
  </section>
  <section className="panel webhook-current wn-card">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="bell"/></span><div><span className="eyebrow">Uno solo por pedido o compra</span><h2>Recordatorios</h2></div></div>
   <p className="muted">Se envían en tu horario de atención (Agente IA), nunca a quien se dio de baja ni cuando un asesor tiene el chat.</p>
   <div className="wa-agent-form">
    <div className="wn-states">{(Object.keys(view.reminder_kinds) as Kind[]).map(k=><label key={k} className="wa-switch"><input type="checkbox" checked={draft.reminders[k]} onChange={e=>setDraft({...draft,reminders:{...draft.reminders,[k]:e.target.checked}})}/><span><strong>{view.reminder_kinds[k]}</strong><small>{RHINT[k]}</small></span></label>)}</div>
    <div className="row"><button className="primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?'Guardando…':'Guardar recordatorios'}</button></div>
   </div>
   {view.reminders.length>0&&<ul className="wc-list">{view.reminders.map(r=><li key={r.id}>
    <div className="wc-main"><div className="wc-top"><strong>{r.who||'Cliente'}</strong><span className={'wa-tag '+(RSTATUS[r.status]?.[0]||'is-muted')}>{RSTATUS[r.status]?.[1]||r.status}</span></div>
     <span className="small muted">{view.reminder_kinds[r.kind]}{r.order_number?' · '+r.order_number:''} · {when(r.created_at)}{r.channel==='template'?' · con plantilla':''}</span>
     {r.error&&<span className="small wc-error">{r.error}</span>}</div>
    <div className="wc-links">{r.order_id&&<Link className="secondary" to={'/panel/pedidos/'+r.order_id}>Pedido</Link>}{r.conversation_id&&<Link className="secondary" to={'/panel/whatsapp/'+r.conversation_id}>Chat</Link>}</div>
   </li>)}</ul>}
  </section>
  {view.recent.length>0&&<section className="panel webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="clock"/></span><div><span className="eyebrow">Últimos 20</span><h2>Avisos por WhatsApp</h2></div></div>
   <ul className="wc-list">{view.recent.map(r=><li key={r.id}>
    <div className="wc-main"><div className="wc-top"><strong>{r.customer||'Cliente'}</strong><span className={'wa-tag '+(STATUS[r.status]?.[0]||'is-muted')}>{STATUS[r.status]?.[1]||r.status}</span></div>
     <span className="small muted">{view.states[r.state]} · {r.order_number||'Pedido'} · {when(r.sent_at||r.created_at)}{r.channel==='template'?' · con plantilla':''}</span>
     {r.error&&<span className="small wc-error">{r.error}</span>}</div>
    <div className="wc-links"><Link className="secondary" to={'/panel/pedidos/'+r.order_id}>Pedido</Link>{r.conversation_id&&<Link className="secondary" to={'/panel/whatsapp/'+r.conversation_id}>Chat</Link>}</div>
   </li>)}</ul>
  </section>}
 </>;
}
