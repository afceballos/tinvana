import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api,post} from '../api';
import {useAllowed} from '../access';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import {WhatsAppTabs} from './WhatsAppTabs';
import {AgentSettingsForm,type AgentCatalog,type AgentSettings} from './AgentSettingsForm';
import './agent.css';
import {KnowledgeEditor} from './KnowledgeEditor';

type Status={unavailable:string|null;provider:string|null;used_this_month:number;monthly_limit:number|null;sellable:number};
type AgentView={settings:AgentSettings;custom:boolean;defaults:AgentSettings;catalog:AgentCatalog;status:Status};
type SheetContent={summary:string;can_say:string;price_note:string;faq:{q:string;a:string}[];must_not:string};
type ProductRow={id:string;name:string;image:string|null;approved_version:number|null;has_draft:boolean;updated_at:string|null};
type SheetView={product:{id:string;name:string;description:string};draft:{version:number}|null;approved:{version:number;approved_at:string}|null;editing:SheetContent};
const providers:Record<string,string>={openai:'ChatGPT · OpenAI',anthropic:'Claude · Anthropic'};

export function WhatsAppAgentPage(){
 const [view,setView]=useState<AgentView|null>(null);const [draft,setDraft]=useState<AgentSettings|null>(null);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 const load=(v:AgentView)=>{setView(v);setDraft(v.settings);};
 useEffect(()=>{api<AgentView>('/api/whatsapp/agent').then(load).catch(e=>setError((e as Error).message));},[]);
 async function run(task:()=>Promise<void>){setBusy(true);setError('');try{await task();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!view||!draft)return <><WhatsAppTabs/><InlineLoading title="Cargando el agente"/></>;
 const st=view.status;const dirty=JSON.stringify(draft)!==JSON.stringify(view.settings);
 return <>
  <WhatsAppTabs/>
  <p className="muted">El agente responde a tus clientes con la información de las fichas que apruebes. Nunca inventa precios, envíos ni disponibilidad, y pasa el chat a un asesor cuando hace falta.</p>
  <section className="panel narrow webhook-current wa-agent-status">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="automation"/></span><div><span className="eyebrow">Estado</span><h2>{st.unavailable?'El agente no está respondiendo':'El agente está respondiendo'}</h2></div><span className={'webhook-state '+(st.unavailable?'off':'on')}>{st.unavailable?'Inactivo':'Activo'}</span></div>
   {st.unavailable&&<p className="store-warning" role="note">{st.unavailable}. Mientras tanto, los chats nuevos llegan a un asesor.{!st.provider&&<> <Link to="/panel/ia">Ir a Integraciones de IA</Link></>}</p>}
   <dl className="wa-facts">
    <div><dt>IA conectada</dt><dd>{st.provider?providers[st.provider]||st.provider:'Ninguna'}</dd></div>
    <div><dt>Conversaciones con IA este mes</dt><dd>{st.used_this_month}{st.monthly_limit!==null?` de ${st.monthly_limit}`:' · sin límite'}</dd></div>
    <div><dt>Productos con ficha aprobada</dt><dd>{st.sellable}{st.sellable===0&&<span className="small muted"> · aprueba al menos una ficha abajo</span>}</dd></div>
   </dl>
  </section>
  <section className="panel narrow webhook-current wa-agent-settings">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="chat"/></span><div><span className="eyebrow">Cómo responde</span><h2>Ajustes del agente</h2></div><span className="webhook-state on">{view.custom?'Ajustes propios':'Predeterminados de Tinbana'}</span></div>
   <AgentSettingsForm value={draft} catalog={view.catalog} onChange={setDraft}/>
   <div className="row">
    <button className="primary" disabled={busy||!dirty} onClick={()=>void run(async()=>{load(await api<AgentView>('/api/whatsapp/agent',{method:'PUT',body:JSON.stringify(draft)}));setNotice('Ajustes del agente guardados.');})}>{busy?'Guardando…':'Guardar ajustes'}</button>
    {dirty&&<button className="secondary" disabled={busy} onClick={()=>setDraft(view.settings)}>Descartar cambios</button>}
    {view.custom&&!dirty&&<button className="secondary" disabled={busy} onClick={()=>void run(async()=>{load(await api<AgentView>('/api/whatsapp/agent',{method:'DELETE'}));setNotice('Volviste a los ajustes predeterminados de Tinbana.');})}>Usar los predeterminados</button>}
   </div>
  </section>
  <Sheets onChange={()=>{api<AgentView>('/api/whatsapp/agent').then(v=>setView({...v,settings:view.settings})).catch(()=>{});}}/>
  <section className="panel webhook-current"><div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="automation"/></span><div><span className="eyebrow">Lo que la IA aprende de tu tienda</span><h2>Aprendizajes</h2></div></div>
   <KnowledgeEditor list="/api/whatsapp/knowledge" base="/api/whatsapp/knowledge" scope="store"/></section>
 </>;
}

const emptySheet:SheetContent={summary:'',can_say:'',price_note:'',faq:[],must_not:''};
function Sheets({onChange}:{onChange:()=>void}){
 const [rows,setRows]=useState<ProductRow[]|null>(null);const [open,setOpen]=useState<SheetView|null>(null);const [content,setContent]=useState<SheetContent>(emptySheet);const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');const aiAllowed=useAllowed('ai');
 const refresh=()=>api<{products:ProductRow[]}>('/api/whatsapp/sheets').then(r=>setRows(r.products)).catch(e=>setError((e as Error).message));
 useEffect(()=>{void refresh();},[]);
 async function run(task:()=>Promise<void>){setBusy(true);setError('');try{await task();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const show=(v:SheetView)=>{setOpen(v);setContent(v.editing);};
 const field=(k:keyof SheetContent,label:string,max:number,rows:number,hint?:string)=><label>{label}<textarea rows={rows} maxLength={max} value={content[k] as string} onChange={e=>setContent({...content,[k]:e.target.value})}/>{hint&&<span className="small muted">{hint}</span>}</label>;
 return <section className="panel narrow webhook-current wa-sheets">
  <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="box"/></span><div><span className="eyebrow">Lo que el agente sabe</span><h2>Fichas de productos</h2></div></div>
  <p className="small muted">El agente solo vende productos con ficha aprobada y solo dice lo que está en ella. Cada vez que apruebas cambios se crea una nueva versión.</p>
  {!rows?<InlineLoading title="Cargando productos"/>:!rows.length?<p className="small muted">Aún no tienes productos. Agrégalos desde <Link to="/panel/catalogo">Explorar productos</Link>.</p>:
   <ul className="wa-sheet-list">{rows.map(p=><li key={p.id} className={open?.product.id===p.id?'is-open':''}>
    {p.image?<img src={p.image} alt="" loading="lazy"/>:<span className="wa-sheet-noimg" aria-hidden="true"><Icon name="box"/></span>}
    <div><strong>{p.name}</strong><span className="wa-sheet-state">{p.approved_version?<span className="wa-tag is-ok">Aprobada · v{p.approved_version}</span>:<span className="wa-tag is-muted">Sin ficha aprobada</span>}{p.has_draft&&<span className="wa-tag is-ai">Borrador sin aprobar</span>}</span></div>
    <button className="secondary" disabled={busy} onClick={()=>void run(async()=>{show(await api<SheetView>('/api/whatsapp/sheets/'+p.id));})}>{p.approved_version||p.has_draft?'Editar ficha':'Crear ficha'}</button>
   </li>)}</ul>}
  {open&&<form className="editor-form wa-sheet-editor" onSubmit={e=>{e.preventDefault();void run(async()=>{show(await api<SheetView>('/api/whatsapp/sheets/'+open.product.id,{method:'PUT',body:JSON.stringify({content})}));await refresh();setNotice('Borrador guardado. Apruébalo para que el agente lo use.');});}}>
   <div className="wa-sheet-editor-head"><div><span className="eyebrow">Ficha de</span><h3>{open.product.name}</h3></div><span className="small muted">{open.approved?`El agente usa la versión ${open.approved.version}`:'El agente aún no vende este producto'}{open.draft?' · hay un borrador sin aprobar':''}</span></div>
   {open.product.description&&<details className="wa-sheet-source"><summary>Ver la descripción del producto en Dropi</summary><p>{open.product.description}</p></details>}
   {aiAllowed&&<div className="row"><button type="button" className="secondary" disabled={busy} onClick={()=>void run(async()=>{show(await post<SheetView>('/api/whatsapp/sheets/'+open.product.id+'/generate'));await refresh();setNotice('Borrador generado con IA. Revísalo y apruébalo si está bien.');})}><Icon name="automation"/>{busy?'Generando…':'Proponer borrador con IA'}</button><span className="small muted">Usa tu conexión de IA. Nada se aprueba sin tu revisión.</span></div>}
   {field('summary','Resumen del producto',600,3)}
   {field('can_say','Qué puede decir el agente',1500,5,'Beneficios y características verificables, una por línea.')}
   {field('price_note','Precio y promociones que puede mencionar',300,2,'Texto exacto que el agente puede decir. Si lo dejas vacío, no habla de precios.')}
   <fieldset><legend>Preguntas frecuentes</legend>
    {content.faq.map((f,i)=><div className="wa-faq" key={i}><label>Pregunta<input maxLength={200} value={f.q} onChange={e=>setContent({...content,faq:content.faq.map((x,j)=>j===i?{...x,q:e.target.value}:x)})}/></label><label>Respuesta<textarea rows={2} maxLength={500} value={f.a} onChange={e=>setContent({...content,faq:content.faq.map((x,j)=>j===i?{...x,a:e.target.value}:x)})}/></label><button type="button" className="secondary danger" onClick={()=>setContent({...content,faq:content.faq.filter((_,j)=>j!==i)})}>Quitar</button></div>)}
    {content.faq.length<12&&<button type="button" className="secondary" onClick={()=>setContent({...content,faq:[...content.faq,{q:'',a:''}]})}>Agregar pregunta</button>}
   </fieldset>
   {field('must_not','Qué no debe prometer',800,3,'Ej. tiempos exactos de entrega, resultados garantizados o descuentos no autorizados.')}
   <div className="row">
    <button className="secondary" disabled={busy}>{busy?'Guardando…':'Guardar borrador'}</button>
    <button type="button" className="primary" disabled={busy} onClick={()=>void run(async()=>{await api('/api/whatsapp/sheets/'+open.product.id,{method:'PUT',body:JSON.stringify({content})});const v=await post<SheetView>('/api/whatsapp/sheets/'+open.product.id+'/approve');show(v);await refresh();onChange();setNotice(`Ficha aprobada (versión ${v.approved?.version}). El agente ya la usa.`);})}>Guardar y aprobar</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(null)}>Cerrar</button>
   </div>
  </form>}
 </section>;
}
