import {NavLink,useLocation} from 'react-router-dom';
import {useAllowed} from '../access';
import './whatsapp.css';

// Sections of the module; each one is listed once its stage is built. «Bandeja» covers /panel/whatsapp and each chat.
const tabs:[string,string,string?][]=[['','Bandeja'],['anuncios','Anuncios'],['plantillas','Plantillas'],['confirmaciones','Confirmaciones'],['agente','Agente IA','whatsapp_ai'],['conexion','Conexión']];
const sections=new Set(tabs.map(([p])=>p).filter(Boolean));

export function WhatsAppTabs({unread=0}:{unread?:number}){
 const {pathname}=useLocation();const current=pathname.replace(/^\/panel\/whatsapp\/?/,'').split('/')[0];
 const inbox=!sections.has(current);const agent=useAllowed('whatsapp_ai');
 return <>
  <div className="section-heading"><div><span className="eyebrow">Ventas por WhatsApp</span><h1>WhatsApp</h1></div></div>
  <nav className="wa-tabs" aria-label="Secciones de Ventas por WhatsApp">{tabs.filter(([,,feature])=>!feature||agent).map(([path,label])=><NavLink key={path} to={'/panel/whatsapp'+(path?'/'+path:'')} end className={()=>(path===''?inbox:current===path)?'active':''} aria-current={(path===''?inbox:current===path)?'page':undefined}>{label}{path===''&&unread>0&&<span className="wa-tab-count" aria-label={unread+' sin leer'}>{unread}</span>}</NavLink>)}</nav>
 </>;
}
