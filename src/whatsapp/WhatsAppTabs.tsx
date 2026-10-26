import {NavLink} from 'react-router-dom';
import './whatsapp.css';

// Sections of the module; each one is listed once its stage is built.
const tabs:[string,string][]=[['conexion','Conexión']];

export function WhatsAppTabs(){
 return <>
  <div className="section-heading"><div><span className="eyebrow">Ventas por WhatsApp</span><h1>WhatsApp</h1></div></div>
  <nav className="wa-tabs" aria-label="Secciones de Ventas por WhatsApp">{tabs.map(([path,label])=><NavLink key={path} to={'/panel/whatsapp/'+path}>{label}</NavLink>)}</nav>
 </>;
}
