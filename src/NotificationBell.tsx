import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {getCsrf} from './api';
import {Icon} from './ui';
import './notification-bell.css';

export type NotificationItem={id:string;kind:string;title:string;body:string;link:string|null;read:boolean;created_at:string};
type Feed={unchanged?:boolean;stamp:string;unread?:number;items?:NotificationItem[];channels?:{panel:boolean;sound:boolean;browser:boolean;email:boolean}};

// Polling must not count as activity (X-Session-Probe) nor light the global loading bar.
async function probe<T>(path:string,init?:RequestInit):Promise<T|null>{
 const r=await fetch(path,{credentials:'same-origin',...init,headers:{'X-Session-Probe':'1',...(init?.body?{'Content-Type':'application/json','X-CSRF-Token':getCsrf()}:{}),...init?.headers}});
 if(!r.ok)return null;return r.json() as Promise<T>;
}
/** Short two-tone chime made with Web Audio (no audio file). Browsers allow it after the person has interacted with the page. */
export function chime(){
 try{const Ctx=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;const ctx=new Ctx();
  [[880,0],[1320,.14]].forEach(([f,t])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,ctx.currentTime+t);g.gain.linearRampToValueAtTime(.18,ctx.currentTime+t+.02);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+t+.32);o.connect(g).connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+.35);});
  setTimeout(()=>void ctx.close(),900);
 }catch{/* sound is optional */}
}
const ago=(v:string)=>{const s=(Date.now()-new Date(v).getTime())/1000;if(s<60)return 'ahora';if(s<3600)return Math.floor(s/60)+' min';if(s<86400)return Math.floor(s/3600)+' h';return new Date(v).toLocaleDateString('es-CO',{day:'numeric',month:'short'});};

export function NotificationBell(){
 const [feed,setFeed]=useState<Feed|null>(null);const [open,setOpen]=useState(false);const stamp=useRef('');const seen=useRef<Set<string>|null>(null);
 const box=useRef<HTMLDivElement>(null);const navigate=useNavigate();
 useEffect(()=>{
  let stop=false,timer=0;
  const tick=async()=>{
   try{const r=await probe<Feed>('/api/notifications?stamp='+stamp.current);
    if(r&&!r.unchanged){stamp.current=r.stamp;setFeed(r);
     const fresh=(r.items||[]).filter(n=>!n.read&&seen.current&&!seen.current.has(n.id));
     if(seen.current===null)seen.current=new Set();(r.items||[]).forEach(n=>seen.current!.add(n.id));
     if(fresh.length&&r.channels){
      if(r.channels.sound)chime();
      if(r.channels.browser&&'Notification' in window&&Notification.permission==='granted'&&document.visibilityState!=='visible'){
       const n=fresh[0];const note=new Notification(n.title,{body:n.body,tag:n.id,icon:'/brand/tinvana-origami.svg'});note.onclick=()=>{window.focus();if(n.link)navigate(n.link);note.close();};
      }
     }
    }
   }catch{/* the next tick retries */}
   if(!stop)timer=window.setTimeout(tick,document.visibilityState==='visible'?20000:60000);
  };
  void tick();return()=>{stop=true;clearTimeout(timer);};
 },[navigate]);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false);};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('mousedown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',esc);};},[open]);
 if(feed?.channels&&!feed.channels.panel)return null;
 const unread=feed?.unread||0;
 async function read(ids:string[]|'all'){const r=await probe<Feed>('/api/notifications/read',{method:'POST',body:JSON.stringify({ids})});if(r){stamp.current=r.stamp;setFeed(r);}}
 return <div className="notify" ref={box}>
  <button type="button" className={'notify-toggle'+(unread?' has-unread':'')} aria-haspopup="true" aria-expanded={open} aria-label={unread?`Notificaciones: ${unread} sin leer`:'Notificaciones'} onClick={()=>setOpen(o=>!o)}><Icon name="bell"/>{unread>0&&<span className="notify-count">{unread>99?'99+':unread}</span>}</button>
  {open&&<div className="notify-panel" role="dialog" aria-label="Notificaciones">
   <div className="notify-head"><strong>Notificaciones</strong>{unread>0&&<button type="button" className="link" onClick={()=>void read('all')}>Marcar todo como leído</button>}</div>
   <ul>{(feed?.items||[]).map(n=><li key={n.id} className={n.read?'':'is-unread'}><button type="button" onClick={()=>{setOpen(false);void read([n.id]);if(n.link)navigate(n.link);}}><span className="notify-dot" aria-hidden="true"/><span className="notify-text"><strong>{n.title}</strong><small>{n.body}</small></span><time dateTime={n.created_at}>{ago(n.created_at)}</time></button></li>)}
    {!(feed?.items||[]).length&&<li className="notify-empty">No tienes notificaciones.</li>}</ul>
   <Link className="notify-settings" to="/panel/notificaciones" onClick={()=>setOpen(false)}><Icon name="automation"/>Ajustes de notificaciones</Link>
  </div>}
 </div>;
}
