import {useEffect,useState} from 'react';
import {api,post} from '../api';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import {WhatsAppTabs} from './WhatsAppTabs';

type Account={id:string;phone_number_id:string;waba_id:string;display_phone:string|null;verified_name:string|null;quality_rating:string|null;status:'pending'|'connected'|'error';last_error:string|null;last_tested_at:string|null;source:string;token_configured:boolean;own_app:boolean;verify_token:string|null};
type Platform={webhook_url:string;verify_token_configured:boolean;app_secret_configured:boolean;graph_version:string};
type Subscription={checked:boolean;apps:string[];error:string|null;subscribed:boolean;subscribe_error:string|null};
type Diagnostics={last_event_at:string|null;pending:number;failed:number;last_failure:string|null;signature_rejected_at:string|null;waba_mismatch:{count:number;at:string;received_waba_id:string}|null};
type View={account:Account|null;platform:Platform;diagnostics:Diagnostics|null};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'Nunca';
const quality:Record<string,string>={GREEN:'Alta',YELLOW:'Media',RED:'Baja',UNKNOWN:'Sin calificar'};
const states:Record<Account['status'],[string,string]>={connected:['on','Conectado'],pending:['off','Sin probar'],error:['off','Con error']};

// Same card system as «Integraciones Dropi» and «Conexión GHL» (webhook-current, webhook-head, webhook-state).
export function WhatsAppConnection(){
 const [view,setView]=useState<View|null>(null);const [sub,setSub]=useState<Subscription|null>(null);const [busy,setBusy]=useState(false);const [editing,setEditing]=useState(false);const [confirmDelete,setConfirmDelete]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{api<View>('/api/whatsapp/account').then(setView).catch(e=>setError((e as Error).message));},[]);
 const copy=(text:string,label:string)=>{void navigator.clipboard?.writeText(text).then(()=>setNotice(label+' copiado.'),()=>setError('No se pudo copiar. Selecciónalo y cópialo a mano.'));};
 async function run(task:()=>Promise<void>){setBusy(true);setError('');try{await task();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!view)return <><WhatsAppTabs/><InlineLoading title="Cargando la conexión"/></>;
 const a=view.account,p=view.platform;const showForm=!a||editing;
 return <>
  <WhatsAppTabs/>
  <p className="muted">Cada tienda conecta su propio número de WhatsApp Business. Los mensajes llegan directo a Tinbana por la API oficial de Meta; el token se guarda cifrado en el servidor y nunca se muestra.</p>
  {a&&<section className="panel narrow webhook-current wa-account">
   <div className="webhook-head"><span className="webhook-logo wa-logo" aria-hidden="true"><Icon name="whatsapp"/></span><div><span className="eyebrow">WhatsApp Business</span><h2>{a.display_phone||'Número sin verificar'}{a.verified_name?' · '+a.verified_name:''}</h2></div><span className={'webhook-state '+states[a.status][0]}>{states[a.status][1]}</span></div>
   <dl className="wa-facts">
    <div><dt>Phone Number ID</dt><dd><code>{a.phone_number_id}</code></dd></div>
    <div><dt>WhatsApp Business Account ID</dt><dd><code>{a.waba_id}</code></dd></div>
    <div><dt>Calidad del número</dt><dd>{a.quality_rating?quality[a.quality_rating]||a.quality_rating:'Prueba la conexión para verla'}</dd></div>
    <div><dt>Última prueba</dt><dd>{when(a.last_tested_at)}</dd></div>
   </dl>
   <div className="webhook-url"><Icon name="lock"/><code>Token de acceso permanente · cifrado</code></div>
   {a.status==='error'&&a.last_error&&<p className="store-warning" role="note">{a.last_error}</p>}
   {view.diagnostics&&<Diagnosis d={view.diagnostics} ownApp={a.own_app} waba={a.waba_id}/>}
   <div className="wa-diagnosis wa-subscription">
    <h3>Suscripción de la app a esta cuenta</h3>
    {sub===null?<p className="small muted">Al pulsar «Probar conexión», Tinbana suscribe tu app de Meta a los mensajes de esta cuenta de WhatsApp. Sin esa suscripción, Meta no envía a Tinbana los mensajes reales (la prueba del panel de Meta sí llega).</p>
     :<>
      {sub.subscribed&&<p className="wa-sub-ok"><Icon name="check"/>Tu app quedó suscrita a los mensajes de esta cuenta. Se confirma cada vez que pruebas la conexión.</p>}
      {sub.subscribe_error&&<p className="store-warning" role="alert">No se pudo suscribir tu app: {sub.subscribe_error} Revisa que el token tenga el permiso <code>whatsapp_business_management</code> y vuelve a intentarlo.</p>}
      {!sub.checked?<p className="store-warning" role="note">No se pudo leer la lista de apps suscritas: {sub.error}</p>
       :sub.apps.length?<p className="small muted">Apps suscritas: {sub.apps.join(', ')}</p>
       :!sub.subscribed&&<p className="store-warning" role="alert">Ninguna app está suscrita a esta cuenta de WhatsApp, por eso los mensajes de tus clientes no llegan a Tinbana.</p>}
      {!sub.subscribed&&sub.apps.some(n=>/WA DevX|Webhook Events 1P/i.test(n))&&<p className="store-warning" role="alert">«{sub.apps.find(n=>/WA DevX|Webhook Events 1P/i.test(n))}» es una app interna de Meta para las pruebas del panel, no la tuya. Pulsa «Suscribir mi app» para que los mensajes reales lleguen a Tinbana.</p>}
      <div className="row"><button type="button" className={sub.subscribed?'secondary':'primary'} disabled={busy} onClick={()=>void run(async()=>{const r=await post<View&{message:string;subscription:Subscription}>('/api/whatsapp/account/subscribe');setView(r);setSub(r.subscription);setNotice(r.message);})}>{busy?'Suscribiendo…':sub.subscribed?'Volver a suscribir':'Suscribir mi app'}</button></div>
     </>}
   </div>
   {a.status==='pending'&&<p className="small muted">Prueba la conexión para confirmar que Meta reconoce el número y el token.</p>}
   {!editing&&<div className="row"><button className="primary" disabled={busy} onClick={()=>void run(async()=>{const r=await post<View&{message:string;subscription:Subscription}>('/api/whatsapp/account/test');setView(r);setSub(r.subscription);setNotice(r.message);})}>{busy?'Probando…':'Probar conexión'}</button><button className="secondary" disabled={busy} onClick={()=>setEditing(true)}>Reemplazar credenciales</button><button className="secondary danger" disabled={busy} onClick={()=>setConfirmDelete(true)}>Eliminar número</button></div>}
   {confirmDelete&&<div className="wa-confirm" role="alertdialog" aria-labelledby="wa-delete-title"><strong id="wa-delete-title">¿Eliminar este número de Tinbana?</strong><p className="small">Se borran también sus conversaciones y mensajes guardados en Tinbana. En Meta el número sigue existiendo.</p><div className="row"><button className="primary danger-fill" disabled={busy} onClick={()=>void run(async()=>{const r=await api<View>('/api/whatsapp/account',{method:'DELETE'});setView(r);setConfirmDelete(false);setNotice('Número eliminado de Tinbana.');})}>Sí, eliminar</button><button className="secondary" disabled={busy} onClick={()=>setConfirmDelete(false)}>Cancelar</button></div></div>}
  </section>}
  {showForm&&<form className="panel narrow editor-form wa-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{const r=await api<View>('/api/whatsapp/account',{method:'PUT',body:JSON.stringify({phone_number_id:f.get('phone_number_id'),waba_id:f.get('waba_id'),token:f.get('token'),app_secret:f.get('app_secret'),...(f.get('drop_own_app')?{own_app:false}:{})})});setView(r);setEditing(false);setNotice('Credenciales guardadas. Prueba la conexión para verificarlas.');});}}>
   <h3>{a?'Reemplazar credenciales':'Conectar tu número'}</h3>
   <p className="small muted">Los encuentras en Meta, en <strong>WhatsApp → Configuración de la API</strong> de tu app. El token debe ser el permanente de un usuario del sistema, con los permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.</p>
   <label>Phone Number ID<input name="phone_number_id" required inputMode="numeric" pattern="[0-9]{5,32}" defaultValue={a?.phone_number_id} placeholder="Ej. 106540352242922"/></label>
   <label>WhatsApp Business Account ID<input name="waba_id" required inputMode="numeric" pattern="[0-9]{5,32}" defaultValue={a?.waba_id} placeholder="Ej. 102290129340398"/></label>
   <label>Token de acceso permanente<input name="token" type="password" required={!a} autoComplete="new-password" maxLength={4096} placeholder={a?'Déjalo vacío para conservar el actual':'Pega el token'}/><span className="small muted">Se guarda cifrado y no vuelve a mostrarse.</span></label>
   <label>Clave secreta de tu app de Meta <span className="muted">(opcional)</span><input name="app_secret" type="password" autoComplete="new-password" maxLength={128} placeholder={a?.own_app?'Déjala vacía para conservar la actual':'Solo si el número está en tu propia app de Meta'}/><span className="small muted">Llénala si el número está en tu propia app de developers.facebook.com: la encuentras en <strong>Configuración de la app → Básica</strong>. Así Tinbana reconoce los mensajes que envía tu app. Se guarda cifrada y no vuelve a mostrarse.</span></label>
   {a?.own_app&&<label className="wa-check"><input type="checkbox" name="drop_own_app"/>Dejar de usar mi propia app de Meta (borra la clave guardada)</label>}
   <div className="row"><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar credenciales'}</button>{a&&<button className="secondary" type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</button>}</div>
  </form>}
  {a?.own_app&&a.verify_token?<section className="panel narrow webhook-current wa-own-app">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="send"/></span><div><span className="eyebrow">Configuración en tu app de Meta</span><h2>Webhook de tu app</h2></div><span className="webhook-state on">Clave de tu app guardada</span></div>
   <p className="small muted">En tu app de Meta, en <strong>Conectar en WhatsApp → Paso 2: Configuración de producción → Webhook</strong>, pega esta URL y este token de verificación, pulsa «Verificar y guardar» y suscríbete al campo <code>messages</code>.</p>
   <div className="webhook-url"><Icon name="link"/><code>{p.webhook_url}</code><button type="button" className="secondary wa-copy" onClick={()=>copy(p.webhook_url,'URL del webhook')}>Copiar</button></div>
   <div className="webhook-url"><Icon name="lock"/><code className="wa-token">{a.verify_token}</code><button type="button" className="secondary wa-copy" onClick={()=>copy(a.verify_token!,'Token de verificación')}>Copiar</button></div>
   <p className="small muted">Este token es solo de tu cuenta. Los mensajes firmados por tu app se aceptan únicamente para tu número.</p>
  </section>
  :<section className="panel narrow webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="send"/></span><div><span className="eyebrow">Configuración en Meta</span><h2>Webhook de Tinbana</h2></div><span className={'webhook-state '+(p.verify_token_configured&&p.app_secret_configured?'on':'off')}>{p.verify_token_configured&&p.app_secret_configured?'Listo en el servidor':'Falta configurar el servidor'}</span></div>
   <p className="small muted">Si tu número está en la app de Meta de la plataforma, el webhook ya está configurado con esta URL. Si usas tu propia app de Meta, guarda arriba su clave secreta y aquí verás el token de verificación de tu cuenta.</p>
   <div className="webhook-url"><Icon name="link"/><code>{p.webhook_url}</code><button type="button" className="secondary wa-copy" onClick={()=>copy(p.webhook_url,'URL del webhook')}>Copiar</button></div>
   <ul className="wa-checks"><li className={p.verify_token_configured?'is-ok':''}><Icon name={p.verify_token_configured?'check':'close'}/>Token de verificación de la plataforma {p.verify_token_configured?'configurado':'pendiente en el servidor'}</li><li className={p.app_secret_configured?'is-ok':''}><Icon name={p.app_secret_configured?'check':'close'}/>Secreto de la app de la plataforma {p.app_secret_configured?'configurado':'pendiente en el servidor'}</li><li className="is-ok"><Icon name="check"/>Graph API {p.graph_version}</li></ul>
  </section>}
  <section className="panel narrow webhook-current wa-soon">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="users"/></span><div><span className="eyebrow">Registro guiado</span><h2>Conectar con Meta</h2></div><span className="webhook-state off">Próximamente</span></div>
   <p className="small muted">Pronto podrás conectar el número iniciando sesión con Facebook, sin copiar identificadores ni tokens.</p>
   <button className="primary" type="button" disabled aria-disabled="true">Conectar con Meta · Próximamente</button>
  </section>
 </>;
}

// Explains an empty inbox: what reached this store from Meta and whether Tinbana refused signed deliveries.
function Diagnosis({d,ownApp,waba}:{d:Diagnostics;ownApp:boolean;waba:string}){
 const rejectedLater=d.signature_rejected_at!==null&&(d.last_event_at===null||new Date(d.signature_rejected_at)>new Date(d.last_event_at));
 return <div className="wa-diagnosis">
  <h3>Mensajes recibidos de Meta</h3>
  <dl className="wa-facts">
   <div><dt>Último mensaje o estado recibido</dt><dd>{d.last_event_at?when(d.last_event_at):'Ninguno todavía'}</dd></div>
   <div><dt>Por procesar</dt><dd>{d.pending}{d.pending>0&&<span className="small muted"> · se procesan en menos de un minuto</span>}</dd></div>
   {d.failed>0&&<div><dt>Con error al procesar</dt><dd>{d.failed}{d.last_failure&&<span className="small muted"> · {d.last_failure}</span>}</dd></div>}
  </dl>
  {rejectedLater&&<p className="store-warning" role="alert">Tinbana rechazó una entrega de Meta por firma inválida el {when(d.signature_rejected_at)}. {ownApp?'Revisa que la clave secreta de tu app guardada aquí sea exactamente la de Meta (Configuración de la app → Básica).':'El administrador debe revisar que WHATSAPP_APP_SECRET en el servidor sea exactamente la clave secreta de la app de Meta, sin espacios.'}</p>}
  {d.waba_mismatch&&<p className="store-warning" role="alert">Meta envió {d.waba_mismatch.count===1?'1 mensaje':d.waba_mismatch.count+' mensajes'} a tu número con la cuenta de WhatsApp <code>{d.waba_mismatch.received_waba_id}</code> (el último el {when(d.waba_mismatch.at)}), pero aquí guardaste <code>{waba}</code>. Por seguridad Tinbana los descartó. Pulsa «Reemplazar credenciales» y escribe <code>{d.waba_mismatch.received_waba_id}</code> en WhatsApp Business Account ID.</p>}
  {!d.last_event_at&&!rejectedLater&&!d.waba_mismatch&&<p className="small muted">Si escribiste al número y aquí no aparece nada, Meta no está enviando los mensajes a Tinbana: revisa en tu app de Meta que el webhook esté verificado y suscrito al campo <code>messages</code>.</p>}
 </div>;
}
