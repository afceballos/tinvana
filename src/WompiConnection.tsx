import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {api,post} from './api';
import {useFeedbackState} from './Notifications';
import {InlineLoading} from './Loading';
import {Icon} from './ui';
import './whatsapp/whatsapp.css';
import './wompi.css';

// «Integraciones → Wompi»: the store's own Wompi account. Same card system as the WhatsApp and GHL connections.
type Account={environment:'test'|'prod';public_key:string;merchant_name:string|null;payment_methods:string[];status:'pending'|'connected'|'error';last_error:string|null;last_tested_at:string|null;last_event_at:string|null;last_rejected_at:string|null;integrity_checked_at:string|null;events_url:string;auto_dropi:boolean;dropi_orders:boolean};
type WompiEvent={type:string;transaction_id:string|null;reference:string|null;status:string|null;amount:number|null;payment_method:string|null;received_at:string};
type View={account:Account|null;events:WompiEvent[];message?:string};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'Nunca';
const money=(v:number|null)=>v===null?'—':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v);
const states:Record<Account['status'],[string,string]>={connected:['on','Conectado'],pending:['off','Sin probar'],error:['off','Con error']};
const results:Record<string,string>={APPROVED:'Aprobado',DECLINED:'Rechazado',VOIDED:'Anulado',ERROR:'Error',PENDING:'Pendiente'};
const methods:Record<string,string>={CARD:'Tarjeta',PSE:'PSE',NEQUI:'Nequi',DAVIPLATA:'Daviplata',BANCOLOMBIA_TRANSFER:'Botón Bancolombia',BANCOLOMBIA_COLLECT:'Corresponsal Bancolombia',BANCOLOMBIA_QR:'QR Bancolombia',BANCOLOMBIA_BNPL:'Compra ahora, paga después',BANCOLOMBIA:'Bancolombia',SU_PLUS:'SU+ Pay',CARD_POS:'Datáfono'};
const envName=(e:Account['environment'])=>e==='test'?'Pruebas (sandbox)':'Producción';

export function WompiConnection(){
 const [view,setView]=useState<View|null>(null);const [busy,setBusy]=useState(false);const [editing,setEditing]=useState(false);const [confirmDelete,setConfirmDelete]=useState(false);const [guide,setGuide]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');const [params]=useSearchParams();
 const load=()=>api<View>('/api/wompi/account').then(setView).catch(e=>setError((e as Error).message));
 useEffect(()=>{void load();},[]);
 const copy=(text:string,label:string)=>{void navigator.clipboard?.writeText(text).then(()=>setNotice(label+' copiada.'),()=>setError('No se pudo copiar. Selecciónala y cópiala a mano.'));};
 async function run(task:()=>Promise<void>){setBusy(true);setError('');try{await task();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const apply=(r:View,ok:boolean)=>{setView(r);if(r.message)(ok&&r.account?.status==='connected'?setNotice:setError)(r.message);};
 if(!view)return <InlineLoading title="Cargando la conexión con Wompi"/>;
 const a=view.account,showForm=!a||editing;
 return <>
  <p className="muted">Conecta tu propia cuenta de Wompi para cobrar en línea: tarjeta, PSE, Nequi y más. El dinero llega directo a tu cuenta de Wompi; Tinbana guarda tus llaves cifradas y nunca las muestra.</p>
  {params.get('pago')==='prueba'&&a&&<p className="wompi-return" role="status"><Icon name="clock"/><span>Volviste del pago de prueba. Wompi avisa el resultado en segundos; pulsa «Actualizar» para verlo abajo. La página de regreso no confirma el pago: solo cuenta el aviso firmado de Wompi.</span></p>}
  {a&&<section className="panel narrow webhook-current wa-account">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="card"/></span><div><span className="eyebrow">Wompi · {envName(a.environment)}</span><h2>{a.merchant_name||'Cuenta de Wompi'}</h2></div><span className={'webhook-state '+states[a.status][0]}>{states[a.status][1]}</span></div>
   {a.environment==='test'&&<p className="wompi-env" role="note"><Icon name="lock"/><span>Estás con las llaves de <strong>pruebas</strong>: los pagos no mueven dinero real. Cuando todo funcione, reemplázalas por las de producción.</span></p>}
   <dl className="wa-facts">
    <div><dt>Llave pública</dt><dd><code>{a.public_key}</code></dd></div>
    <div><dt>Última prueba</dt><dd>{when(a.last_tested_at)}</dd></div>
    <div className="wompi-wide"><dt>Medios de pago activos en tu cuenta</dt><dd>{a.payment_methods.length?a.payment_methods.map(m=>methods[m]||m).join(' · '):'Prueba la conexión para verlos'}</dd></div>
   </dl>
   <ul className="wa-checks">
    <Check ok={a.status==='connected'} text={a.status==='connected'?'Llave pública y llave privada reconocidas por Wompi':'Llaves públicas y privadas sin comprobar'}/>
    <Check ok={!!a.last_event_at&&!(a.last_rejected_at&&a.last_event_at<a.last_rejected_at)} text={a.last_event_at?'Secreto de eventos comprobado · último aviso '+when(a.last_event_at):'Secreto de eventos: se comprueba con el primer aviso de Wompi'}/>
    <Check ok={!!a.integrity_checked_at} text={a.integrity_checked_at?'Secreto de integridad comprobado con un pago firmado por Tinbana':'Secreto de integridad: se comprueba con el primer pago'}/>
   </ul>
   {a.status==='error'&&a.last_error&&<p className="store-warning" role="alert">{a.last_error}</p>}
   {a.last_rejected_at&&(!a.last_event_at||a.last_event_at<a.last_rejected_at)&&<p className="store-warning" role="alert">Tinbana rechazó un aviso de Wompi por firma inválida el {when(a.last_rejected_at)}. Revisa que el secreto de eventos guardado sea exactamente el de Wompi y del mismo ambiente; Wompi reintenta el aviso hasta 3 veces en 24 horas.</p>}
   {!editing&&<div className="row"><button className="primary" disabled={busy} onClick={()=>void run(async()=>{apply(await post<View>('/api/wompi/account/test'),true);})}>{busy?'Probando…':'Probar conexión'}</button><button className="secondary" disabled={busy} onClick={()=>setEditing(true)}>Reemplazar llaves</button><button className="secondary danger" disabled={busy} onClick={()=>setConfirmDelete(true)}>Desconectar</button></div>}
   {confirmDelete&&<div className="wa-confirm" role="alertdialog" aria-labelledby="wompi-delete-title"><strong id="wompi-delete-title">¿Desconectar Wompi de Tinbana?</strong><p className="small">Tus landings dejarán de ofrecer pago en línea. Tu cuenta de Wompi y su dinero siguen igual; los avisos ya recibidos se conservan.</p><div className="row"><button className="primary danger-fill" disabled={busy} onClick={()=>void run(async()=>{const r=await api<View>('/api/wompi/account',{method:'DELETE'});setView(r);setConfirmDelete(false);setEditing(false);setNotice(r.message||'Wompi desconectado.');})}>Sí, desconectar</button><button className="secondary" disabled={busy} onClick={()=>setConfirmDelete(false)}>Cancelar</button></div></div>}
  </section>}
  {showForm&&<form className="panel narrow editor-form wa-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const body=Object.fromEntries(['public_key','private_key','events_secret','integrity_secret'].map(k=>[k,String(f.get(k)||'')]));void run(async()=>{const r=await api<View>('/api/wompi/account',{method:'PUT',body:JSON.stringify(body)});setEditing(false);apply(r,true);});}}>
   <h3>{a?'Reemplazar llaves':'Conectar tu cuenta de Wompi'}</h3>
   <p className="small muted">Las cuatro están en tu panel de Wompi, en <strong>Desarrolladores</strong>, y deben ser del mismo ambiente: todas de pruebas (<code>pub_test_…</code>) o todas de producción (<code>pub_prod_…</code>).</p>
   <label>Llave pública<input name="public_key" required autoComplete="off" spellCheck={false} maxLength={140} defaultValue={a?.public_key} placeholder="pub_test_… o pub_prod_…"/></label>
   <label>Llave privada<input name="private_key" type="password" required={!a} autoComplete="new-password" maxLength={140} placeholder={a?'Déjala vacía para conservar la actual':'prv_test_… o prv_prod_…'}/></label>
   <label>Secreto de eventos<input name="events_secret" type="password" required={!a} autoComplete="new-password" maxLength={140} placeholder={a?'Déjalo vacío para conservar el actual':'test_events_… o prod_events_…'}/></label>
   <label>Secreto de integridad<input name="integrity_secret" type="password" required={!a} autoComplete="new-password" maxLength={140} placeholder={a?'Déjalo vacío para conservar el actual':'test_integrity_… o prod_integrity_…'}/></label>
   <p className="small muted">La llave privada y los dos secretos se guardan cifrados y no vuelven a mostrarse. Si cambias de ambiente, pega de nuevo las cuatro.</p>
   <div className="row"><button className="primary" disabled={busy}>{busy?'Guardando y probando…':'Guardar y probar'}</button>{a&&<button className="secondary" type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</button>}</div>
   <div className="wa-guide-entry"><span><strong>¿No sabes dónde encontrarlas?</strong><span className="small muted">Te guiamos paso a paso.</span></span><button type="button" className="secondary" aria-expanded={guide} onClick={()=>setGuide(g=>!g)}>{guide?'Ocultar el paso a paso':'Ver el paso a paso'}</button></div>
   {guide&&<Guide/>}
  </form>}
  {a&&<section className="panel narrow webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="send"/></span><div><span className="eyebrow">Configuración en Wompi</span><h2>URL de eventos</h2></div><span className={'webhook-state '+(a.last_event_at?'on':'off')}>{a.last_event_at?'Recibiendo avisos':'Sin avisos todavía'}</span></div>
   <p className="small muted">Wompi avisa a Tinbana cada vez que un pago se aprueba o se rechaza. En tu panel de Wompi, con el ambiente de <strong>{envName(a.environment).toLowerCase()}</strong> seleccionado, ve a <strong>Desarrolladores → URL de eventos</strong>, pega esta dirección y guarda. Es solo de tu tienda.</p>
   <div className="webhook-url"><Icon name="link"/><code className="wa-token">{a.events_url}</code><button type="button" className="secondary wa-copy" onClick={()=>copy(a.events_url,'URL de eventos')}>Copiar</button></div>
   <div className="wompi-events-head"><h3>Últimos avisos de Wompi</h3><button type="button" className="secondary" disabled={busy} onClick={()=>void run(async()=>{await load();})}><Icon name="refresh"/>Actualizar</button></div>
   {view.events.length?<ul className="wompi-events">{view.events.map(e=><li key={(e.transaction_id||'')+(e.status||'')+e.received_at}><span className={'wompi-result '+(e.status==='APPROVED'?'is-ok':e.status==='PENDING'?'':'is-bad')}>{e.status?results[e.status]||e.status:e.type}</span><span><strong>{money(e.amount)}</strong>{e.payment_method&&' · '+(methods[e.payment_method]||e.payment_method)}<small>{e.reference||'Sin referencia'} · {when(e.received_at)}</small></span></li>)}</ul>
    :<p className="small muted">Todavía no llega ningún aviso. Cuando configures la URL y se haga un pago, aparecerá aquí.</p>}
  </section>}
  {a&&<section className="panel narrow webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="truck"/></span><div><span className="eyebrow">Pedidos pagados</span><h2>Envío a Dropi</h2></div><span className={'webhook-state '+(a.auto_dropi?'on':'off')}>{a.auto_dropi?'Automático':'Lo envías tú'}</span></div>
   <p className="small muted">Cuando Wompi aprueba un pago, el pedido queda confirmado (el cliente ya no tiene que confirmar nada) y se envía a Dropi como <strong>SIN RECAUDO</strong>, con el total que pagó. Dropi descuenta de tu billetera el costo del producto y el envío, así que necesitas saldo allá.</p>
   <label className="wa-switch"><input type="checkbox" checked={a.auto_dropi} disabled={busy||!a.dropi_orders} onChange={e=>{const on=e.target.checked;void run(async()=>{const r=await api<View>('/api/wompi/account/settings',{method:'PUT',body:JSON.stringify({auto_dropi:on})});setView(r);if(r.message)setNotice(r.message);});}}/><span><strong>Enviar a Dropi automáticamente los pedidos pagados</strong><small>{a.dropi_orders?(a.auto_dropi?'Activo: cada pedido pagado sale solo hacia Dropi. Si Dropi lo rechaza (por ejemplo, sin saldo), lo verás en el pedido y en Pendientes.':'Apagado (recomendado al empezar): cada pedido pagado te espera en Pedidos; lo revisas y pulsas «Enviar a Dropi», viendo antes cuánto descontará de tu billetera.'):'Tu plan no incluye el envío de pedidos a Dropi.'}</small></span></label>
  </section>}
  {a?.environment==='test'&&a.status==='connected'&&<section className="panel narrow webhook-current">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="check"/></span><div><span className="eyebrow">Comprobación completa</span><h2>Pago de prueba</h2></div><span className={'webhook-state '+(a.integrity_checked_at?'on':'off')}>{a.integrity_checked_at?'Comprobado':'Pendiente'}</span></div>
   <p className="small muted">Abre un pago de $10.000 en el sandbox de Wompi, firmado por Tinbana. Paga con la tarjeta de prueba <code>4242 4242 4242 4242</code> (aprobada) o <code>4111 1111 1111 1111</code> (rechazada), cualquier fecha futura y cualquier CVC. Si el aviso llega aquí, la URL de eventos y los dos secretos quedan comprobados. No mueve dinero real.</p>
   <div className="row"><button className="primary" disabled={busy} onClick={()=>void run(async()=>{const r=await post<{url:string}>('/api/wompi/account/test-payment');window.open(r.url,'_blank','noopener');})}>Abrir pago de prueba</button></div>
  </section>}
 </>;
}

// Not proven yet is a wait, not a failure: muted clock instead of the red cross of the WhatsApp checks.
function Check({ok,text}:{ok:boolean;text:string}){return <li className={ok?'is-ok':'is-wait'}><Icon name={ok?'check':'clock'}/>{text}</li>;}

// Where each key lives in the Wompi merchant panel (comercios.wompi.co).
function Guide(){
 return <ol className="wompi-guide">
  <li>Entra a tu panel de comercios de Wompi (<code>comercios.wompi.co</code>) con tu usuario.</li>
  <li>Elige el ambiente: <strong>Pruebas</strong> (sandbox) para comprobar todo sin dinero real, o <strong>Producción</strong> para cobrar de verdad. Las llaves de un ambiente no sirven en el otro.</li>
  <li>Ve a <strong>Desarrolladores</strong>. En <strong>Llaves del API</strong> copia la llave pública (<code>pub_…</code>) y la privada (<code>prv_…</code>).</li>
  <li>En la misma sección, en <strong>Secretos para integración técnica</strong>, copia el secreto de eventos (<code>…_events_…</code>) y el de integridad (<code>…_integrity_…</code>).</li>
  <li>Pega las cuatro aquí y pulsa «Guardar y probar».</li>
  <li>Copia la <strong>URL de eventos</strong> que te muestra Tinbana y pégala en Wompi, en <strong>Desarrolladores → URL de eventos</strong>, en el mismo ambiente.</li>
  <li>Con las llaves de pruebas, haz el <strong>pago de prueba</strong>: si el aviso llega, todo quedó bien. Luego repite con las de producción.</li>
 </ol>;
}
