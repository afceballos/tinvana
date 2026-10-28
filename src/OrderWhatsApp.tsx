import {Link} from 'react-router-dom';
import {Icon} from './ui';

export type WhatsAppConfirmation={enabled:boolean;status:'queued'|'sending'|'sent'|'failed'|'skipped'|'confirmed'|'change'|'stale'|null;origin:string|null;error:string|null;reply:string|null;conversation_id:string|null;sent_at:string|null;replied_at:string|null;can_send:boolean;hint:string|null};
const labels:Record<string,[string,string]>={queued:['is-warn','Esperando al cliente'],sending:['is-muted','Enviando'],sent:['is-warn','Esperando respuesta'],failed:['is-bad','No se envió'],skipped:['is-muted','No enviada'],confirmed:['is-ok','Confirmado por el cliente'],change:['is-warn','Pidió cambios'],stale:['is-bad','Confirmó un resumen vencido']};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'';

/** WhatsApp confirmation of the order: what was sent, the customer's answer and sending the current summary. */
export function OrderWhatsApp({state,busy,onSend}:{state:WhatsAppConfirmation;busy:boolean;onSend:()=>void}){
 if(!state.status&&!state.enabled)return null;
 const label=state.status?labels[state.status]:null;
 return <section className="order-panel od-card"><header className="od-card-head"><span className="od-icon"><Icon name="whatsapp"/></span><h2>Confirmación por WhatsApp</h2>{label&&<span className={'od-chip '+(label[0]==='is-ok'?'is-ok':label[0]==='is-muted'?'':'is-warn')}>{label[1]}</span>}</header>
  {state.status==='sent'&&<p className="muted">Resumen enviado {when(state.sent_at)}. Cuando el cliente toque «Confirmar pedido», la aceptación se registra sola con el mensaje como evidencia.</p>}
  {state.status==='confirmed'&&<p className="muted">El cliente confirmó el resumen por WhatsApp {when(state.replied_at)}.</p>}
  {state.status==='change'&&<p className="muted">El cliente tocó «Cambiar algo» {when(state.replied_at)}. Revisa el chat, corrige el pedido y envía un nuevo resumen.</p>}
  {state.status==='stale'&&<p className="muted">El cliente confirmó un resumen que ya había cambiado o vencido. Cotiza de nuevo y envía otro resumen.</p>}
  {state.error&&['failed','skipped','stale'].includes(state.status||'')&&<p className="od-note">{state.error}</p>}
  {state.hint&&<p className="od-note">{state.hint}{!state.enabled&&<> <Link className="od-link" to="/panel/whatsapp/confirmaciones">Configurar</Link></>}</p>}
  <div className="row">{state.can_send&&<button className="primary" disabled={busy} onClick={onSend}>{busy?'Enviando…':state.status==='queued'?'Enviar el resumen ahora':state.status?'Enviar nuevo resumen':'Enviar resumen por WhatsApp'}</button>}{state.conversation_id&&<Link className="secondary" to={'/panel/whatsapp/'+state.conversation_id}>Abrir chat</Link>}</div>
 </section>;
}
