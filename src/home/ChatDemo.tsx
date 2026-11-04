import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';

/** Example WhatsApp confirmation that plays when it scrolls into view; clicking the phone replays it.
 *  The same transcript is in the static HTML for search engines and no-JS visitors. */
type Msg={from:'in'|'out'|'sys';text:ReactNode};
const SCRIPT:Msg[]=[
 {from:'in',text:<>Hola Laura 👋 Recibimos tu pedido de <b>2 masajeadores</b> por <b>$159.900</b>, pago contraentrega.</>},
 {from:'in',text:<>¿Confirmas la entrega en <b>Cra 43 #10-21, Medellín</b>?</>},
 {from:'out',text:'Sí, pero es el apto 502'},
 {from:'in',text:<>Perfecto, actualicé la dirección: Cra 43 #10-21, apto 502. ✅ Tu pedido queda <b>confirmado</b>.</>},
 {from:'out',text:'Gracias!'},
 {from:'sys',text:'Pedido TB-1042 confirmado · enviado a Dropi'},
];
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ChatDemo({phone}:{phone:HTMLElement|null}){
 const [shown,setShown]=useState(()=>reduced()?SCRIPT.length:0);const [typing,setTyping]=useState(false);const [run,setRun]=useState(0);
 const box=useRef<HTMLDivElement>(null);const started=useRef(false);
 useEffect(()=>{
  if(reduced())return;
  const el=box.current!;const io=new IntersectionObserver(([e])=>{if(e.isIntersecting&&!started.current){started.current=true;setRun(r=>r+1);}},{threshold:.45});io.observe(el);
  const replay=()=>{setShown(0);setRun(r=>r+1);};phone?.addEventListener('click',replay);
  return()=>{io.disconnect();phone?.removeEventListener('click',replay);};
 },[phone]);
 useEffect(()=>{
  if(!run)return;let cancelled=false;const timers:number[]=[];setShown(0);
  let t=300;SCRIPT.forEach((m,i)=>{
   if(m.from==='in'){timers.push(window.setTimeout(()=>!cancelled&&setTyping(true),t));t+=750;}
   timers.push(window.setTimeout(()=>{if(cancelled)return;setTyping(false);setShown(i+1);},t));t+=m.from==='out'?900:550;
  });
  return()=>{cancelled=true;timers.forEach(clearTimeout);};
 },[run]);
 return <div ref={box} className="phone-chat" aria-live="polite" aria-label="Conversación de ejemplo">
  {SCRIPT.slice(0,shown).map((m,i)=><p key={run+'-'+i} className={'msg '+m.from+' msg-in'}>{m.text}</p>)}
  {typing&&<span className="typing" aria-label="Escribiendo"><i/><i/><i/></span>}
 </div>;
}
