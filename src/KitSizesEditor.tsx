import {money} from './api';
import type {KitSize} from './types';

// Phase B: sizes of «Arma tu kit» (name, number of pieces and fixed price). The pieces are the block's elements.
const uid=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));

export function KitSizesEditor({sizes,publicPrice,onChange}:{sizes:KitSize[];publicPrice:number|null;onChange:(s:KitSize[])=>void}){
 const edit=(id:string,v:Partial<KitSize>)=>onChange(sizes.map(s=>s.id===id?{...s,...v}:s));
 return <section className="builder-items kit-sizes-editor">
  <div className="properties-subheading"><h4>Tamaños del kit</h4><span>{sizes.length} / 6</span></div>
  <p className="builder-hint">El precio es fijo por tamaño, sin importar qué piezas elija el cliente. Sin precio, se usa el de la landing ({money(publicPrice)}). Se pide un kit por pedido.</p>
  {sizes.map((s,i)=><div className="kit-size-row" key={s.id}>
   <label>Nombre<input value={s.label} maxLength={60} placeholder={'Kit de '+(i===0?3:6)} onChange={e=>edit(s.id,{label:e.target.value})}/></label>
   <label>Piezas<input type="number" min={1} max={30} value={s.pieces} onChange={e=>edit(s.id,{pieces:Math.max(1,Math.min(30,Math.round(Number(e.target.value)||1)))})}/></label>
   <label>Precio (COP)<input type="number" min={0} step="0.01" value={s.price??''} placeholder="Precio de la landing" onChange={e=>edit(s.id,{price:e.target.value===''?null:Number(e.target.value)})}/></label>
   <button type="button" className="secondary" disabled={sizes.length<=1} onClick={()=>onChange(sizes.filter(x=>x.id!==s.id))} aria-label={'Quitar '+(s.label||'tamaño')}>Quitar</button>
  </div>)}
  <button type="button" className="builder-add-item" disabled={sizes.length>=6} onClick={()=>onChange([...sizes,{id:uid(),label:'Kit de '+(sizes.length?sizes[sizes.length-1].pieces*2:3),pieces:sizes.length?sizes[sizes.length-1].pieces*2:3,price:null}])}>+ Agregar tamaño</button>
 </section>;
}
