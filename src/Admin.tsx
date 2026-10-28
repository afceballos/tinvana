import {useEffect,useState,type ReactNode} from 'react';
import {Link,NavLink,useNavigate,useParams} from 'react-router-dom';
import {api} from './api';
import {useFeedbackState} from './Notifications';
import {InlineLoading} from './Loading';
import {Icon} from './ui';
import './admin.css';
import {AgentSettingsForm,type AgentCatalog,type AgentSettings} from './whatsapp/AgentSettingsForm';
import './whatsapp/agent.css';

type Rules={features:Record<string,boolean>;limits:Record<string,number|null>};
type Catalog={features:Record<string,string>;limits:Record<string,string>};
type Plan={id:string;name:string;description:string;price:number|null;currency:string;period:'free'|'month'|'year'|'once';highlights:string[];features:Record<string,boolean>;limits:Record<string,number|null>;is_default:boolean;active:boolean;sort_order:number;accounts:number};
type Row={id:string;email:string;name:string;role:string;status:'active'|'suspended';plan:string|null;plan_expires_at:string|null;created_at:string;last_login_at:string|null;verified:boolean;landings:number;published:number;orders:number};
type Summary={users:number;suspended:number;new_30_days:number;unverified:number;landings:number;published:number;orders:number;plans:number};
type AuditEntry={id?:string;action:string;data:Record<string,unknown>;created_at:string;actor:string|null;target?:string|null};
type AccountView=Catalog&{user:{id:string;email:string;name:string;role:string;status:'active'|'suspended';plan_id:string|null;plan_expires_at:string|null;overrides:Rules;note:string;created_at:string;last_login_at:string|null;verified:boolean};effective:Rules&{plan:{id:string;name:string}|null};usage:Record<string,number>;defaults:Rules;plans:Plan[];audit:AuditEntry[]};

const day=(v:string|null)=>v?new Date(v).toLocaleDateString('es-CO',{dateStyle:'medium'}):'—';
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'Nunca';
const cash=(n:number|null,currency='COP')=>n===null?'Sin precio':new Intl.NumberFormat('es-CO',{style:'currency',currency,maximumFractionDigits:0}).format(n);
const periods={free:'Gratis',month:'por mes',year:'por año',once:'pago único'};
const limitText=(v:number|null|undefined)=>v===null||v===undefined?'Ilimitado':String(v);
const actions:Record<string,string>={account_updated:'Cuenta actualizada',defaults_updated:'Valores globales actualizados',whatsapp_agent_defaults_updated:'Agente de WhatsApp: predeterminados actualizados',plan_created:'Plan creado',plan_updated:'Plan actualizado',plan_deleted:'Plan eliminado',superadmin_granted:'Superusuario asignado (consola)',superadmin_revoked:'Superusuario retirado (consola)'};

function Card({icon,eyebrow,title,state,children,className=''}:{icon:string;eyebrow:string;title:string;state?:ReactNode;children:ReactNode;className?:string}){
 return <section className={'panel webhook-current admin-card '+className}><div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name={icon}/></span><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{state}</div>{children}</section>;
}

/** Three states per feature: inherit (key absent), on, off. `inherited` is the value it would take. */
function FeatureRules({catalog,value,inherited,inheritLabel,onChange,complete=false}:{catalog:Catalog;value:Record<string,boolean>;inherited:Record<string,boolean>;inheritLabel:string;onChange:(v:Record<string,boolean>)=>void;complete?:boolean}){
 return <div className="admin-rules">{Object.entries(catalog.features).map(([key,label])=>{const own=key in value;const current=own?value[key]:inherited[key]!==false;
  return <label key={key} className="admin-rule"><span><strong>{label}</strong><small>{own||complete?(current?'Activado':'Desactivado'):`${inheritLabel}: ${current?'activado':'desactivado'}`}</small></span>
   <select value={own?(value[key]?'on':'off'):'inherit'} onChange={e=>{const next={...value};if(e.target.value==='inherit')delete next[key];else next[key]=e.target.value==='on';onChange(next);}}>
    {!complete&&<option value="inherit">{inheritLabel}</option>}<option value="on">Activado</option><option value="off">Desactivado</option>
   </select></label>;})}</div>;
}
function LimitRules({catalog,value,inherited,inheritLabel,onChange,usage,complete=false}:{catalog:Catalog;value:Record<string,number|null>;inherited:Record<string,number|null>;inheritLabel:string;onChange:(v:Record<string,number|null>)=>void;usage?:Record<string,number>;complete?:boolean}){
 return <div className="admin-rules">{Object.entries(catalog.limits).map(([key,label])=>{const own=key in value;const mode=own?(value[key]===null?'unlimited':'number'):'inherit';const effective=own?value[key]:inherited[key]??null;
  return <div key={key} className="admin-rule"><span><strong>{label}</strong><small>{usage?`En uso: ${usage[key]??0} de ${limitText(effective)}`:own||complete?limitText(effective):`${inheritLabel}: ${limitText(effective)}`}</small></span>
   <span className="admin-limit"><select aria-label={'Límite: '+label} value={mode} onChange={e=>{const next={...value};if(e.target.value==='inherit')delete next[key];else if(e.target.value==='unlimited')next[key]=null;else next[key]=effective??10;onChange(next);}}>
    {!complete&&<option value="inherit">{inheritLabel}</option>}<option value="unlimited">Ilimitado</option><option value="number">Máximo</option></select>
   {mode==='number'&&<input type="number" min={0} max={100000} aria-label={'Máximo de '+label} value={value[key]??0} onChange={e=>onChange({...value,[key]:Math.max(0,Math.min(100000,Math.trunc(Number(e.target.value)||0)))})}/>}</span></div>;})}</div>;
}

export function AdminPage(){
 const {tab='cuentas'}=useParams();
 const tabs:[string,string][]=[['cuentas','Cuentas'],['planes','Planes'],['globales','Valores globales'],['auditoria','Auditoría']];
 return <div className="admin-page">
  <div className="section-heading"><div><span className="eyebrow">Superusuario</span><h1>Administración</h1></div></div>
  <p className="muted">Administra las cuentas, los planes y lo que cada uno puede usar. Los cambios se aplican en el servidor y quedan registrados en la auditoría. Desde aquí nunca se ven contraseñas, tokens ni claves.</p>
  <nav className="admin-tabs" aria-label="Secciones de administración">{tabs.map(([key,label])=><NavLink key={key} to={'/panel/admin'+(key==='cuentas'?'':'/'+key)} end className={tab===key?'active':''}>{label}</NavLink>)}</nav>
  {tab==='cuentas'&&<Accounts/>}{tab==='planes'&&<Plans/>}{tab==='globales'&&<><Defaults/><AgentDefaults/></>}{tab==='auditoria'&&<Audit/>}
 </div>;
}

function Accounts(){
 const [summary,setSummary]=useState<Summary|null>(null);const [rows,setRows]=useState<Row[]|null>(null);const [next,setNext]=useState(false);const [page,setPage]=useState(1);
 const [q,setQ]=useState('');const [status,setStatus]=useState('');const [plan,setPlan]=useState('');const [plans,setPlans]=useState<Plan[]>([]);const [defaultPlan,setDefaultPlan]=useState<string|null>(null);
 const [,setError]=useFeedbackState('error');const navigate=useNavigate();
 useEffect(()=>{api<Summary>('/api/admin/summary').then(setSummary).catch(e=>setError(e.message));api<{plans:Plan[]}>('/api/admin/plans').then(r=>setPlans(r.plans)).catch(()=>{});},[]);
 useEffect(()=>{const c=new AbortController();const t=setTimeout(()=>{const p=new URLSearchParams({page:String(page),q,status,plan});api<{users:Row[];hasNext:boolean;default_plan:string|null}>('/api/admin/users?'+p,{signal:c.signal}).then(r=>{setRows(r.users);setNext(r.hasNext);setDefaultPlan(r.default_plan);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});},q?250:0);return()=>{clearTimeout(t);c.abort();};},[page,q,status,plan]);
 const stats:[string,number|undefined][]=summary?[['Cuentas',summary.users],['Nuevas en 30 días',summary.new_30_days],['Suspendidas',summary.suspended],['Sin verificar',summary.unverified],['Landings publicadas',summary.published],['Pedidos',summary.orders]]:[];
 return <>
  {summary&&<div className="admin-stats">{stats.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
  <Card icon="users" eyebrow="Cuentas registradas" title="Buscar y administrar cuentas">
   <div className="admin-filters"><label>Buscar por email<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="correo@dominio.com"/></label>
    <label>Estado<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">Todos</option><option value="active">Activas</option><option value="suspended">Suspendidas</option></select></label>
    <label>Plan<select value={plan} onChange={e=>{setPlan(e.target.value);setPage(1);}}><option value="">Todos</option><option value="none">Sin plan asignado{defaultPlan?` (usa ${defaultPlan})`:''}</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
   {!rows?<InlineLoading title="Cargando cuentas"/>:!rows.length?<p className="muted">No hay cuentas con esos filtros.</p>:
   <div className="table-scroll"><table className="payload-table admin-table"><thead><tr><th>Cuenta</th><th>Plan</th><th>Estado</th><th>Uso</th><th>Último acceso</th><th>Alta</th></tr></thead><tbody>
    {rows.map(r=><tr key={r.id} onClick={()=>navigate('/panel/admin/cuentas/'+r.id)}><td><Link to={'/panel/admin/cuentas/'+r.id} onClick={e=>e.stopPropagation()}><strong>{r.email}</strong></Link>{r.name&&<small>{r.name}</small>}{r.role==='superadmin'&&<em className="admin-badge">Superusuario</em>}{!r.verified&&<em className="admin-badge is-muted">Sin verificar</em>}</td>
     <td>{r.plan||<span className="muted">{defaultPlan?`Predeterminado (${defaultPlan})`:'Valores globales'}</span>}{r.plan_expires_at&&<small>Vence {day(r.plan_expires_at)}</small>}</td>
     <td><span className={'webhook-state '+(r.status==='active'?'on':'off')}>{r.status==='active'?'Activa':'Suspendida'}</span></td>
     <td><small>{r.landings} landings · {r.published} publicadas · {r.orders} pedidos</small></td><td>{when(r.last_login_at)}</td><td>{day(r.created_at)}</td></tr>)}
   </tbody></table></div>}
   {(page>1||next)&&<div className="admin-pager"><button className="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span className="small muted">Página {page}</span><button className="secondary" disabled={!next} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>}
  </Card>
 </>;
}

export function AdminAccount(){
 const {id=''}=useParams();const [view,setView]=useState<AccountView|null>(null);const [busy,setBusy]=useState(false);
 const [planId,setPlanId]=useState('');const [expires,setExpires]=useState('');const [overrides,setOverrides]=useState<Rules>({features:{},limits:{}});const [note,setNote]=useState('');
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 function load(v:AccountView){setView(v);setPlanId(v.user.plan_id||'');setExpires(v.user.plan_expires_at?new Date(new Date(v.user.plan_expires_at).getTime()-5*3600000).toISOString().slice(0,10):'');setOverrides({features:{...v.user.overrides.features},limits:{...v.user.overrides.limits}});setNote(v.user.note);}
 useEffect(()=>{api<AccountView>('/api/admin/users/'+id).then(load).catch(e=>setError(e.message));},[id]);
 if(!view)return <InlineLoading title="Cargando la cuenta"/>;
 const u=view.user;const plan=view.plans.find(p=>p.id===planId)||view.plans.find(p=>p.is_default)||null;
 // What the account inherits before its own overrides: global defaults with the selected (or default) plan on top.
 const base:Rules={features:{...view.defaults.features,...(plan?.features||{})},limits:{...view.defaults.limits,...(plan?.limits||{})}};
 const inheritLabel=plan?'Según plan '+plan.name:'Según valores globales';
 async function save(body:Record<string,unknown>,message:string){setBusy(true);setError('');try{const r=await api<AccountView>('/api/admin/users/'+id,{method:'PUT',body:JSON.stringify(body)});load(r);setNotice(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const suspended=u.status==='suspended';const isSuper=u.role==='superadmin';
 return <div className="admin-page">
  <Link className="od-back" to="/panel/admin"><Icon name="chevron"/>Cuentas</Link>
  <div className="section-heading"><div><span className="eyebrow">Cuenta{isSuper?' · Superusuario':''}</span><h1>{u.name||u.email}</h1></div><span className={'webhook-state '+(suspended?'off':'on')}>{suspended?'Suspendida':'Activa'}</span></div>
  <dl className="admin-facts"><div><dt>Email</dt><dd>{u.email}</dd></div><div><dt>Alta</dt><dd>{day(u.created_at)}</dd></div><div><dt>Último acceso</dt><dd>{when(u.last_login_at)}</dd></div><div><dt>Correo</dt><dd>{u.verified?'Verificado':'Sin verificar'}</dd></div><div><dt>Plan vigente</dt><dd>{isSuper?'Acceso total':view.effective.plan?.name||'Valores globales'}</dd></div></dl>
  {isSuper&&<p className="store-warning" role="note">Los superusuarios tienen acceso total y no se pueden suspender desde el panel. El rol se asigna o retira solo desde la consola del servidor.</p>}
  <div className="admin-grid">
   <Card icon="tag" eyebrow="Plan" title="Plan de la cuenta">
    <label>Plan asignado<select value={planId} onChange={e=>setPlanId(e.target.value)}><option value="">{view.plans.some(p=>p.is_default)?`Predeterminado (${view.plans.find(p=>p.is_default)?.name})`:'Ninguno: valores globales'}</option>{view.plans.map(p=><option key={p.id} value={p.id} disabled={!p.active&&p.id!==u.plan_id}>{p.name}{p.active?'':' (inactivo)'}</option>)}</select></label>
    <label>Vence el (opcional)<input type="date" value={expires} disabled={!planId} onChange={e=>setExpires(e.target.value)}/><span className="small muted">Al vencer, la cuenta pasa al plan predeterminado. Sin fecha no vence.</span></label>
    <button className="primary" disabled={busy} onClick={()=>void save({plan_id:planId||null,plan_expires_at:planId&&expires?expires:null},'Plan actualizado.')}>Guardar plan</button>
   </Card>
   <Card icon="lock" eyebrow="Acceso" title={suspended?'Cuenta suspendida':'Cuenta activa'} state={<span className={'webhook-state '+(suspended?'off':'on')}>{suspended?'Suspendida':'Activa'}</span>}>
    <p className="muted">{suspended?'No puede iniciar sesión y sus landings públicas están fuera de línea. Sus datos se conservan.':'Al suspenderla se cierran sus sesiones, no puede entrar y sus landings dejan de mostrarse. No se borra nada.'}</p>
    {!isSuper&&<button className={suspended?'primary':'secondary danger'} disabled={busy} onClick={()=>{if(suspended||window.confirm('¿Suspender '+u.email+'? Se cerrarán sus sesiones y sus landings quedarán fuera de línea.'))void save({status:suspended?'active':'suspended'},suspended?'Cuenta reactivada.':'Cuenta suspendida.');}}>{suspended?'Reactivar cuenta':'Suspender cuenta'}</button>}
   </Card>
  </div>
  <Card icon="check" eyebrow="Excepciones de esta cuenta" title="Funciones y límites">
   <p className="muted">Por defecto la cuenta usa lo de su plan. Cambia solo lo que quieras que sea distinto para esta cuenta.</p>
   <h3>Funciones</h3><FeatureRules catalog={view} value={overrides.features} inherited={base.features} inheritLabel={inheritLabel} onChange={features=>setOverrides({...overrides,features})}/>
   <h3>Límites</h3><LimitRules catalog={view} value={overrides.limits} inherited={base.limits} inheritLabel={inheritLabel} usage={view.usage} onChange={limits=>setOverrides({...overrides,limits})}/>
   <label>Nota interna<textarea maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Solo la ven los superusuarios. Ej.: pagó hasta diciembre por transferencia."/></label>
   <div className="admin-actions"><button className="primary" disabled={busy} onClick={()=>void save({overrides,note},'Excepciones guardadas.')}>Guardar excepciones</button><button className="secondary" disabled={busy} onClick={()=>setOverrides({features:{},limits:{}})}>Quitar todas las excepciones</button></div>
  </Card>
  <Card icon="clock" eyebrow="Historial" title="Cambios en esta cuenta">
   {view.audit.length?<AuditList entries={view.audit}/>:<p className="muted">Sin cambios registrados.</p>}
  </Card>
 </div>;
}

const emptyPlan:Omit<Plan,'id'|'accounts'>={name:'',description:'',price:null,currency:'COP',period:'month',highlights:[],features:{},limits:{},is_default:false,active:true,sort_order:0};
function Plans(){
 const [data,setData]=useState<(Catalog&{plans:Plan[]})|null>(null);const [defaults,setDefaults]=useState<Rules|null>(null);const [editing,setEditing]=useState<(Omit<Plan,'id'|'accounts'>&{id?:string})|null>(null);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 const load=()=>api<Catalog&{plans:Plan[]}>('/api/admin/plans').then(setData).catch(e=>setError(e.message));
 useEffect(()=>{void load();api<{defaults:Rules}>('/api/admin/entitlements').then(r=>setDefaults(r.defaults)).catch(()=>{});},[]);
 if(!data||!defaults)return <InlineLoading title="Cargando planes"/>;
 async function save(){if(!editing)return;setBusy(true);setError('');try{const {id,...body}=editing;await api(id?'/api/admin/plans/'+id:'/api/admin/plans',{method:id?'PUT':'POST',body:JSON.stringify(body)});setNotice(id?'Plan actualizado.':'Plan creado.');setEditing(null);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function remove(p:Plan){if(!window.confirm('¿Eliminar el plan '+p.name+'?'))return;setBusy(true);try{await api('/api/admin/plans/'+p.id,{method:'DELETE'});setNotice('Plan eliminado.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(editing)return <Card icon="tag" eyebrow={editing.id?'Editar plan':'Nuevo plan'} title={editing.name||'Plan sin nombre'}>
  <div className="admin-form-grid">
   <label>Nombre<input required maxLength={80} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} placeholder="Pro"/></label>
   <label>Precio<input type="number" min={0} step={1000} value={editing.price??''} onChange={e=>setEditing({...editing,price:e.target.value===''?null:Math.max(0,Math.trunc(Number(e.target.value)))})} placeholder="Vacío si es gratis"/></label>
   <label>Moneda<input maxLength={3} value={editing.currency} onChange={e=>setEditing({...editing,currency:e.target.value.toUpperCase()})}/></label>
   <label>Cobro<select value={editing.period} onChange={e=>setEditing({...editing,period:e.target.value as Plan['period']})}>{Object.entries(periods).map(([k,v])=><option key={k} value={k}>{k==='free'?v:'Precio '+v}</option>)}</select></label>
   <label>Orden<input type="number" min={-1000} max={1000} value={editing.sort_order} onChange={e=>setEditing({...editing,sort_order:Math.trunc(Number(e.target.value)||0)})}/></label>
  </div>
  <label>Descripción<textarea maxLength={1000} rows={2} value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="Para quién es este plan."/></label>
  <label>Beneficios a mostrar (uno por línea)<textarea rows={4} value={editing.highlights.join('\n')} onChange={e=>setEditing({...editing,highlights:e.target.value.split('\n').slice(0,12)})} placeholder={'Landings ilimitadas\nEnvío de pedidos a Dropi'}/></label>
  <div className="admin-checks"><label className="order-check"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked,is_default:e.target.checked&&editing.is_default})}/><span>Activo (se puede asignar a cuentas)</span></label>
   <label className="order-check"><input type="checkbox" checked={editing.is_default} disabled={!editing.active} onChange={e=>setEditing({...editing,is_default:e.target.checked})}/><span>Plan predeterminado: lo usan las cuentas sin plan asignado y las que se registren</span></label></div>
  <h3>Funciones</h3><FeatureRules catalog={data} value={editing.features} inherited={defaults.features} inheritLabel="Valor global" onChange={features=>setEditing({...editing,features})}/>
  <h3>Límites</h3><LimitRules catalog={data} value={editing.limits} inherited={defaults.limits} inheritLabel="Valor global" onChange={limits=>setEditing({...editing,limits})}/>
  <div className="admin-actions"><button className="primary" disabled={busy||!editing.name.trim()} onClick={()=>void save()}>{busy?'Guardando…':'Guardar plan'}</button><button className="secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button></div>
 </Card>;
 return <>
  <div className="admin-actions"><button className="primary" onClick={()=>setEditing({...emptyPlan,highlights:[],features:{},limits:{}})}>Crear plan</button></div>
  {!data.plans.length&&<p className="muted">Aún no hay planes. Mientras tanto, todas las cuentas usan los valores globales.</p>}
  <div className="admin-plans">{data.plans.map(p=><section key={p.id} className={'panel webhook-current admin-plan'+(p.active?'':' is-off')}>
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="tag"/></span><div><span className="eyebrow">{p.is_default?'Predeterminado':p.active?'Activo':'Inactivo'}</span><h2>{p.name}</h2></div><span className={'webhook-state '+(p.active?'on':'off')}>{p.accounts===1?'1 cuenta':p.accounts+' cuentas'}</span></div>
   <p className="admin-price"><strong>{p.period==='free'||p.price===null?'Gratis':cash(p.price,p.currency)}</strong>{p.period!=='free'&&p.price!==null&&<span> {periods[p.period]}</span>}</p>
   {p.description&&<p className="muted">{p.description}</p>}
   {!!p.highlights.length&&<ul className="admin-highlights">{p.highlights.map(h=><li key={h}><Icon name="check"/>{h}</li>)}</ul>}
   <p className="small muted">{Object.keys(p.features).length+Object.keys(p.limits).length?`${Object.values(p.features).filter(v=>!v).length} funciones desactivadas · ${Object.entries(p.limits).map(([k,v])=>`${data.limits[k]}: ${limitText(v)}`).join(' · ')||'límites globales'}`:'Usa todos los valores globales.'}</p>
   <div className="admin-actions"><button className="secondary" onClick={()=>setEditing({...p})}>Editar</button><button className="secondary danger" disabled={busy} onClick={()=>void remove(p)}>Eliminar</button></div>
  </section>)}</div>
 </>;
}

function Defaults(){
 const [data,setData]=useState<(Catalog&{defaults:Rules})|null>(null);const [draft,setDraft]=useState<Rules|null>(null);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{api<Catalog&{defaults:Rules}>('/api/admin/entitlements').then(r=>{setData(r);setDraft(r.defaults);}).catch(e=>setError(e.message));},[]);
 if(!data||!draft)return <InlineLoading title="Cargando valores globales"/>;
 const dirty=JSON.stringify(draft)!==JSON.stringify(data.defaults);
 async function save(){setBusy(true);setError('');try{const r=await api<Catalog&{defaults:Rules}>('/api/admin/entitlements',{method:'PUT',body:JSON.stringify(draft)});setData(r);setDraft(r.defaults);setNotice('Valores globales guardados.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Card icon="globe" eyebrow="Base para todas las cuentas" title="Valores globales">
  <p className="muted">Es lo que tiene cualquier cuenta cuando ni su plan ni sus excepciones dicen otra cosa. Hoy todo está activado y sin límites, como hasta ahora.</p>
  <h3>Funciones</h3><FeatureRules complete catalog={data} value={draft.features} inherited={draft.features} inheritLabel="" onChange={features=>setDraft({...draft,features})}/>
  <h3>Límites</h3><LimitRules complete catalog={data} value={draft.limits} inherited={draft.limits} inheritLabel="" onChange={limits=>setDraft({...draft,limits})}/>
  <div className="admin-actions"><button className="primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?'Guardando…':'Guardar valores globales'}</button>{dirty&&<span className="small muted">Tienes cambios sin guardar.</span>}</div>
 </Card>;
}

function AuditList({entries}:{entries:AuditEntry[]}){
 return <ol className="order-history cx-timeline admin-audit">{entries.map((a,i)=><li key={a.id||i}><strong>{actions[a.action]||a.action}</strong><time>{when(a.created_at)}{a.actor?' · '+a.actor:' · consola'}{a.target?' → '+a.target:''}</time><p>{describe(a)}</p></li>)}</ol>;
}
function describe(a:AuditEntry){
 const d=a.data||{};const parts:string[]=[];
 if(d.status){const [, to]=d.status as string[];parts.push(to==='suspended'?'Suspendida':'Reactivada');}
 if('plan_id' in d)parts.push('Plan cambiado');if('plan_expires_at' in d){const [, to]=d.plan_expires_at as (string|null)[];parts.push(to?'Vence el '+to:'Sin vencimiento');}
 if(d.overrides)parts.push('Excepciones de funciones y límites cambiadas');if(d.note)parts.push('Nota interna actualizada');
 if(typeof d.name==='string')parts.push(d.name);if(d.source==='console')parts.push('Desde la consola del servidor');
 return parts.join(' · ')||'Configuración actualizada';
}
function Audit(){
 const [entries,setEntries]=useState<AuditEntry[]|null>(null);const [page,setPage]=useState(1);const [next,setNext]=useState(false);const [,setError]=useFeedbackState('error');
 useEffect(()=>{api<{entries:AuditEntry[];hasNext:boolean}>('/api/admin/audit?page='+page).then(r=>{setEntries(r.entries);setNext(r.hasNext);}).catch(e=>setError(e.message));},[page]);
 return <Card icon="clock" eyebrow="Registro" title="Auditoría de administración">
  {!entries?<InlineLoading title="Cargando auditoría"/>:entries.length?<AuditList entries={entries}/>:<p className="muted">Aún no hay cambios registrados.</p>}
  {(page>1||next)&&<div className="admin-pager"><button className="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span className="small muted">Página {page}</span><button className="secondary" disabled={!next} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>}
 </Card>;
}

// Defaults of the WhatsApp AI agent: every store uses them until it saves its own settings.
function AgentDefaults(){
 const [data,setData]=useState<{defaults:AgentSettings;catalog:AgentCatalog}|null>(null);const [draft,setDraft]=useState<AgentSettings|null>(null);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{api<{defaults:AgentSettings;catalog:AgentCatalog}>('/api/admin/whatsapp-agent').then(r=>{setData(r);setDraft(r.defaults);}).catch(e=>setError(e.message));},[]);
 if(!data||!draft)return <InlineLoading title="Cargando el agente de WhatsApp"/>;
 const dirty=JSON.stringify(draft)!==JSON.stringify(data.defaults);
 async function save(value:AgentSettings,message:string){setBusy(true);setError('');try{const r=await api<{defaults:AgentSettings;catalog:AgentCatalog}>('/api/admin/whatsapp-agent',{method:'PUT',body:JSON.stringify(value)});setData(r);setDraft(r.defaults);setNotice(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Card icon="chat" eyebrow="Ventas por WhatsApp" title="Agente de IA: valores predeterminados" className="admin-agent">
  <p className="muted">Las tiendas usan estos ajustes hasta que guarden los suyos en «Agente IA». Quién puede usar el agente y cuántas conversaciones al mes se controla arriba, en Funciones y Límites, y por plan o por cuenta.</p>
  <AgentSettingsForm value={draft} catalog={data.catalog} onChange={setDraft} idPrefix="admin-agent"/>
  <div className="admin-actions"><button className="primary" disabled={busy||!dirty} onClick={()=>void save(draft,'Predeterminados del agente guardados.')}>{busy?'Guardando…':'Guardar predeterminados del agente'}</button>{dirty&&<button className="secondary" disabled={busy} onClick={()=>setDraft(data.defaults)}>Descartar cambios</button>}<button className="secondary" disabled={busy} onClick={()=>void save(data.catalog.built_in,'Se restauraron los valores originales de Tinbana.')}>Restaurar valores originales</button></div>
 </Card>;
}
