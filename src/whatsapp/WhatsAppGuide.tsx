import {useState,type ReactNode} from 'react';
import {Icon} from '../ui';

type Step={title:string;body:ReactNode;tinbana?:ReactNode;link?:[string,string]};
const M={apps:'https://developers.facebook.com/apps',business:'https://business.facebook.com/latest/settings/system_users',manager:'https://business.facebook.com/wa/manage/home/',docs:'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started'};

const createApp:Step={title:'Crea tu app en Meta',link:[M.apps,'Abrir Meta for Developers'],
 body:<>Entra a Meta for Developers con tu Facebook, pulsa <b>Crear app</b> (<i>Create App</i>), elige el caso de uso <b>Conectar con clientes a través de WhatsApp</b> (<i>Connect with customers through WhatsApp</i>), selecciona o crea tu portafolio comercial y pulsa <b>Crear app</b>. Si ya la creaste para el número de prueba, usa la misma.</>};
const token:Step={title:'Crea el token permanente',link:[M.business,'Abrir usuarios del sistema'],
 body:<>En la Configuración del negocio ve a <b>Usuarios del sistema</b> → <b>Agregar</b> (rol Administrador). Selecciónalo y pulsa <b>Asignar activos</b>: tu app con <b>control total</b> y tu cuenta de WhatsApp con <b>control total</b>. Luego <b>Generar token</b>: elige tu app, caducidad <b>Nunca</b> y marca los permisos <code>whatsapp_business_messaging</code>, <code>whatsapp_business_management</code> y <code>business_management</code>. Cópialo: Meta lo muestra una sola vez.</>,
 tinbana:<>Pégalo en <b>Token de acceso permanente</b>. No uses el token de «Generar token de acceso» de la Configuración de la API: vence en 24 horas.</>};
const secret:Step={title:'Copia la clave secreta de tu app',link:[M.apps,'Abrir mis apps'],
 body:<>En tu app ve a <b>Configuración de la app</b> → <b>Básica</b> → <b>Clave secreta de la app</b> → <b>Mostrar</b>. Con ella Tinbana comprueba que cada mensaje viene de verdad de Meta.</>,
 tinbana:<>Pégala en <b>Clave secreta de tu app de Meta</b> y pulsa <b>Guardar credenciales</b>.</>};
const webhook:Step={title:'Conecta el webhook',
 body:<>Al guardar, Tinbana te muestra abajo la <b>URL del webhook</b> y tu <b>token de verificación</b>. En tu app de Meta ve a <b>WhatsApp</b> → <b>Configuración</b> (<i>Configuration</i>) → <b>Webhook</b> → <b>Editar</b>, pega los dos, pulsa <b>Verificar y guardar</b> y en <b>Campos del webhook</b> suscríbete a <code>messages</code>.</>,
 tinbana:<>Usa los botones <b>Copiar</b> de la tarjeta «Webhook de tu app».</>};

const TEST:Step[]=[createApp,
 {title:'Copia los identificadores del número de prueba',link:[M.apps,'Abrir mis apps'],
  body:<>Pulsa <b>Empezar a usar la API</b> para abrir <b>Configuración de la API</b> (<i>API Setup</i>). Meta te da un número de prueba gratis. Ahí verás el <b>identificador del número de teléfono</b> (<i>Phone number ID</i>) y el de la <b>cuenta de WhatsApp Business</b> (<i>WhatsApp Business Account ID</i>, a veces «Messaging account ID»).</>,
  tinbana:<>Pégalos en <b>Phone Number ID</b> y <b>WhatsApp Business Account ID</b>.</>},
 {title:'Agrega los números que pueden escribirle',
  body:<>En la misma página, en el campo <b>Para</b> (<i>To</i>), agrega y verifica con el código que llega por WhatsApp los números con los que vas a probar (hasta 5). El número de prueba solo conversa con esos números.</>},
 token,secret,webhook,
 {title:'Prueba',body:<>En Tinbana pulsa <b>Probar conexión</b> (también suscribe tu app a los mensajes). Después escribe al número de prueba desde uno de tus números verificados: el mensaje debe aparecer en la Bandeja.</>}];

const OWN:Step[]=[createApp,
 {title:'Prepara tu número',
  body:<>Necesitas un número que pueda recibir un SMS o una llamada y que <b>no esté activo</b> en la app de WhatsApp o WhatsApp Business de un celular. Si lo está, elimina esa cuenta en el celular antes (se pierden sus chats) o usa la migración de número de Meta.</>},
 {title:'Agrega y verifica el número',link:[M.apps,'Abrir mis apps'],
  body:<>En <b>Configuración de la API</b> pulsa <b>Agregar número de teléfono</b> (<i>Add phone number</i>). Escribe el <b>nombre para mostrar</b> (el de tu negocio; Meta lo revisa), la categoría y verifica con el código. Luego elige tu número en <b>De</b> (<i>From</i>) para ver su <b>Phone number ID</b> y el <b>WhatsApp Business Account ID</b>.</>,
  tinbana:<>Pégalos en <b>Phone Number ID</b> y <b>WhatsApp Business Account ID</b>.</>},
 {title:'Agrega un método de pago',link:[M.manager,'Abrir WhatsApp Manager'],
  body:<>En <b>WhatsApp Manager</b> → <b>Configuración de pagos</b>, agrega una tarjeta. Meta cobra las conversaciones que inicias con plantilla (confirmaciones o avisos fuera de las 24 horas); responder cuando el cliente te escribe no necesita plantilla.</>},
 token,secret,
 {title:'Publica tu app',
  body:<>En la parte de arriba del panel de tu app cambia <b>Modo de la app</b> de <b>En desarrollo</b> a <b>Publicada</b> (<i>Live</i>). Meta pide una URL de política de privacidad (puede ser la de tu tienda). Sin publicarla, Meta no envía a Tinbana los mensajes de tus clientes reales.</>},
 webhook,
 {title:'Prueba y verifica tu negocio',
  body:<>Pulsa <b>Probar conexión</b> y escribe a tu número desde otro celular. Para enviar más mensajes al día, verifica tu negocio en la Configuración del negocio → <b>Centro de seguridad</b>.</>}];

/** Step-by-step guide to connect a Meta number (test or own) with the fields of this page. */
export function WhatsAppGuide({open}:{open:boolean}){
 const [kind,setKind]=useState<'test'|'own'>('test');const steps=kind==='test'?TEST:OWN;
 return <details className="panel narrow wa-guide" open={open}>
  <summary><span className="webhook-logo" aria-hidden="true"><Icon name="check"/></span><span><span className="eyebrow">Paso a paso</span><strong>Cómo conectar tu número de Meta</strong></span><Icon name="chevron" className="wa-guide-chevron"/></summary>
  <p className="small muted">Usa el <b>número de prueba</b> para ensayar sin costo (solo conversa con hasta 5 números que tú agregas) y <b>tu número propio</b> para atender a tus clientes. Los nombres de los menús pueden cambiar un poco según el idioma de Meta.</p>
  <div className="wa-guide-tabs" role="tablist" aria-label="Tipo de número">
   <button type="button" role="tab" aria-selected={kind==='test'} className={kind==='test'?'is-on':''} onClick={()=>setKind('test')}>Número de prueba</button>
   <button type="button" role="tab" aria-selected={kind==='own'} className={kind==='own'?'is-on':''} onClick={()=>setKind('own')}>Mi número propio</button>
  </div>
  <ol className="wa-guide-steps">{steps.map((s,i)=><li key={kind+i}>
   <span className="wa-guide-n" aria-hidden="true">{i+1}</span>
   <div><strong>{s.title}</strong><p>{s.body}</p>
    {s.tinbana&&<p className="wa-guide-here"><Icon name="arrow"/><span><b>En Tinbana:</b> {s.tinbana}</span></p>}
    {s.link&&<a className="secondary wa-guide-link" href={s.link[0]} target="_blank" rel="noopener noreferrer">{s.link[1]}<Icon name="external"/></a>}</div>
  </li>)}</ol>
  <p className="small muted">¿Dudas? Guía oficial de Meta: <a href={M.docs} target="_blank" rel="noopener noreferrer">Primeros pasos con la API de WhatsApp Cloud</a>.</p>
 </details>;
}
