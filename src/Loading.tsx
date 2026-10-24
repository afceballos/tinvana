import {useEffect,useState,useSyncExternalStore} from 'react';
import {getPendingRequests,subscribeRequests} from './api';
import {Icon} from './ui';

const messages=['Verificando tu sesión.','Preparando tus próximas oportunidades.','Doblando cada detalle de tu espacio.','Ajustando las alas para despegar.'];
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Same markup as the static preload in index.html (styled by /brand/preload.css), so React takes over without a jump. */
export function LoadingScreen({leaving=false}:{leaving?:boolean}){
 const [index,setIndex]=useState(0);const [slow,setSlow]=useState(false);
 useEffect(()=>{if(leaving)return;const rotate=setInterval(()=>setIndex(i=>(i+1)%messages.length),2200);const timer=setTimeout(()=>setSlow(true),7000);return()=>{clearInterval(rotate);clearTimeout(timer);};},[leaving]);
 const message=slow?'La conexión está tardando un poco más. Seguimos verificando tu sesión.':messages[index];
 return <main className={'tv-preload'+(leaving?' is-leaving':'')} aria-hidden={leaving||undefined}><div className="pl-grid" aria-hidden="true"/>
  <div className="pl-brand"><img className="on-light" src="/brand/tinvana-dark.svg" width="170" height="41" alt="Tinvana"/><img className="on-dark" src="/brand/tinvana-light.svg" width="170" height="41" alt=""/></div>
  <section className="pl-center" role={leaving?undefined:'status'} aria-live={leaving?undefined:'polite'}>
   <div className="pl-scene" aria-hidden="true"><span className="pl-ripple"/><span className="pl-ripple r2"/>
    <svg className="pl-ring" viewBox="0 0 200 200"><circle className="track" cx="100" cy="100" r="94"/><circle className="arc" cx="100" cy="100" r="94" pathLength={100}/><circle className="arc2" cx="100" cy="100" r="80" pathLength={100}/></svg>
    {[1,2,3,4,5,6].map(n=><span key={n} className={'pl-orbit o'+n}><i/></span>)}<span className="pl-shadow"/><img className="pl-bird" src="/brand/tinvana-origami.svg" width="132" height="92" alt=""/></div>
   <h1>Tu espacio está <span>tomando vuelo</span>.</h1><p><span key={message} className="pl-msg">{message}</span></p><div className="pl-bar" aria-hidden="true"><span/></div>
  </section><p className="pl-foot">Tinvana. Hecho para emprender.</p></main>;
}

/** Plays the take-off over the panel once it is ready, then removes itself. */
export function PreloadExit(){
 const [visible,setVisible]=useState(()=>!reducedMotion());
 useEffect(()=>{if(!visible)return;const timer=setTimeout(()=>setVisible(false),950);return()=>clearTimeout(timer);},[visible]);
 return visible?<LoadingScreen leaving/>:null;
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
