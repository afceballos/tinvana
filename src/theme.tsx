import {useEffect,useState} from 'react';
import type {MouseEvent} from 'react';
import {Icon} from './ui';

export type Theme='light'|'dark';
const KEY='tinvana-theme';

function stored():Theme|null{try{const v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:null;}catch{return null;}}
function preferred():Theme{return stored()??(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
function apply(theme:Theme){document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name=theme-color]')?.setAttribute('content',theme==='dark'?'#14120f':'#fff8f1');}

// Runs before React renders so the first paint already has the right theme.
export function initTheme(){apply(preferred());}

// Soft spotlight that follows the pointer over cards (fine pointers only; CSS reads --mx/--my).
export function initPointerGlow(){
 if(!window.matchMedia('(hover: hover) and (pointer: fine)').matches||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 let frame=0;
 document.addEventListener('pointermove',event=>{
  const card=(event.target as Element|null)?.closest?.<HTMLElement>('.card');if(!card||frame)return;
  frame=requestAnimationFrame(()=>{frame=0;const box=card.getBoundingClientRect();card.style.setProperty('--mx',(event.clientX-box.left)+'px');card.style.setProperty('--my',(event.clientY-box.top)+'px');});
 },{passive:true});
}

export function useTheme(){
 const [theme,setTheme]=useState<Theme>(()=>document.documentElement.dataset.theme==='dark'?'dark':'light');
 // Follow the operating system until the person chooses explicitly.
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const change=()=>{if(stored())return;const next=media.matches?'dark':'light';apply(next);setTheme(next);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 function toggle(origin?:{x:number;y:number}){
  const next:Theme=theme==='dark'?'light':'dark';
  const commit=()=>{apply(next);setTheme(next);try{localStorage.setItem(KEY,next);}catch{/* private mode */}};
  const doc=document as Document&{startViewTransition?:(cb:()=>void)=>{ready:Promise<void>}};
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!doc.startViewTransition||reduced||!origin){commit();return;}
  const radius=Math.hypot(Math.max(origin.x,innerWidth-origin.x),Math.max(origin.y,innerHeight-origin.y));
  doc.startViewTransition(commit).ready.then(()=>document.documentElement.animate({clipPath:[`circle(0px at ${origin.x}px ${origin.y}px)`,`circle(${radius}px at ${origin.x}px ${origin.y}px)`]},{duration:620,easing:'cubic-bezier(.65,0,.25,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>undefined);
 }
 return {theme,toggle};
}

export function ThemeToggle({className=''}:{className?:string}){
 const {theme,toggle}=useTheme();const dark=theme==='dark';
 function click(event:MouseEvent<HTMLButtonElement>){const box=event.currentTarget.getBoundingClientRect();toggle({x:box.left+box.width/2,y:box.top+box.height/2});}
 return <button type="button" className={'theme-toggle '+className} onClick={click} role="switch" aria-checked={dark} aria-label={dark?'Cambiar a modo claro':'Cambiar a modo oscuro'} title={dark?'Modo claro':'Modo oscuro'}><Icon name="sun" className="theme-icon theme-sun"/><Icon name="moon" className="theme-icon theme-moon"/></button>;
}
