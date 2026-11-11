import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import './product-tour.css';

// Guided tour of the panel, without libraries: a spotlight over the current element (the rest darkened) and a card
// with the panel's own type, colors, radius and shadow. Steps whose element is not on screen (plan, role) are skipped.
export type TourStep={target:string;title:string;text:string;nav?:boolean};

const GAP=14,EDGE=12;
const visible=(el:Element|null):el is HTMLElement=>!!el&&(el as HTMLElement).offsetParent!==null&&el.getBoundingClientRect().width>0;
const find=(selector:string)=>Array.from(document.querySelectorAll(selector)).find(visible)||null;

export function ProductTour({steps,open,onClose,onNav}:{steps:TourStep[];open:boolean;onClose:()=>void;onNav:(show:boolean)=>void}){
 const [index,setIndex]=useState(0);const [rect,setRect]=useState<DOMRect|null>(null);const [place,setPlace]=useState<{top:number;left:number;side:string}|null>(null);
 const card=useRef<HTMLDivElement>(null);const next=useRef<HTMLButtonElement>(null);const back=useRef<HTMLElement|null>(null);
 // Only the steps whose element exists right now, so «Paso 1 de N» stays true for this account.
 const [list,setList]=useState<TourStep[]>([]);
 useEffect(()=>{if(!open)return;back.current=document.activeElement as HTMLElement|null;onNav(true);setIndex(0);
  const id=window.setTimeout(()=>setList(steps.filter(s=>document.querySelector(s.target))),260);return()=>window.clearTimeout(id);},[open]);
 const step=list[index];
 const measure=useCallback(()=>{
  if(!step){setRect(null);return;}const el=find(step.target);if(!el){setRect(null);return;}
  const r=el.getBoundingClientRect();setRect(r);const c=card.current;const w=c?.offsetWidth||320,h=c?.offsetHeight||170,vw=window.innerWidth,vh=window.innerHeight;
  // Right of the element when there is room (sidebar), otherwise below or above; always inside the screen.
  let side='right',left=r.right+GAP,top=r.top+r.height/2-h/2;
  if(left+w>vw-EDGE){side=r.bottom+GAP+h<vh-EDGE?'bottom':'top';left=r.left+r.width/2-w/2;top=side==='bottom'?r.bottom+GAP:r.top-GAP-h;}
  setPlace({side,left:Math.min(Math.max(EDGE,left),vw-w-EDGE),top:Math.min(Math.max(EDGE,top),vh-h-EDGE)});
 },[step]);
 useLayoutEffect(()=>{if(!open||!step)return;onNav(step.nav!==false);
  const id=window.setTimeout(()=>{find(step.target)?.scrollIntoView({block:'nearest'});measure();requestAnimationFrame(measure);next.current?.focus({preventScroll:true});},step.nav===false?60:220);
  return()=>window.clearTimeout(id);},[open,step,measure]);
 // Toasts live in the top layer, above the tour: they wait hidden while it is open and show again when it closes.
 useEffect(()=>{if(!open)return;document.documentElement.classList.add('tour-active');return()=>document.documentElement.classList.remove('tour-active');},[open]);
 useEffect(()=>{if(!open)return;const update=()=>measure();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};},[open,measure]);
 const finish=useCallback(()=>{onNav(false);onClose();window.setTimeout(()=>back.current?.focus?.(),0);},[onClose,onNav]);
 useEffect(()=>{if(!open)return;const keys=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish();}
   else if(e.key==='ArrowRight'){e.preventDefault();setIndex(i=>i+1<list.length?i+1:i);}
   else if(e.key==='ArrowLeft'){e.preventDefault();setIndex(i=>Math.max(0,i-1));}
   else if(e.key==='Tab'){const items=Array.from(card.current?.querySelectorAll<HTMLElement>('button')||[]);if(!items.length)return;e.preventDefault();e.stopImmediatePropagation();const at=items.indexOf(document.activeElement as HTMLElement);items[(at+(e.shiftKey?-1:1)+items.length)%items.length].focus();}
  };window.addEventListener('keydown',keys,true);return()=>window.removeEventListener('keydown',keys,true);},[open,list.length,finish]);
 if(!open)return null;
 if(!step)return <div className="tour-layer" aria-hidden="true"><div className="tour-shade"/></div>;
 const last=index===list.length-1,pad=6;
 return <div className="tour-layer">
  <div className="tour-block" onClick={e=>e.stopPropagation()}/>
  {rect?<div className="tour-spot" aria-hidden="true" style={{top:rect.top-pad,left:rect.left-pad,width:rect.width+pad*2,height:rect.height+pad*2}}/>:<div className="tour-shade" aria-hidden="true"/>}
  <div ref={card} className={'tour-card side-'+(place?.side||'right')} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text" style={place?{top:place.top,left:place.left}:{visibility:'hidden'}} key={index}>
   <span className="tour-progress">Paso {index+1} de {list.length}</span>
   <h2 id="tour-title">{step.title}</h2>
   <p id="tour-text">{step.text}</p>
   <div className="tour-dots" aria-hidden="true">{list.map((_,i)=><span key={i} className={i===index?'is-on':''}/>)}</div>
   <div className="tour-actions">
    <button type="button" className="text-button tour-skip" onClick={finish}>Omitir tour</button>
    <span>{index>0&&<button type="button" className="secondary" onClick={()=>setIndex(index-1)}>Anterior</button>}
    <button ref={next} type="button" className="primary" onClick={()=>last?finish():setIndex(index+1)}>{last?'Terminar':'Siguiente'}</button></span>
   </div>
  </div>
 </div>;
}

/** Remembers per user and browser that the tour was shown, so it starts by itself only once. */
export const tourKey=(user:string)=>'tb-tour-seen:'+user;
export function tourSeen(user:string){try{return localStorage.getItem(tourKey(user))==='1';}catch{return true;}}
export function markTourSeen(user:string){try{localStorage.setItem(tourKey(user),'1');}catch{}}
