import {isSoldOut,SoldOutBadge} from './ProductVariants';
import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {api,post,money} from './api';
import {useFeedbackState} from './Notifications';
import {InlineLoading} from './Loading';
import {Icon} from './ui';
import {Chips} from './compact';
import type {Selected,Landing} from './types';
import './compact.css';

type Filter='all'|'published'|'draft'|'none';
const stateOf=(p:Selected):Exclude<Filter,'all'>=>p.publication_status==='published'?'published':p.landing_id?'draft':'none';
const stateLabel={published:'Publicada',draft:'Borrador',none:'Seleccionado'};

export function MyProducts(){
 const [items,setItems]=useState<Selected[]>([]);const [error,setError]=useFeedbackState('error');const [notice,setNotice]=useFeedbackState('success');const [busy,setBusy]=useState<string|null>(null);const [loading,setLoading]=useState(true);const [filter,setFilter]=useState<Filter>('all');const [query,setQuery]=useState('');const navigate=useNavigate();
 async function load(){try{const r=await api<{products:Selected[]}>('/api/products');setItems(r.products);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function act(p:Selected,action:string){setBusy(p.id);setError('');try{if(action==='landing'){const r=await post<{landing:Landing}>('/api/products/'+p.id+'/landing');navigate('/panel/landings/'+r.landing.id);}if(action==='delete'){await api('/api/products/'+p.id,{method:'DELETE'});await load();}if(action==='refresh'){const r=await post<{message:string}>('/api/products/'+p.id+'/refresh');setNotice(r.message);await load();}}catch(e){setError((e as Error).message);}finally{setBusy(null);}}
 const counts=useMemo(()=>({all:items.length,published:items.filter(p=>stateOf(p)==='published').length,draft:items.filter(p=>stateOf(p)==='draft').length,none:items.filter(p=>stateOf(p)==='none').length}),[items]);
 const visible=useMemo(()=>{const q=query.trim().toLowerCase();return items.filter(p=>(filter==='all'||stateOf(p)===filter)&&(!q||p.product.name.toLowerCase().includes(q)||p.dropi_id.toLowerCase().includes(q)));},[items,filter,query]);
 return <>
  <div className="section-heading"><div><span className="eyebrow">Tu selección</span><h1>Mis productos</h1></div><Link className="secondary" to="/panel/catalogo">Explorar catálogo ↗</Link></div>
  <p className="muted">Tu selección se conserva entre páginas y sesiones. Cada landing empieza como borrador.</p>
  {loading?<InlineLoading title="Preparando tus productos" description="Estamos consultando tu selección guardada."/>:items.length===0?<div className="empty"><h3>Aún no has seleccionado productos</h3><Link to="/panel/catalogo">Explorar productos →</Link></div>:<>
   <div className="cx-toolbar"><Chips label="Filtrar por estado" value={filter} onChange={setFilter} items={[{value:'all',label:'Todos',count:counts.all},{value:'published',label:'Publicadas',count:counts.published},{value:'draft',label:'Borradores',count:counts.draft},{value:'none',label:'Sin landing',count:counts.none}]}/><label className="cx-search"><Icon name="search"/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por nombre o ID" aria-label="Buscar en mis productos"/></label></div>
   {visible.length===0?<div className="empty"><h3>No hay productos con ese filtro</h3><button type="button" className="text-button" onClick={()=>{setFilter('all');setQuery('');}}>Limpiar filtros</button></div>:<div className="selected-list pc-grid">{visible.map(p=>{const s=stateOf(p);return <article className="panel selected-row pc-card" key={p.id}>
    <div className="pc-media">{p.product.images[0]?<img src={p.product.images[0]} alt="" loading="lazy"/>:<div className="image-placeholder"><Icon name="image"/>Sin imagen</div>}<span className={'pill pc-state pc-'+s}>{stateLabel[s]}</span>{isSoldOut(p.product)&&<SoldOutBadge className="on-media"/>}</div>
    <div className="pc-body"><h3 title={p.product.name}>{p.product.name}</h3><p className="pc-meta"><span>ID {p.dropi_id}</span><strong title="Precio Dropi">{money(p.product.price)}</strong></p>{s==='published'&&<a className="pc-public" href={p.public_url||'/p/'+p.slug} target="_blank" rel="noreferrer"><Icon name="external"/>Abrir página pública</a>}</div>
    <div className="pc-actions"><button className="primary" disabled={busy!==null} onClick={()=>void act(p,'landing')}>{busy===p.id?'Procesando…':p.landing_id?'Editar landing':'Crear landing'}</button><div className="pc-icons"><Link className="pc-icon" to={'/panel/productos/'+p.id+'/ofertas'} aria-label="Precios por cantidad" title="Precios por cantidad"><Icon name="tag"/></Link><button type="button" className="pc-icon" disabled={busy!==null} onClick={()=>void act(p,'refresh')} aria-label="Actualizar datos Dropi" title="Actualizar datos Dropi"><Icon name="refresh"/></button>{!p.landing_id&&<button type="button" className="pc-icon pc-danger" disabled={busy!==null} onClick={()=>void act(p,'delete')} aria-label="Quitar selección" title="Quitar selección"><Icon name="trash"/></button>}</div></div>
   </article>;})}</div>}
  </>}
 </>;
}
