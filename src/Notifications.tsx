import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ReactNode} from 'react';
import './notifications.css';

type Kind='success'|'error'|'warning'|'info';
type Notice={id:number;kind:Kind;message:string};
const NotificationContext=createContext<(kind:Kind,message:string)=>void>(()=>{});
const titles:Record<Kind,string>={success:'Listo',error:'No se pudo completar',warning:'Revisa este detalle',info:'Ten en cuenta'};

function NoticeIcon({kind}:{kind:Kind}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='success'?<path d="m5 12 4 4L19 6"/>:kind==='error'?<><circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6m0-6-6 6"/></>:kind==='warning'?<><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></>:<><circle cx="12" cy="12" r="8.5"/><path d="M12 11v6m0-10h.01"/></>}</svg>;}

function Notification({notice,onDismiss}:{notice:Notice;onDismiss:(id:number)=>void}){
 const [leaving,setLeaving]=useState(false);const [hover,setHover]=useState(false);const [focus,setFocus]=useState(false);const [hidden,setHidden]=useState(document.hidden);
 const remaining=useRef(notice.kind==='success'?6500:notice.kind==='info'?9000:0);const exitTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const close=useCallback(()=>{if(exitTimer.current)return;setLeaving(true);exitTimer.current=setTimeout(()=>onDismiss(notice.id),window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);},[notice.id,onDismiss]);
 useEffect(()=>{const change=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 useEffect(()=>{if(hover||focus||hidden||leaving||remaining.current===0)return;const started=performance.now();const timer=setTimeout(close,remaining.current);return()=>{clearTimeout(timer);remaining.current=Math.max(1,remaining.current-(performance.now()-started));};},[hover,focus,hidden,leaving,close]);
 useEffect(()=>()=>{if(exitTimer.current)clearTimeout(exitTimer.current);},[]);
 return <section className={'toast toast-'+notice.kind+(leaving?' toast-leaving':'')} role={notice.kind==='error'?'alert':'status'} aria-atomic="true" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setFocus(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocus(false);}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}}}>
 <span className="toast-symbol"><NoticeIcon kind={notice.kind}/></span><div className="toast-copy"><strong>{titles[notice.kind]}</strong><p>{notice.message}</p></div><button type="button" className="toast-close" aria-label={'Cerrar notificación: '+titles[notice.kind]} onClick={close}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
 </section>;
}

export function NotificationProvider({children}:{children:ReactNode}){
 const [notices,setNotices]=useState<Notice[]>([]);const nextId=useRef(0);const viewport=useRef<HTMLDivElement>(null);
 const [portalHost,setPortalHost]=useState<HTMLElement>(document.body);const hostRef=useRef<HTMLElement>(document.body);
 useLayoutEffect(()=>{const update=()=>{const host=Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1)||document.body;if(host!==hostRef.current){hostRef.current=host;setPortalHost(host);}};const observer=new MutationObserver(update);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});update();return()=>observer.disconnect();},[]);
 const notify=useCallback((kind:Kind,message:string)=>{if(!message.trim())return;const id=++nextId.current;setNotices(previous=>previous.some(n=>n.kind===kind&&n.message===message)?previous:[...previous,{id,kind,message}].slice(-4));},[]);
 const dismiss=useCallback((id:number)=>setNotices(previous=>previous.filter(n=>n.id!==id)),[]);
 useLayoutEffect(()=>{const host=Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1)||document.body;if(host!==portalHost){hostRef.current=host;setPortalHost(host);return;}const el=viewport.current;if(!el?.isConnected||typeof el.showPopover!=='function')return;if(el.matches(':popover-open'))el.hidePopover();if(notices.length)el.showPopover();},[notices,portalHost]);
 return <NotificationContext.Provider value={notify}>{children}{createPortal(<div ref={viewport} popover="manual" className="toast-viewport" aria-label="Notificaciones" data-visible={notices.length>0}>{notices.map(notice=><Notification key={notice.id} notice={notice} onDismiss={dismiss}/>)}</div>,portalHost)}</NotificationContext.Provider>;
}

export function useFeedbackState(kind:Kind):[string,(value:string)=>void]{
 const [value,setValue]=useState('');const notify=useContext(NotificationContext);
 const update=useCallback((message:string)=>{setValue(message);if(message)notify(kind,message);},[kind,notify]);
 return [value,update];
}
