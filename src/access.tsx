import {createContext,useContext,type ReactNode} from 'react';
import type {User} from './types';
import {Icon} from './ui';

export const AuthContext=createContext<{user:User|null;setUser:(u:User|null)=>void}>({user:null,setUser:()=>{}});
export const featureLabels:Record<string,string>={catalog:'Explorar y seleccionar productos de Dropi',landings:'Crear y editar landings',publish:'Publicar landings',ai:'Generar landings con IA',orders:'Gestionar pedidos',dropi_orders:'Enviar pedidos a Dropi y seguimiento',dropi_shipping:'Calcular envío con Dropi en landings',ghl:'Conexión GHL (webhooks)',mail:'Correos de pedidos',store:'Tienda con subdominio propio',whatsapp:'Ventas por WhatsApp con IA',whatsapp_ai:'Agente de IA en WhatsApp'};

// The server enforces every feature; this only hides what it would refuse. Unknown access (older session) means allowed.
export function allowed(user:User|null,feature:string){return user?.role==='superadmin'||user?.access?.features[feature]!==false;}
export function useAllowed(feature:string){return allowed(useContext(AuthContext).user,feature);}

export function Gate({feature,children}:{feature:string;children:ReactNode}){
 const {user}=useContext(AuthContext);
 if(allowed(user,feature))return <>{children}</>;
 const plan=user?.access?.plan?.name;
 return <section className="panel narrow webhook-current plan-locked" role="note">
  <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="lock"/></span><div><span className="eyebrow">No disponible</span><h2>{featureLabels[feature]||'Esta función'}</h2></div><span className="webhook-state off">Desactivado</span></div>
  <p>{plan?`Tu plan ${plan} no incluye esta función.`:'Esta función no está activa en tu cuenta.'} Escríbenos si quieres activarla.</p>
 </section>;
}
