import {useEffect,useState} from 'react';
import {api,post} from './api';
import {useFeedbackState} from './Notifications';
import {Icon} from './ui';
import type {Integration} from './types';

// Same layout as the GHL connection page (webhook-current card, editor-form, info table).
export function Integrations(){
 const [items,setItems]=useState<Integration[]|null>(null);const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 const [busy,setBusy]=useState(false);const [replace,setReplace]=useState('');const [adding,setAdding]=useState(false);
 async function load(){try{const r=await api<{integrations:Integration[]}>('/api/integrations');setItems(r.integrations);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function run(task:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await task();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const showAdd=items!==null&&(items.length===0||adding);
 return <><div className="section-heading"><div><span className="eyebrow">Catálogo y pedidos</span><h1>Integraciones Dropi</h1></div>{!!items?.length&&<span className="pill">{items.length===1?'1 integración configurada':`${items.length} integraciones configuradas`}</span>}</div>
  <p className="muted">Conecta tu cuenta de Dropi con su token de integración para explorar el catálogo y enviar pedidos. Los tokens se guardan cifrados en el servidor.</p>
  {items?.map(i=><section className="panel narrow webhook-current" key={i.id}>
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="link"/></span><div><span className="eyebrow">Integración Dropi</span><h3>{i.name}</h3></div><span className="webhook-state on">Configurada</span></div>
   <div className="webhook-url"><Icon name="check"/><code>dropi-integration-key · token cifrado</code></div>
   <p className="small muted">El token solo se usa desde el servidor para leer el catálogo y crear órdenes. Nunca se muestra; solo puedes reemplazarlo.</p>
   {replace===i.id?<form className="editor-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const token=new FormData(form).get('token');void run(async()=>{await api('/api/integrations/'+i.id,{method:'PATCH',body:JSON.stringify({token})});form.reset();setReplace('');setNotice('Token reemplazado. Prueba la conexión para verificarlo.');});}}><label>Nuevo token<input name="token" type="password" required autoComplete="new-password" maxLength={4096} placeholder="Pega el nuevo token de Dropi"/><span className="small muted">Reemplazarlo afecta al catálogo y al envío de pedidos de esta integración.</span></label><div className="row"><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar token'}</button><button className="secondary" type="button" disabled={busy} onClick={()=>setReplace('')}>Cancelar</button></div></form>
   :<div className="row"><button className="primary" disabled={busy} onClick={()=>void run(async()=>{const r=await post<{message:string}>('/api/integrations/'+i.id+'/test');setNotice(r.message);})}>Probar conexión</button><button className="secondary" disabled={busy} onClick={()=>setReplace(i.id)}>Reemplazar token</button></div>}
  </section>)}
  {!!items?.length&&!adding&&<button className="secondary dropi-add" disabled={busy} onClick={()=>setAdding(true)}>Añadir otra integración</button>}
  {showAdd&&<form className="panel narrow editor-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);void run(async()=>{await post('/api/integrations',{name:f.get('name'),token:f.get('token')});form.reset();setAdding(false);await load();setNotice('Integración guardada. Prueba la conexión para verificarla.');});}}>
   <h3>{items?.length?'Añadir otra integración':'Conectar Dropi'}</h3>
   <label>Nombre de la integración<input name="name" required maxLength={120} placeholder="Mi tienda Dropi"/></label>
   <label>Token de integración Dropi<input name="token" type="password" required autoComplete="new-password" maxLength={4096} placeholder="Pega el token de integración"/><span className="small muted">Se genera en tu cuenta de Dropi, en la sección de integraciones. Se guarda cifrado y no vuelve a mostrarse.</span></label>
   <div className="row"><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar integración'}</button>{!!items?.length&&<button className="secondary" type="button" disabled={busy} onClick={()=>setAdding(false)}>Cancelar</button>}</div>
  </form>}
  <section className="panel narrow"><h3>Qué hace la plataforma con tu token</h3><p className="small muted">Todas las llamadas salen del servidor de Tinbana hacia <code>api.dropi.co</code>; el navegador nunca recibe el token.</p><div className="table-scroll"><table className="payload-table dropi-uses"><thead><tr><th>Uso</th><th>Detalle</th></tr></thead><tbody>{[['Explorar productos','Busca y pagina el catálogo de Dropi con tu token.'],['Mis productos','Guarda una copia del producto elegido (precio, variantes, imágenes) para tus landings.'],['Actualizar datos','Vuelve a leer el producto en Dropi sin tocar tu contenido comercial.'],['Enviar pedidos','Crea la orden en Dropi como PENDIENTE CONFIRMACION y CON RECAUDO; la confirmas en tu panel de Dropi.'],['Probar conexión','Hace una consulta de lectura para comprobar que el token responde.']].map(([use,detail])=><tr key={use}><td><strong>{use}</strong></td><td>{detail}</td></tr>)}</tbody></table></div><p className="small muted">Si cambias el token en Dropi, reemplázalo aquí. Los productos y pedidos ya guardados se conservan.</p></section>
 </>;
}
