import {useRef} from 'react';
import gsap from 'gsap';
import {useGSAP} from '@gsap/react';
import type {ReactNode} from 'react';
gsap.registerPlugin(useGSAP);

const paths:Record<string,string>={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',box:'m3 7 9-4 9 4-9 4-9-4v10l9 4 9-4V7 M12 11v10',link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',send:'m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2',layout:'M3 3h18v18H3z M3 8h18 M9 8v13',chat:'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',menu:'M4 6h16 M4 12h16 M4 18h16',chevron:'m9 5 7 7-7 7',close:'m6 6 12 12 M6 18 18 6',check:'m5 12 4 4L19 6',arrow:'M5 12h14 m-6-6 6 6-6 6'};
export function Icon({name,className=''}:{name:string;className?:string}){return <svg className={'icon '+className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.box}/></svg>;}
export function MotionView({children,view}:{children:ReactNode;view:string}){const root=useRef<HTMLDivElement>(null);useGSAP(()=>{const mm=gsap.matchMedia();mm.add('(prefers-reduced-motion: no-preference)',()=>{gsap.fromTo(root.current,{opacity:.4,y:8},{opacity:1,y:0,duration:.32,ease:'power2.out',clearProps:'all'});});return()=>mm.revert();},{scope:root,dependencies:[view],revertOnUpdate:true});return <div ref={root}>{children}</div>;}
export function useCatalogMotion(key:unknown){const root=useRef<HTMLDivElement>(null);useGSAP(()=>{const mm=gsap.matchMedia();mm.add('(prefers-reduced-motion: no-preference)',()=>{const cards=root.current?.querySelectorAll('.card');if(cards?.length)gsap.fromTo(cards,{opacity:0,y:12},{opacity:1,y:0,duration:.35,stagger:{each:.025,amount:.22},ease:'power2.out',clearProps:'all'});});return()=>mm.revert();},{scope:root,dependencies:[key],revertOnUpdate:true});return root;}
