import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../api';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import {WhatsAppTabs} from './WhatsAppTabs';
import {TemplatePreview} from './WhatsAppTemplates';
import './agent.css';
import './templates.css';
import './confirmations.css';

type Settings={enabled:boolean;customer_first:boolean;wait_minutes:number;template_id:string|null;auto_dropi:boolean;messages:{confirmed:string;change:string}};
type Tpl={id:string;name:string;status:string;body:string;footer:string|null;buttons:string[];purpose:string;problem:string|null};
type Recent={id:string;order_id:string;status:string;origin:string;error:string|null;reply:string|null;conversation_id:string|null;sent_at:string|null;replied_at:string|null;created_at:string;customer:string;product:string;quantity:number};
type View={settings:Settings;built_in:Settings;connected:boolean;active:boolean;values:Record<string,string>;waits:number[];business_phone:string|null;summary:string;buttons:string[];templates:Tpl[];recent:Recent[];message?:string};
export const CONFIRM_STATUS:Record<string,[string,string]>={queued:['is-muted','Esperando al cliente'],sending:['is-muted','Enviando'],sent:['is-warn','Esperando respuesta'],failed:['is-bad','No se envió'],skipped:['is-muted','No enviada'],confirmed:['is-ok','Confirmado por el cliente'],change:['is-warn','Pidió cambios'],stale:['is-bad','Confirmó un resumen vencido']};
const EXAMPLE:Record<string,string>={nombre:'Laura',apellido:'Gómez',producto:'Picatodo eléctrico',variante:'Única',cantidad:'1',precio:'$59.900',envio:'$8.100',total:'$68.000',direccion:'Cra 7 # 19-40',ciudad:'Pereira',departamento:'Risaralda',pedido:'3F2A91C0',tienda:'Tu tienda'};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'';

/** Order confirmation by WhatsApp: template, automatic replies, optional automatic submission to Dropi, latest sends. */
export function WhatsAppConfirmationsPage(){
 const [view,setView]=useState<View|null>(null);const [draft,setDraft]=useState<Settings|null>(null);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 const load=(v:View)=>{setView(v);setDraft(v.settings);};
 useEffect(()=>{api<View>('/api/whatsapp/confirmations').then(load).catch(e=>setError((e as Error).message));},[]);
 if(!view||!draft)return <><WhatsAppTabs/><InlineLoading title="Cargando confirmaciones"/></>;
 if(!view.connected)return <><WhatsAppTabs/><p className="store-warning">Primero conecta tu número en <Link to="/panel/whatsapp/conexion">Conexión</Link>.</p></>;
 const set=(patch:Partial<Settings>)=>setDraft({...draft,...patch});
 const usable=view.templates.filter(t=>!t.problem);const chosen=view.templates.find(t=>t.id===draft.template_id);
 const dirty=JSON.stringify(draft)!==JSON.stringify(view.settings);
 async function save(){if(!draft)return;setBusy(true);setError('');try{const r=await api<View>('/api/whatsapp/confirmations',{method:'PUT',body:JSON.stringify(draft)});load(r);setNotice(r.message||'Ajustes guardados.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <>
  <WhatsAppTabs/>
  <p className="muted">Cuando llega un pedido de tus landings, el cliente recibe por WhatsApp el resumen con el precio de la landing y el envío cotizado con Dropi, y dos botones: «Confirmar pedido» y «Cambiar algo». La respuesta queda guardada en el pedido como evidencia.</p>
  <section className="panel webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="check"/></span><div><span className="eyebrow">Estado</span><h2>{view.active?'Las confirmaciones se están enviando':'Las confirmaciones están apagadas'}</h2></div><span className={'webhook-state '+(view.active?'on':'off')}>{view.active?'Activa':'Inactiva'}</span></div>
   <div className="wa-agent-form">
    <label className="wa-switch"><input type="checkbox" checked={draft.enabled} onChange={e=>set({enabled:e.target.checked})}/><span><strong>Enviar la confirmación por WhatsApp a cada pedido nuevo</strong><small>El formulario de tus landings mostrará «Te enviaremos la confirmación de tu pedido por WhatsApp».</small></span></label>
    <fieldset><legend>Cómo le llega el resumen</legend>
     <label className="wa-switch"><input type="checkbox" checked={draft.customer_first} onChange={e=>set({customer_first:e.target.checked})}/><span><strong>Primero invitar al cliente a escribirte</strong><small>Al enviar el formulario ve el botón «Confirmar por WhatsApp» con su código. Cuando te escribe, le respondes con botones sin plantilla y sin costo de plantilla.</small></span></label>
     {draft.customer_first&&!view.business_phone&&<p className="store-warning">Pulsa «Probar conexión» en <Link to="/panel/whatsapp/conexion">Conexión</Link> para que Tinbana conozca tu número y arme el enlace de WhatsApp.</p>}
     {draft.customer_first&&<label>Si el cliente no escribe, enviar la plantilla después de<select value={draft.wait_minutes} onChange={e=>set({wait_minutes:Number(e.target.value)})}>{view.waits.map(m=><option key={m} value={m}>{m<60?m+' minutos':m/60+(m===60?' hora':' horas')}</option>)}</select><span className="small muted">{draft.template_id?'Se envía la plantilla elegida abajo.':'Sin plantilla elegida, si el cliente no escribe no se le envía nada.'}</span></label>}
     {draft.customer_first&&(chosen?<p className="small muted">Cuando el cliente escribe recibe el mismo texto de la plantilla elegida abajo, con sus dos botones.</p>:<div className="wc-preview"><span className="eyebrow">Respuesta cuando el cliente escribe</span><TemplatePreview body={view.summary} footer="Pago contra entrega" buttons={view.buttons} values={EXAMPLE}/></div>)}
    </fieldset>
    <fieldset><legend>Plantilla {draft.customer_first?<span className="muted">(respaldo, opcional)</span>:null}</legend>
     {!view.templates.length?<p className="store-warning">Aún no tienes plantillas. Crea la sugerida «Confirmación de pedido» en <Link to="/panel/whatsapp/plantillas">Plantillas</Link> y espera la aprobación de Meta.</p>:<>
      <label>Plantilla de confirmación<select value={draft.template_id||''} onChange={e=>set({template_id:e.target.value||null})}><option value="">Elige una plantilla</option>{view.templates.map(t=><option key={t.id} value={t.id} disabled={!!t.problem}>{t.name}{t.problem?' · '+(t.status==='APPROVED'?'no sirve':'sin aprobar'):''}</option>)}</select></label>
      {!usable.length&&<p className="store-warning">Ninguna plantilla sirve todavía. Debe estar aprobada por Meta, tener dos botones (el primero confirma y el segundo pide cambios) y usar solo variables del pedido.</p>}
      {chosen?.problem&&<p className="store-warning">{chosen.problem}.</p>}
      {chosen&&<div className="wc-preview"><TemplatePreview body={chosen.body} footer={chosen.footer} buttons={chosen.buttons} values={EXAMPLE}/><p className="small muted">Ejemplo con datos ficticios. El primer botón confirma el pedido y el segundo pasa el chat a un asesor.</p></div>}
     </>}
     <details className="wc-vars"><summary>Variables que Tinbana llena con el pedido</summary><ul>{Object.entries(view.values).map(([k,l])=><li key={k}><code>{'{{'+k+'}}'}</code> {l}</li>)}</ul></details>
    </fieldset>
    <fieldset><legend>Respuestas automáticas</legend>
     <label>Cuando el cliente confirma<textarea rows={2} maxLength={500} value={draft.messages.confirmed} onChange={e=>set({messages:{...draft.messages,confirmed:e.target.value}})}/></label>
     <label>Cuando el cliente quiere cambiar algo<textarea rows={2} maxLength={500} value={draft.messages.change} onChange={e=>set({messages:{...draft.messages,change:e.target.value}})}/><span className="small muted">Después de este mensaje el chat pasa a un asesor y te llega un aviso.</span></label>
    </fieldset>
    <fieldset><legend>Después de confirmar</legend>
     <div className="wa-choices">
      <label className={'wa-choice'+(!draft.auto_dropi?' is-on':'')}><input type="radio" name="wc-after" checked={!draft.auto_dropi} onChange={()=>set({auto_dropi:false})}/><strong>Revisión manual (recomendado)</strong><small>El pedido queda confirmado en Tinbana y tú lo envías a Dropi desde su detalle.</small></label>
      <label className={'wa-choice'+(draft.auto_dropi?' is-on':'')}><input type="radio" name="wc-after" checked={draft.auto_dropi} onChange={()=>set({auto_dropi:true})}/><strong>Enviar a Dropi automáticamente</strong><small>Al confirmar, la orden llega a Dropi como «Pendiente de confirmación» y la confirmas allí.</small></label>
     </div>
     {draft.auto_dropi&&<p className="store-warning" role="note">Tinbana enviará la orden a Dropi sin que la revises antes. Si Dropi no responde, no se reintenta: el pedido queda «Envío por verificar» para que lo revises.</p>}
    </fieldset>
    <div className="row"><button className="primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?'Guardando…':'Guardar ajustes'}</button>{dirty&&<button className="secondary" disabled={busy} onClick={()=>setDraft(view.settings)}>Descartar cambios</button>}</div>
   </div>
  </section>
  <section className="panel webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="clock"/></span><div><span className="eyebrow">Últimos 20</span><h2>Confirmaciones enviadas</h2></div></div>
   {!view.recent.length?<p className="wa-empty">Todavía no hay confirmaciones. Llegarán con el próximo pedido de tus landings.</p>:<ul className="wc-list">{view.recent.map(r=><li key={r.id}>
    <div className="wc-main"><div className="wc-top"><strong>{r.customer||'Cliente'}</strong><span className={'wa-tag '+(CONFIRM_STATUS[r.status]?.[0]||'is-muted')}>{CONFIRM_STATUS[r.status]?.[1]||r.status}</span></div>
     <span className="small muted">{r.product} · {r.quantity} und. · {when(r.sent_at||r.created_at)}{r.origin==='manual'?' · enviada desde el pedido':''}</span>
     {r.error&&r.status!=='confirmed'&&<span className="small wc-error">{r.error}</span>}</div>
    <div className="wc-links"><Link className="secondary" to={'/panel/pedidos/'+r.order_id}>Pedido</Link>{r.conversation_id&&<Link className="secondary" to={'/panel/whatsapp/'+r.conversation_id}>Chat</Link>}</div>
   </li>)}</ul>}
  </section>
 </>;
}
