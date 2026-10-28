import {money} from './api';
import {MediaPickerButton} from './MediaLibrary';
import type {Product,VariantSettings} from './types';
import './builder-variants.css';

type Item={price:number|null;image:string;hidden:boolean};
const blank:Item={price:null,image:'',hidden:false};
const units=(n:number|null)=>n===null?'Stock sin dato':n===0?'Agotada':new Intl.NumberFormat('es-CO').format(n)+' und.';

/**
 * Variants of the landing: photo per value of the first option (e.g. per color), and per variant its own public
 * price and whether it is offered. They come from the saved Dropi product; «Actualizar desde Dropi» renews them.
 */
export function BuilderVariants({product,value,publicPrice,images,onChange}:{product:Product;value:VariantSettings|undefined;publicPrice:number|null;images:string[];onChange:(v:VariantSettings)=>void}){
 const variants=product.variants||[];const items=value?.items||{};
 if(!variants.length)return product.type==='VARIABLE'?<section className="bv"><h3>Variantes</h3><p className="bv-note">Este producto tiene variantes en Dropi. Ve a <strong>Mis productos</strong> y pulsa <strong>Actualizar desde Dropi</strong> para traerlas aquí.</p></section>:null;
 const get=(id:string):Item=>({...blank,...items[id]});
 const set=(ids:string[],patch:Partial<Item>)=>{const next={...items};for(const id of ids){const v={...get(id),...patch};if(v.price===null&&v.image===''&&!v.hidden)delete next[id];else next[id]=v;}onChange({items:next});};
 const first=variants[0].options[0]?.name;
 const groups=first?[...new Set(variants.map(v=>v.options.find(o=>o.name===first)?.value).filter((x):x is string=>!!x))]:[];
 const shown=variants.filter(v=>!get(v.id).hidden).length;
 const imageOf=(id:string)=>get(id).image||variants.find(v=>v.id===id)?.image||'';
 return <section className="bv" aria-labelledby="bv-title">
  <div className="bv-head"><h3 id="bv-title">Variantes</h3><span className="bv-count">{shown} de {variants.length} a la venta</span></div>
  <p className="bv-note">Tu cliente elige {[...new Set(variants.flatMap(v=>v.options.map(o=>o.name.toLowerCase())))].join(' y ')||'una opción'} al pedir. Sin precio propio, cada variante usa el precio público{publicPrice!==null?` (${money(publicPrice)})`:''}.</p>
  {groups.length>1&&<div className="bv-photos"><span className="bv-label">Foto por {first?.toLowerCase()}</span>
   <ul>{groups.map(g=>{const ids=variants.filter(v=>v.options.some(o=>o.name===first&&o.value===g)).map(v=>v.id);const img=imageOf(ids[0]);const own=ids.some(id=>get(id).image);return <li key={g}>
    <span className="bv-thumb">{img?<img src={img} alt=""/>:<span aria-hidden="true">—</span>}</span>
    <div className="bv-photo-body"><strong>{g}</strong>
     <div className="bv-photo-actions"><label className="bv-select"><span className="sr-only">Foto para {g}</span><select value={images.includes(get(ids[0]).image)?get(ids[0]).image:''} onChange={e=>set(ids,{image:e.target.value})}><option value="">{own&&!images.includes(get(ids[0]).image)?'Foto elegida':'Foto del producto'}</option>{images.map((url,i)=><option key={url+i} value={url}>{i===0?'Imagen principal':'Imagen '+(i+1)}</option>)}</select></label>
      <MediaPickerButton label="Subir o elegir" selected={own?[get(ids[0]).image]:[]} onChoose={url=>set(ids,{image:url})}/>
      {own&&<button type="button" className="bv-link" onClick={()=>set(ids,{image:''})}>Quitar</button>}</div></div>
   </li>;})}</ul></div>}
  <div className="bv-bulk"><button type="button" className="secondary" disabled={shown===variants.length} onClick={()=>set(variants.map(v=>v.id),{hidden:false})}>Mostrar todas</button><button type="button" className="secondary" disabled={!variants.some(v=>v.stock===0&&!get(v.id).hidden)} onClick={()=>set(variants.filter(v=>v.stock===0).map(v=>v.id),{hidden:true})}>Ocultar agotadas</button></div>
  <ul className="bv-list">{variants.map(v=>{const it=get(v.id);return <li key={v.id} className={it.hidden?'is-hidden':''}>
   <label className="bv-switch"><input type="checkbox" checked={!it.hidden} onChange={e=>set([v.id],{hidden:!e.target.checked})}/><span className="sr-only">Vender {v.label}</span></label>
   <div className="bv-name"><strong>{v.label}</strong><small className={v.stock===0?'is-out':''}>{units(v.stock)} · Dropi {money(v.price)}</small></div>
   <label className="bv-price"><span className="sr-only">Precio público de {v.label}</span><span aria-hidden="true">$</span><input type="number" min="1" max="999999999" step="1" inputMode="numeric" disabled={it.hidden} placeholder={publicPrice!==null?String(publicPrice):'Precio'} value={it.price??''} onChange={e=>set([v.id],{price:e.target.value===''?null:Number(e.target.value)})}/></label>
  </li>;})}</ul>
  <p className="bv-note">Al pulsar <strong>Actualizar desde Dropi</strong> en Mis productos se traen las variantes nuevas, el stock y se quitan las que Dropi ya no vende. Tus precios y fotos se conservan.</p>
 </section>;
}
