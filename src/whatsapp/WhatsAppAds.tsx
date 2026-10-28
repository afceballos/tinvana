import {useEffect,useState} from 'react';
import {api,post} from '../api';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import {WhatsAppTabs} from './WhatsAppTabs';
import './ads.css';

type Offer={id:string;code:string;name:string;product:{id:string;name:string|null};units:number;price_mode:'tiers'|'fixed';fixed_price:number|null;landing_default:boolean;price:{total:number|null;version:number|null;text:string|null};label:string;message:string};
type Ad={id:string;ad_id:string;name:string;status:'active'|'paused'|'unassigned';origin:'first_message'|'manual';offer:{id:string;label:string;code:string}|null;source:{headline?:string;body?:string;media_type?:string;image_url?:string;thumbnail_url?:string;source_url?:string};entries_7d:number;first_seen_at:string|null;last_seen_at:string|null};
type View={ads:Ad[];offers:Offer[];products:{id:string;name:string|null}[];unassigned:number};
type OfferForm={id?:string;product_id:string;name:string;units:number;price_mode:'tiers'|'fixed';fixed_price:string;code:string;landing_default:boolean};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';

export function WhatsAppAdsPage(){
 const [view,setView]=useState<View|null>(null);const [busy,setBusy]=useState(false);const [adding,setAdding]=useState(false);const [offerForm,setOfferForm]=useState<OfferForm|null>(null);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{api<View>('/api/whatsapp/ads').then(setView).catch(e=>setError((e as Error).message));},[]);
 async function run(task:()=>Promise<View|void>,ok?:string){setBusy(true);setError('');try{const r=await task();if(r)setView(r);if(ok)setNotice(ok);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const copy=(text:string)=>{void navigator.clipboard?.writeText(text).then(()=>setNotice('Mensaje copiado.'),()=>setError('No se pudo copiar. Selecciónalo y cópialo a mano.'));};
 if(!view)return <><WhatsAppTabs/><InlineLoading title="Cargando anuncios"/></>;
 const assign=(ad:Ad,offer:string)=>void run(()=>api<View>('/api/whatsapp/ads/'+ad.id,{method:'PUT',body:JSON.stringify({offer_id:offer||null})}),offer?'Oferta asignada. Los próximos clientes de este anuncio la verán.':'Anuncio sin oferta: el agente preguntará qué producto le interesa.');
 const offerOptions=(selected:string|null)=><><option value="">{selected?'Quitar la oferta':'Elegir oferta…'}</option>{view.offers.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</>;
 return <>
  <WhatsAppTabs/>
  <section className="panel webhook-current wa-ads">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="growth"/></span><div><span className="eyebrow">Click to WhatsApp</span><h2>Anuncios y ofertas</h2></div>{view.unassigned>0&&<span className="webhook-state off">{view.unassigned} sin asignar</span>}</div>
   <p className="small muted">Cada anuncio de Meta que lleva a WhatsApp se relaciona con una oferta. Así, aunque el cliente solo escriba «Hola», el agente ya sabe de qué hablarle. Meta envía el identificador del anuncio con el mensaje.</p>
   {!view.offers.length&&<p className="store-warning" role="note">Primero crea una oferta abajo; luego podrás asignarla a tus anuncios.</p>}
   <div className="table-scroll"><table className="wa-ads-table"><thead><tr><th>Anuncio</th><th>Identificador</th><th>Producto y oferta</th><th>Entradas 7 días</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>
    {view.ads.map(a=><tr key={a.id} className={a.status==='unassigned'?'is-unassigned':''}>
     <td><div className="wa-ad-name">{(a.source.image_url||a.source.thumbnail_url)?<img src={a.source.image_url||a.source.thumbnail_url} alt="" loading="lazy"/>:<span className="wa-ad-noimg" aria-hidden="true"><Icon name="image"/></span>}<div><strong>{a.name}</strong><small>{a.origin==='first_message'?(a.status==='unassigned'?`Llegó con el primer mensaje · ${when(a.first_seen_at)}`:'Asignado al primer mensaje'):'Identificador pegado antes de publicar'}</small>{a.source.body&&<small className="wa-ad-body">«{a.source.body}»</small>}</div></div></td>
     <td><code>{a.ad_id}</code></td>
     <td><label className="sr-only" htmlFor={'offer-'+a.id}>Oferta del anuncio</label><select id={'offer-'+a.id} value={a.offer?.id||''} disabled={busy||!view.offers.length} onChange={e=>assign(a,e.target.value)}>{offerOptions(a.offer?.id||null)}</select></td>
     <td className="wa-num">{a.entries_7d}</td>
     <td>{a.status==='unassigned'?<span className="wa-tag is-warn">Sin asignar · el agente pregunta</span>:a.status==='paused'?<span className="wa-tag is-muted">Pausado</span>:<span className="wa-tag is-ok">Activo</span>}</td>
     <td className="wa-row-actions">{a.status!=='unassigned'&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>api<View>('/api/whatsapp/ads/'+a.id,{method:'PUT',body:JSON.stringify({status:a.status==='paused'?'active':'paused'})}))}>{a.status==='paused'?'Activar':'Pausar'}</button>}<button className="secondary danger" disabled={busy} onClick={()=>void run(()=>api<View>('/api/whatsapp/ads/'+a.id,{method:'DELETE'}),'Anuncio quitado de la lista.')}>Quitar</button></td>
    </tr>)}
    {!view.ads.length&&<tr><td colSpan={6} className="wa-empty">Aún no hay anuncios. Aparecen solos cuando llega el primer cliente desde un anuncio, o puedes agregarlos antes.</td></tr>}
   </tbody></table></div>
   {adding?<form className="editor-form wa-inline-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{const r=await post<View>('/api/whatsapp/ads',{ad_id:f.get('ad_id'),name:f.get('name'),offer_id:f.get('offer_id')||null});setAdding(false);return r;},'Anuncio agregado.');}}>
     <label>Identificador del anuncio<input name="ad_id" required inputMode="numeric" pattern="[0-9]{6,32}" placeholder="Ej. 120210448812739902"/><span className="small muted">En el Administrador de anuncios: detalles del anuncio o columna «Identificador del anuncio».</span></label>
     <label>Nombre para reconocerlo<input name="name" required maxLength={160} placeholder="Ej. Anuncio B · Cepillo x2"/></label>
     <label>Oferta<select name="offer_id" defaultValue="">{offerOptions(null)}</select></label>
     <div className="row"><button className="primary" disabled={busy}>Agregar anuncio</button><button type="button" className="secondary" onClick={()=>setAdding(false)}>Cancelar</button></div>
    </form>:<div className="row"><button className="primary" disabled={busy} onClick={()=>setAdding(true)}>+ Agregar anuncio</button></div>}
  </section>
  <section className="panel webhook-current wa-offers">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="tag"/></span><div><span className="eyebrow">Qué vendes en cada anuncio</span><h2>Ofertas</h2></div></div>
   <p className="small muted">Una oferta es un producto con sus unidades (por ejemplo, combos de 2) y su precio: el de los tramos por cantidad del producto o un precio fijo. El precio lo calcula Tinbana; la IA solo lo repite.</p>
   <ul className="wa-offer-list">{view.offers.map(o=><li key={o.id}>
    <span className="wa-code">{o.code}</span><div><strong>{o.name}</strong><small>{o.label}{o.landing_default&&' · botón de WhatsApp de las landings'}</small></div>
    <div className="wa-row-actions"><button className="secondary" disabled={busy} onClick={()=>setOfferForm({id:o.id,product_id:o.product.id,name:o.name,units:o.units,price_mode:o.price_mode,fixed_price:o.fixed_price!==null?String(o.fixed_price):'',code:o.code,landing_default:o.landing_default})}>Editar</button><button className="secondary danger" disabled={busy} onClick={()=>void run(()=>api<View>('/api/whatsapp/offers/'+o.id,{method:'DELETE'}),'Oferta archivada.')}>Archivar</button></div>
   </li>)}{!view.offers.length&&<li className="wa-empty">Aún no tienes ofertas.</li>}</ul>
   {offerForm?<OfferEditor form={offerForm} products={view.products} busy={busy} onCancel={()=>setOfferForm(null)} onSave={f=>void run(async()=>{const body={product_id:f.product_id,name:f.name,units:f.units,price_mode:f.price_mode,fixed_price:f.price_mode==='fixed'?Number(f.fixed_price):null,code:f.code||null,landing_default:f.landing_default};const r=await api<View>(f.id?'/api/whatsapp/offers/'+f.id:'/api/whatsapp/offers',{method:f.id?'PUT':'POST',body:JSON.stringify(body)});setOfferForm(null);return r;},'Oferta guardada.')}/>
    :<div className="row"><button className="primary" disabled={busy||!view.products.length} onClick={()=>setOfferForm({product_id:view.products[0]?.id||'',name:'',units:1,price_mode:'tiers',fixed_price:'',code:'',landing_default:false})}>+ Nueva oferta</button>{!view.products.length&&<span className="small muted">Agrega primero un producto desde Explorar productos.</span>}</div>}
  </section>
  {view.offers.length>0&&<section className="panel webhook-current wa-messages-card">
   <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="chat"/></span><div><span className="eyebrow">Para pegar en Meta</span><h2>Mensaje predeterminado de cada oferta</h2></div></div>
   <p className="small muted">Pega este texto en «Mensaje predeterminado» del anuncio. El código sirve de respaldo cuando Meta no envía los datos del anuncio; como el cliente puede borrarlo o editarlo, se toma solo como indicio.</p>
   <ul className="wa-msg-list">{view.offers.map(o=><li key={o.id}><span className="wa-code">{o.code}</span><span className="wa-msg-label">{o.label}</span><input readOnly value={o.message} aria-label={'Mensaje de '+o.code} onFocus={e=>e.currentTarget.select()}/><button className="secondary" onClick={()=>copy(o.message)}>Copiar</button></li>)}</ul>
  </section>}
  <div className="wa-help-grid">
   <section className="panel webhook-current"><div className="webhook-head"><div><span className="eyebrow">Guía</span><h2>Configurar un anuncio nuevo</h2></div></div>
    <h3 className="wa-help-title">En Meta (Administrador de anuncios)</h3>
    <ol className="wa-steps"><li>Crea la campaña y en «Ubicación de la conversión» elige <strong>Apps de mensajes → WhatsApp</strong>.</li><li>Elige el número de tu tienda.</li><li>En «Mensaje predeterminado» pega el texto de la oferta (lo copias arriba).</li><li>Publica el anuncio.</li></ol>
    <h3 className="wa-help-title">En Tinbana, elige una forma</h3>
    <div className="wa-ways"><div><strong>Asignarlo al primer mensaje</strong> <span className="wa-tag is-ok">Recomendado</span><p className="small muted">No copias nada. Cuando llegue el primer cliente, el anuncio aparece arriba en amarillo con el título y la imagen que envía Meta, y eliges su oferta.</p></div><div><strong>Dejarlo listo antes de publicar</strong><p className="small muted">Copia el identificador del anuncio en Meta y pégalo con «Agregar anuncio».</p></div></div>
   </section>
   <section className="panel webhook-current"><div className="webhook-head"><div><span className="eyebrow">Sin adivinar</span><h2>Cómo se reconoce el producto</h2></div></div>
    <p className="small muted">El agente sigue este orden y nunca elige el producto más vendido por defecto.</p>
    <ol className="wa-steps"><li>Identificador del anuncio recibido con el mensaje, buscado en esta tabla.</li><li>Código de oferta del botón de WhatsApp de la landing (lleva una firma que Tinbana comprueba).</li><li>Código escrito en el mensaje: se toma como indicio y el agente lo confirma, porque el cliente pudo editarlo.</li><li>Sin relación clara: el agente pregunta qué producto le interesa.</li></ol>
    <p className="small muted">Si la persona llega por otro anuncio, se guarda como una entrada nueva y no cambia un pedido anterior; si tenía una compra en curso, el agente le pregunta si quiere continuarla o empezar otra.</p>
   </section>
  </div>
 </>;
}

function OfferEditor({form,products,busy,onCancel,onSave}:{form:OfferForm;products:{id:string;name:string|null}[];busy:boolean;onCancel:()=>void;onSave:(f:OfferForm)=>void}){
 const [f,setF]=useState(form);
 return <form className="editor-form wa-inline-form" onSubmit={e=>{e.preventDefault();onSave(f);}}>
  <h3>{f.id?'Editar oferta':'Nueva oferta'}</h3>
  <label>Producto<select value={f.product_id} disabled={!!f.id} onChange={e=>setF({...f,product_id:e.target.value})}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Nombre de la oferta<input required maxLength={160} value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Ej. el picatodo eléctrico"/><span className="small muted">Se usa en el mensaje: «Hola, quiero {f.name||'…'} ({f.code||'TB-…'})».</span></label>
  <label>Unidades<input type="number" min={1} max={99} required value={f.units} onChange={e=>setF({...f,units:Number(e.target.value)})}/></label>
  <fieldset className="wa-choices-row"><legend>Precio</legend>
   <label className="wa-check"><input type="radio" name="price_mode" checked={f.price_mode==='tiers'} onChange={()=>setF({...f,price_mode:'tiers'})}/>Tramos por cantidad del producto (Mis productos → Ofertas)</label>
   <label className="wa-check"><input type="radio" name="price_mode" checked={f.price_mode==='fixed'} onChange={()=>setF({...f,price_mode:'fixed'})}/>Precio fijo para esta oferta</label>
   {f.price_mode==='fixed'&&<label>Precio total (COP)<input type="number" min={0} step={100} required value={f.fixed_price} onChange={e=>setF({...f,fixed_price:e.target.value})} placeholder="Ej. 99000"/></label>}
  </fieldset>
  <label>Código <span className="muted">(opcional)</span><input maxLength={15} value={f.code} onChange={e=>setF({...f,code:e.target.value.toUpperCase()})} placeholder="Se genera solo, ej. TB-PICA1"/></label>
  <label className="wa-check"><input type="checkbox" checked={f.landing_default} onChange={e=>setF({...f,landing_default:e.target.checked})}/>Usar en el botón de WhatsApp de las landings de este producto</label>
  <div className="row"><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar oferta'}</button><button type="button" className="secondary" onClick={onCancel}>Cancelar</button></div>
 </form>;
}
