import {useEffect,useRef,useState} from 'react';
import gsap from 'gsap';

/** Example profit per cash-on-delivery order, computed only in the browser (nothing is saved or sent).
 *  A returned order loses the outbound and return freight; revenue only counts when the order is delivered. */
const money=(n:number)=>(n<0?'−':'')+'$'+Math.round(Math.abs(n)).toLocaleString('es-CO');

function Animated({value}:{value:number}){
 const ref=useRef<HTMLElement>(null);const current=useRef(value);
 useEffect(()=>{const el=ref.current!;if(matchMedia('(prefers-reduced-motion: reduce)').matches){current.current=value;el.textContent=money(value);return;}
  const o={v:current.current};const tw=gsap.to(o,{v:value,duration:.6,ease:'power3.out',onUpdate:()=>{el.textContent=money(o.v);},onComplete:()=>{current.current=value;}});return()=>{tw.kill();current.current=o.v;};},[value]);
 return <strong ref={ref}>{money(value)}</strong>;
}

export function Calculator(){
 const [v,setV]=useState({price:89900,cost:35000,freight:12000,ads:8000,rate:75});
 const set=(k:keyof typeof v)=>(e:React.ChangeEvent<HTMLInputElement>)=>{const n=Number(e.target.value.replace(/\D/g,''));setV(s=>({...s,[k]:Number.isFinite(n)?Math.min(k==='rate'?100:99999999,n):0}));};
 const delivered=v.price-v.cost-v.freight-v.ads;
 const returned=-(v.freight*2)-v.ads;
 const expected=(v.rate/100)*delivered+(1-v.rate/100)*returned;
 const field=(k:'price'|'cost'|'freight'|'ads',label:string)=><label className="calc-field">{label}<input inputMode="numeric" value={v[k].toLocaleString('es-CO')} onChange={set(k)} aria-label={label}/></label>;
 return <>
  <span className="badge">Ejemplo</span>
  <h3>Utilidad por pedido</h3>
  <div className="calc-fields">
   {field('price','Precio de venta')}{field('cost','Costo del producto')}{field('freight','Flete')}{field('ads','Anuncios por pedido')}
   <label className="calc-field calc-wide">Pedidos que se entregan: {v.rate} %<input type="range" min={30} max={100} step={1} value={v.rate} onChange={set('rate')}/></label>
  </div>
  <div className="calc-out">
   <div className={'main'+(expected<0?' neg':'')}><span>Utilidad esperada por pedido</span><Animated value={expected}/></div>
   <div className={delivered<0?'neg':''}><span>Si se entrega</span><Animated value={delivered}/></div>
   <div className="neg"><span>Si se devuelve</span><Animated value={returned}/></div>
  </div>
  <p className="calc-note">Supone que una devolución paga flete de ida y vuelta y que el producto vuelve a bodega. No incluye la comisión de recaudo.</p>
 </>;
}
