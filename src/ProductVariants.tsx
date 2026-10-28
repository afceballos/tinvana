import {money} from './api';
import type {ProductVariant} from './types';
import './product-variants.css';

/** Variants of a Dropi product: its options as chips and a compact table with price, suggested price and stock. */
export function ProductVariants({variants}:{variants:ProductVariant[]}){
 if(!variants.length)return null;
 const options=new Map<string,string[]>();
 for(const v of variants)for(const o of v.options){const list=options.get(o.name)||[];if(!list.includes(o.value))list.push(o.value);options.set(o.name,list);}
 const stock=(n:number|null)=>n===null?'—':new Intl.NumberFormat('es-CO').format(n);
 return <section className="pv" aria-label="Variantes del producto">
  <div className="pv-head"><strong>Variantes</strong><span className="pv-count">{variants.length}</span></div>
  {[...options].map(([name,values])=><div className="pv-option" key={name}><span>{name}</span><ul className="pv-chips">{values.map(v=><li key={v}>{v}</li>)}</ul></div>)}
  <details className="pv-details"><summary>Ver precio y stock de cada variante</summary>
   <div className="pv-table-wrap" tabIndex={0} role="region" aria-label="Precio y stock por variante"><table className="pv-table"><thead><tr><th scope="col">Variante</th><th scope="col">Precio Dropi</th><th scope="col">Sugerido</th><th scope="col">Stock</th></tr></thead>
    <tbody>{variants.map(v=><tr key={v.id}><th scope="row">{v.label}</th><td>{money(v.price)}</td><td>{money(v.suggestedPrice)}</td><td className={v.stock===0?'pv-out':''}>{v.stock===0?'Agotado':stock(v.stock)}</td></tr>)}</tbody></table></div>
  </details>
 </section>;
}
