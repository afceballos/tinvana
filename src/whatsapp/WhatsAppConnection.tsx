import {useEffect,useState} from 'react';
import {api,post} from '../api';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import {WhatsAppTabs} from './WhatsAppTabs';

type Account={id:string;phone_number_id:string;waba_id:string;display_phone:string|null;verified_name:string|null;quality_rating:string|null;status:'pending'|'connected'|'error';last_error:string|null;last_tested_at:string|null;source:string;token_configured:boolean};
type Platform={webhook_url:string;verify_token_configured:boolean;app_secret_configured:boolean;graph_version:string};
type View={account:Account|null;platform:Platform};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'Nunca';
const quality:Record<string,string>={GREEN:'Alta',YELLOW:'Media',RED:'Baja',UNKNOWN:'Sin calificar'};
const states:Record<Account['status'],[string,string]>={connected:['on','Conectado'],pending:['off','Sin probar'],error:['off','Con error']};

// Same card system as «Integraciones Dropi» and «Conexión GHL» (webhook-current, webhook-head, webhook-state).
export function WhatsAppConnection(){
 const [view,setView]=useState<View|null>(null);const [busy,setBusy]=useState(false);const [editing,setEditing]=useState(false);const [confirmDelete,setConfirmDelete]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{api<View>('/api/whatsapp/account').then(setView).catch(e=>setError((e as Error).message));},[]);
 async function run(task:()=>Promise<void>){setBusy(true);setError('');try{await task();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!view)return <><WhatsAppTabs/><InlineLoading title="Cargando la conexión"/></>;
 const a=view.account,p=view.platform;const showForm=!a||editing;
 return <>
  <WhatsAppTabs/>
  <p className="muted">Cada tienda conecta su propio número de WhatsApp Business. Los mensajes llegan directo a Tinvana por la API oficial de Meta; el token se guarda cifrado en el servidor y nunca se muestra.</p>
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
   {a.status==='pending'&&<p className="small muted">Prueba la conexión para confirmar que Meta reconoce el número y el token.</p>}
   {!editing&&<div className="row"><button className="primary" disabled={busy} onClick={()=>void run(async()=>{const r=await post<View&{message:string}>('/api/whatsapp/account/test');setView(r);setNotice(r.message);})}>{busy?'Probando…':'Probar conexión'}</button><button className="secondary" disabled={busy} onClick={()=>setEditing(true)}>Reemplazar credenciales</button><button className="secondary danger" disabled={busy} onClick={()=>setConfirmDelete(true)}>Eliminar número</button></div>}
   {confirmDelete&&<div className="wa-confirm" role="alertdialog" aria-labelledby="wa-delete-title"><strong id="wa-delete-title">¿Eliminar este número de Tinvana?</strong><p className="small">Se borran también sus conversaciones y mensajes guardados en Tinvana. En Meta el número sigue existiendo.</p><div className="row"><button className="primary danger-fill" disabled={busy} onClick={()=>void run(async()=>{const r=await api<View>('/api/whatsapp/account',{method:'DELETE'});setView(r);setConfirmDelete(false);setNotice('Número eliminado de Tinvana.');})}>Sí, eliminar</button><button className="secondary" disabled={busy} onClick={()=>setConfirmDelete(false)}>Cancelar</button></div></div>}
  </section>}
  {showForm&&<form className="panel narrow editor-form wa-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{const r=await api<View>('/api/whatsapp/account',{method:'PUT',body:JSON.stringify({phone_number_id:f.get('phone_number_id'),waba_id:f.get('waba_id'),token:f.get('token')})});setView(r);setEditing(false);setNotice('Credenciales guardadas. Prueba la conexión para verificarlas.');});}}>
   <h3>{a?'Reemplazar credenciales':'Conectar tu número'}</h3>
   <p className="small muted">Los encuentras en Meta, en <strong>WhatsApp → Configuración de la API</strong> de tu app. El token debe ser el permanente de un usuario del sistema, con los permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.</p>
   <label>Phone Number ID<input name="phone_number_id" required inputMode="numeric" pattern="[0-9]{5,32}" defaultValue={a?.phone_number_id} placeholder="Ej. 106540352242922"/></label>
   <label>WhatsApp Business Account ID<input name="waba_id" required inputMode="numeric" pattern="[0-9]{5,32}" defaultValue={a?.waba_id} placeholder="Ej. 102290129340398"/></label>
   <label>Token de acceso permanente<input name="token" type="password" required={!a} autoComplete="new-password" maxLength={4096} placeholder={a?'Déjalo vacío para conservar el actual':'Pega el token'}/><span className="small muted">Se guarda cifrado y no vuelve a mostrarse.</span></label>
   <div className="row"><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar credenciales'}</button>{a&&<button className="secondary" type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</button>}</div>
  </form>}
  <section className="panel narrow webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="send"/></span><div><span className="eyebrow">Configuración en Meta</span><h2>Webhook de Tinvana</h2></div><span className={'webhook-state '+(p.verify_token_configured&&p.app_secret_configured?'on':'off')}>{p.verify_token_configured&&p.app_secret_configured?'Listo en el servidor':'Falta configurar el servidor'}</span></div>
   <p className="small muted">En tu app de Meta, en <strong>WhatsApp → Configuración → Webhook</strong>, pega esta URL y el token de verificación de la plataforma, y suscríbete al campo <code>messages</code>.</p>
   <div className="webhook-url"><Icon name="link"/><code>{p.webhook_url}</code><button type="button" className="secondary wa-copy" onClick={()=>{void navigator.clipboard?.writeText(p.webhook_url).then(()=>setNotice('URL del webhook copiada.'),()=>setError('No se pudo copiar. Selecciónala y cópiala a mano.'));}}>Copiar</button></div>
   <ul className="wa-checks"><li className={p.verify_token_configured?'is-ok':''}><Icon name={p.verify_token_configured?'check':'close'}/>Token de verificación {p.verify_token_configured?'configurado':'pendiente en el servidor'}</li><li className={p.app_secret_configured?'is-ok':''}><Icon name={p.app_secret_configured?'check':'close'}/>Secreto de la app para validar firmas {p.app_secret_configured?'configurado':'pendiente en el servidor'}</li><li className="is-ok"><Icon name="check"/>Graph API {p.graph_version}</li></ul>
  </section>
  <section className="panel narrow webhook-current wa-soon">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="users"/></span><div><span className="eyebrow">Registro guiado</span><h2>Conectar con Meta</h2></div><span className="webhook-state off">Próximamente</span></div>
   <p className="small muted">Pronto podrás conectar el número iniciando sesión con Facebook, sin copiar identificadores ni tokens.</p>
   <button className="primary" type="button" disabled aria-disabled="true">Conectar con Meta · Próximamente</button>
  </section>
 </>;
}
