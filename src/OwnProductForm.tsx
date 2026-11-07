import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {api,post,money} from './api';
import {useFeedbackState} from './Notifications';
import {InlineLoading} from './Loading';
import {ImageUpload} from './ImageUpload';
import {Icon} from './ui';
import './own-product.css';

/** Own product (created from scratch, without Dropi): the store sells it, keeps its stock and ships it. Backend: OwnProducts.php. */
type Option={name:string;values:string};
type VariantRow={price:string;stock:string;sku:string};
type Saved={id:string;name:string;description:string;price:number;cost:number|null;sku:string;images:string[];options:{name:string;values:string[]}[];variants:{key:string;values:string[];price:number|null;stock:number|null;sku:string}[];track_stock:boolean;stock:number|null;landing_id:string|null};
const MAX_IMAGES=12,MAX_OPTIONS=3,MAX_VARIANTS=100;
const split=(v:string)=>{const out:string[]=[];for(const raw of v.split(',')){const x=raw.trim().replace(/\s+/g,' ');if(x&&!out.some(o=>o.toLowerCase()===x.toLowerCase()))out.push(x);}return out;};
const num=(v:string)=>v.trim()===''?null:Number(v.replace(',','.'));
const keyOf=(values:string[])=>values.join('|').toLowerCase();

export function OwnProductForm(){
 const {id}=useParams();const editing=!!id;const navigate=useNavigate();
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 const [loading,setLoading]=useState(editing),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[landingId,setLandingId]=useState<string|null>(null);
 const [name,setName]=useState(''),[description,setDescription]=useState(''),[price,setPrice]=useState(''),[cost,setCost]=useState(''),[sku,setSku]=useState(''),[images,setImages]=useState<string[]>([]);
 const [track,setTrack]=useState(false),[stock,setStock]=useState(''),[options,setOptions]=useState<Option[]>([]),[rows,setRows]=useState<Record<string,VariantRow>>({});
 function fill(p:Saved){setName(p.name);setDescription(p.description);setPrice(String(p.price));setCost(p.cost==null?'':String(p.cost));setSku(p.sku||'');setImages(p.images);setTrack(p.track_stock);setStock(p.stock==null?'':String(p.stock));
  setOptions(p.options.map(o=>({name:o.name,values:o.values.join(', ')})));setRows(Object.fromEntries(p.variants.map(v=>[keyOf(v.values),{price:v.price==null?'':String(v.price),stock:v.stock==null?'':String(v.stock),sku:v.sku||''}])));setLandingId(p.landing_id);}
 useEffect(()=>{if(!id)return;const ctl=new AbortController();api<{product:Saved}>('/api/products/'+id+'/own',{signal:ctl.signal}).then(r=>fill(r.product)).catch(e=>{if(e.name!=='AbortError'){setFailed(true);setError(e.message);}}).finally(()=>setLoading(false));return()=>ctl.abort();},[id]);
 // One variant per combination of the option values, the same way the server builds them.
 const groups=useMemo(()=>options.map(o=>({name:o.name.trim(),values:split(o.values)})).filter(g=>g.name&&g.values.length),[options]);
 const combos=useMemo(()=>{if(!groups.length)return [] as string[][];let out:string[][]=[[]];for(const g of groups)out=out.flatMap(c=>g.values.map(v=>[...c,v]));return out;},[groups]);
 const tooMany=combos.length>MAX_VARIANTS;
 const priceN=num(price),costN=num(cost);const margin=priceN!=null&&costN!=null&&priceN>0?priceN-costN:null;
 const row=(k:string)=>rows[k]||{price:'',stock:'',sku:''};
 const setRow=(k:string,patch:Partial<VariantRow>)=>setRows(r=>({...r,[k]:{...row(k),...patch}}));
 const totalStock=track&&combos.length?combos.reduce((t,c)=>t+(Number(row(keyOf(c)).stock)||0),0):null;
 function body(){return {name,description,price:priceN,cost:costN,sku,images,track_stock:track,stock:track&&!combos.length?(stock.trim()===''?0:Number(stock)):null,
  options:options.filter(o=>o.name.trim()||o.values.trim()).map(o=>({name:o.name,values:split(o.values)})),
  variants:combos.map(c=>{const r=row(keyOf(c));return {key:c.join('|'),price:num(r.price),stock:track?(r.stock.trim()===''?0:Number(r.stock)):null,sku:r.sku};})};}
 async function save(then:'stay'|'landing'){
  if(busy||uploading)return;if(tooMany){setError('Reduce las opciones: el máximo es '+MAX_VARIANTS+' combinaciones.');return;}
  setBusy(true);try{
   const r=editing?await api<{product:Saved;message:string}>('/api/products/'+id+'/own',{method:'PUT',body:JSON.stringify(body())}):await post<{id:string;product:Saved}>('/api/products/own',body());
   fill(r.product);
   if(then==='landing'){const l=await post<{landing:{id:string}}>('/api/products/'+r.product.id+'/landing');navigate('/panel/landings/'+l.landing.id);return;}
   if(!editing){setNotice('Producto creado. Ya puedes crear su landing.');navigate('/panel/productos/'+r.product.id+'/editar',{replace:true});}
   else setNotice((r as {message?:string}).message||'Producto guardado.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(loading||failed)return <><Link className="order-back" to="/panel/productos">← Volver a mis productos</Link>{failed?<div className="empty"><h1>No pudimos cargar el producto</h1><button onClick={()=>location.reload()}>Volver a intentar</button></div>:<InlineLoading title="Cargando el producto"/>}</>;
 return <form className="op" onSubmit={e=>{e.preventDefault();void save('stay');}}>
  <Link className="order-back" to="/panel/productos">← Volver a mis productos</Link>
  <div className="section-heading"><div><span className="eyebrow">Producto propio</span><h1>{editing?'Editar producto':'Crear producto'}</h1></div></div>
  <p className="muted op-lead">Lo vendes tú y lo despachas tú: no pasa por Dropi. Tinbana guarda los pedidos, descuenta el stock y avisa al cliente en cada paso del envío.</p>
  <div className="op-layout"><div className="op-main">
   <section className="panel op-card"><h2><Icon name="box"/>Datos del producto</h2>
    <label>Nombre<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder="Ej.: Lámpara de escritorio recargable"/></label>
    <label>Descripción<textarea rows={6} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Qué es, para quién es y qué incluye. La landing empieza con este texto y luego lo puedes mejorar."/></label>
    <label>SKU o referencia <small>(opcional)</small><input maxLength={120} value={sku} onChange={e=>setSku(e.target.value)}/></label>
   </section>
   <section className="panel op-card op-photos">
    <ImageUpload landingId="" uploadUrl="/api/media" max={MAX_IMAGES} title="Fotos del producto" subtitle="La primera es la principal. Se guardan en Mis archivos y la landing empieza con ellas." images={images} onChange={setImages} onBusyChange={setUploading}/>
   </section>
   <section className="panel op-card"><h2><Icon name="grid"/>Variantes <small>(opcional)</small></h2><p className="op-hint">Por ejemplo Color: Negro, Blanco y Talla: S, M, L. Se crea una variante por cada combinación.</p>
    {options.map((o,i)=><div className="op-option" key={i}><label>Opción<input maxLength={40} value={o.name} onChange={e=>setOptions(list=>list.map((x,j)=>j===i?{...x,name:e.target.value}:x))} placeholder="Color"/></label><label>Valores separados por coma<input value={o.values} onChange={e=>setOptions(list=>list.map((x,j)=>j===i?{...x,values:e.target.value}:x))} placeholder="Negro, Blanco, Azul"/></label><button type="button" className="pc-icon pc-danger" aria-label={'Quitar la opción '+(o.name||i+1)} onClick={()=>setOptions(list=>list.filter((_,j)=>j!==i))}><Icon name="trash"/></button></div>)}
    {options.length<MAX_OPTIONS&&<button type="button" className="secondary op-add" onClick={()=>setOptions(list=>[...list,{name:'',values:''}])}><Icon name="plus"/>Añadir opción</button>}
    {tooMany&&<p className="store-warning" role="alert">Esas opciones dan {combos.length} combinaciones. El máximo es {MAX_VARIANTS}.</p>}
    {!!combos.length&&!tooMany&&<div className="op-table-wrap"><table className="op-table"><thead><tr><th scope="col">Variante</th><th scope="col">Precio <small>(vacío = {priceN?money(priceN):'el del producto'})</small></th>{track&&<th scope="col">Stock</th>}<th scope="col">SKU</th></tr></thead>
     <tbody>{combos.map(c=>{const k=keyOf(c),r=row(k);return <tr key={k}><th scope="row">{c.join(' · ')}</th><td><input type="number" min="1" step="any" inputMode="decimal" aria-label={'Precio de '+c.join(' · ')} value={r.price} onChange={e=>setRow(k,{price:e.target.value})}/></td>{track&&<td><input type="number" min="0" step="1" inputMode="numeric" aria-label={'Stock de '+c.join(' · ')} value={r.stock} onChange={e=>setRow(k,{stock:e.target.value})} placeholder="0"/></td>}<td><input maxLength={120} aria-label={'SKU de '+c.join(' · ')} value={r.sku} onChange={e=>setRow(k,{sku:e.target.value})}/></td></tr>;})}</tbody></table></div>}
   </section>
  </div><aside className="op-side">
   <section className="panel op-card"><h2><Icon name="tag"/>Precio</h2>
    <label>Precio de venta (COP)<input required type="number" min="1" step="any" inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label>
    <label>Costo por unidad <small>(opcional, solo lo ves tú)</small><input type="number" min="0" step="any" inputMode="decimal" value={cost} onChange={e=>setCost(e.target.value)}/></label>
    {margin!=null&&<p className={'op-margin'+(margin<0?' is-bad':'')}><span>Ganancia por unidad</span><strong>{money(margin)}</strong></p>}
    <p className="op-hint">La landing empieza con este precio. Después lo puedes cambiar en la landing sin tocar el producto.</p>
   </section>
   <section className="panel op-card"><h2><Icon name="truck"/>Stock</h2>
    <label className="op-check"><input type="checkbox" checked={track} onChange={e=>setTrack(e.target.checked)}/><span><strong>Controlar stock</strong><small>Baja cuando un pedido se confirma y vuelve si se cancela o se devuelve. Con 0 la landing muestra «Agotado».</small></span></label>
    {track&&!combos.length&&<label>Unidades disponibles<input type="number" min="0" step="1" inputMode="numeric" value={stock} onChange={e=>setStock(e.target.value)} placeholder="0"/></label>}
    {track&&!!combos.length&&<p className="op-hint">Stock por variante en la tabla. Total: <strong>{totalStock}</strong> unidades.</p>}
    {!track&&<p className="op-hint">Sin control de stock, el producto siempre está a la venta.</p>}
   </section>
   <div className="op-actions">
    {landingId?<><button className="primary" disabled={busy||uploading}>{busy?'Guardando…':'Guardar cambios'}</button><Link className="secondary" to={'/panel/landings/'+landingId}>Editar la landing</Link></>
     :<><button type="button" className="primary" disabled={busy||uploading} onClick={()=>void save('landing')}>{busy?'Guardando…':'Guardar y crear landing'}</button><button className="secondary" disabled={busy||uploading}>Solo guardar</button></>}
    {uploading&&<p className="op-hint" role="status">Espera a que terminen de subir las fotos.</p>}
   </div>
  </aside></div>
 </form>;
}
