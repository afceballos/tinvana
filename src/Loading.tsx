import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import gsap from 'gsap';
import {useGSAP} from '@gsap/react';
import {getPendingRequests,subscribeRequests} from './api';
import {Icon} from './ui';

export function LoadingScreen(){
 const [slow,setSlow]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setSlow(true),7000);return()=>clearTimeout(timer);},[]);
 return <main className="startup-loader"><div className="startup-brand"><img src="/brand/tinvana-dark.svg" width="190" height="46" alt="Tinvana"/></div>
 <section className="startup-center" role="status" aria-live="polite"><img className="startup-origami" src="/brand/tinvana-origami.svg" width="180" height="125" alt=""/>
 <h1>Tu espacio está tomando vuelo.</h1><p>{slow?'La conexión está tardando un poco más. Seguimos verificando tu sesión.':'Estamos verificando tu sesión para continuar.'}</p><div className="loader-track" aria-hidden="true"><span/></div></section><p className="startup-footer">Tinvana. Hecho para emprender.</p></main>;
}

export function BrandEntrance(){
 const [visible,setVisible]=useState(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);const root=useRef<HTMLDivElement>(null);
 useGSAP(()=>{if(!visible)return;const mm=gsap.matchMedia();mm.add('(prefers-reduced-motion: no-preference)',()=>{const timeline=gsap.timeline({onComplete:()=>setVisible(false)});timeline.fromTo('.brand-entrance img',{opacity:0,y:22,rotation:-10,scale:.88},{opacity:1,y:0,rotation:0,scale:1,duration:.6,ease:'power3.out'}).fromTo('.brand-entrance span',{opacity:0,y:8},{opacity:1,y:0,duration:.35},.25).to(root.current,{opacity:0,duration:.35},.8);});return()=>mm.revert();},{scope:root});
 return visible?<div className="brand-entrance" ref={root} aria-hidden="true"><div className="brand-entrance-inner"><img src="/brand/tinvana-origami.svg" alt="" width="170" height="125"/><span>TINVANA</span></div></div>:null;
}

export function InlineLoading({title='Cargando contenido',description='Estará disponible cuando termine la consulta.'}:{title?:string;description?:string}){
 return <div className="inline-loading" role="status" aria-live="polite"><span className="loading-glyph" aria-hidden="true"><span/><span/><span/></span><div><strong>{title}</strong><p>{description}</p></div></div>;
}

export function CatalogSkeleton(){return <article className="catalog-skeleton" aria-hidden="true"><div className="catalog-skeleton-image"><Icon name="box"/></div><div className="catalog-skeleton-content"><span className="skeleton-line short"/><span className="skeleton-line"/><span className="skeleton-line medium"/><div className="skeleton-bottom"><span className="skeleton-line short"/><span className="skeleton-dot"/></div></div></article>;}

export function NetworkActivity(){
 const pending=useSyncExternalStore(subscribeRequests,getPendingRequests,()=>0);const [visible,setVisible]=useState(false);
 useEffect(()=>{if(!pending){setVisible(false);return;}const timer=setTimeout(()=>setVisible(true),180);return()=>clearTimeout(timer);},[Boolean(pending)]);
 return <div className={'network-activity '+(visible?'is-active':'')} aria-hidden="true"><span/></div>;
}
