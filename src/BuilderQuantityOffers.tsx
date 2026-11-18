import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api,money} from './api';
import type {Commerce} from './types';

// Phase A: the product's quantity offers («Precios por cantidad») shown on the landing as pack cards.
// The tiers live in the product; the landing only turns them on and picks the «Más elegido» pack.
type Offers={version:number;settings:{active:boolean;tiers:{min_quantity:number;unit_price:string}[];starts_at:string|null;ends_at:string|null}};

export function BuilderQuantityOffers({productId,commerce,onChange}:{productId:string;commerce:Commerce;onChange:(c:Commerce)=>void}){
 const [offers,setOffers]=useState<Offers|null>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{api<Offers>('/api/products/'+productId+'/offers').then(setOffers).catch(()=>setFailed(true));},[productId]);
 const on=commerce.quantityOffers??false;const tiers=offers?.settings.tiers||[];
 const usable=tiers.filter(t=>t.min_quantity<=commerce.maxQuantity);const active=!!offers?.settings.active&&usable.length>0;
 const link=<Link to={'/panel/productos/'+productId+'/ofertas'}>Mis productos → Precios por cantidad</Link>;
 return <div className="builder-offers">
  <label className="builder-toggle"><input type="checkbox" checked={on} onChange={e=>onChange({...commerce,quantityOffers:e.target.checked})}/>Mostrar ofertas por cantidad (paquetes)</label>
  {on&&<>
   {failed&&<p className="builder-hint builder-warn" role="note">No se pudieron leer las ofertas del producto.</p>}
   {offers&&!active&&<p className="builder-hint builder-warn" role="note">Este producto no tiene una oferta activa{tiers.length&&!usable.length?' dentro de la cantidad máxima de la landing':''}. Créala en {link} (por ejemplo, desde 1 unidad $120.000 y desde 2 unidades $100.000 c/u).</p>}
   {!commerce.quantityEnabled&&<p className="builder-hint builder-warn" role="note">Activa «Permitir elegir cantidad» en «Botón y cantidad» para mostrar los paquetes.</p>}
   {active&&<>
    <div className="builder-offers-list">{usable.map(t=><span key={t.min_quantity}><strong>{t.min_quantity} {t.min_quantity===1?'unidad':'unidades'}</strong> · {money(Number(t.unit_price))}{t.min_quantity>1?' c/u':''}</span>)}</div>
    <label>Paquete destacado («Más elegido»)<select value={commerce.offerHighlight??''} onChange={e=>onChange({...commerce,offerHighlight:e.target.value===''?null:Number(e.target.value)})}><option value="">Ninguno</option>{usable.map(t=><option key={t.min_quantity} value={t.min_quantity}>{t.min_quantity} {t.min_quantity===1?'unidad':'unidades'}</option>)}</select></label>
    <p className="builder-hint">Los precios salen de {link}. El precio del paquete se aplica al pedido en el servidor y vale para cualquier variante; si el cliente paga en línea, el descuento de Wompi se suma.</p>
   </>}
  </>}
 </div>;
}
