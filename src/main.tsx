import {PasswordInput} from './PasswordInput';
import {OwnProductForm} from './OwnProductForm';
import {ProductOffers} from './ProductOffers';
import {Orders,OrderDetail} from './Orders';
import {PendingPage,usePendingCount} from './Pending';
import {MediaLibraryPage} from './MediaLibrary';
import React,{useContext,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Navigate,Outlet,NavLink,Link,useNavigate,useLocation} from 'react-router-dom';
import {api,post,setCsrf,markSessionExpired,takeSessionExpired} from './api';
import {ErrorScreen,serverError} from './ErrorScreen';
import type {User} from './types';
import {Catalog,Integrations,MyProducts,Editor,Template,Leads} from './pages';
import {AiSettings} from './AiSettings';
import {AccessFrame} from './AccessFrame';
import {AccountAccess} from './AccountAccess';
import {AccountMenu,ProfilePage,PasswordPage} from './Profile';
import {MailSettingsPage} from './MailSettings';
import {WebhookSettings} from './WebhookSettings';
import {AdminPage,AdminAccount} from './Admin';
import {WhatsAppConnection} from './whatsapp/WhatsAppConnection';
import {WhatsAppInbox} from './whatsapp/WhatsAppInbox';
import {WhatsAppAgentPage} from './whatsapp/WhatsAppAgent';
import {WhatsAppAdsPage} from './whatsapp/WhatsAppAds';
import {WhatsAppTemplatesPage} from './whatsapp/WhatsAppTemplates';
import {WhatsAppConfirmationsPage} from './whatsapp/WhatsAppConfirmations';
import {NotificationBell} from './NotificationBell';
import {ProductTour,tourSeen,markTourSeen,type TourStep} from './ProductTour';
import {NotificationSettings} from './NotificationSettings';
import {AuthContext,Gate,allowed} from './access';
import type {Access} from './types';
import './style.css';
import './premium.css';
import './media.css';
import './motion.css';
import './brand.css';
import './tinvana.css';
import './dark.css';
import './modern.css';
import {ThemeToggle,initTheme,initPointerGlow} from './theme';
import {BrandLogo} from './Brand';
import {LoadingScreen,NetworkActivity,PreloadExit} from './Loading';
import {NotificationProvider,useFeedbackState} from './Notifications';
import {Icon,MotionView} from './ui';
function Login(){const {user,setUser}=useContext(AuthContext);const [error,setError]=useFeedbackState('error');const [busy,setBusy]=useState(false);const navigate=useNavigate();const location=useLocation();
 // Back to where the session ended (panel paths only), and a one-time notice when it expired.
 const from=typeof (location.state as {from?:unknown}|null)?.from==='string'&&(location.state as {from:string}).from.startsWith('/panel/')?(location.state as {from:string}).from:'/panel/catalogo';
 const [expired]=useState(takeSessionExpired);
 if(user)return <Navigate to={from} replace/>;
 return <AccessFrame><span className="eyebrow">Bienvenido de nuevo</span><h2>Entra a tu espacio</h2><p className="muted">Inicia sesión para administrar tu catálogo.</p>{expired&&<p className="auth-expired" role="status">Tu sesión se cerró por inactividad. Vuelve a entrar y te llevamos a donde estabas.</p>}<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{const r=await post<{user:User;csrf:string}>('/api/auth/login',{email:f.get('email'),password:f.get('password')});setCsrf(r.csrf);setUser(r.user);navigate(from,{replace:true});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>Email<input name="email" type="email" required autoComplete="username"/></label><label>Contraseña<PasswordInput name="password" required autoComplete="current-password"/></label><Link className="auth-forgot" to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link><button className="primary" disabled={busy}>{busy?'Entrando…':'Iniciar sesión →'}</button></form>{error&&<p className="auth-context-link">¿Aún no verificaste tu correo? <Link to="/reenviar-verificacion">Reenviar enlace</Link></p>}<p className="auth-switch">¿No tienes cuenta? <Link to="/registro">Crea una</Link></p></AccessFrame>;
}
// [path, label, icon, plan feature that shows it]
// Sidebar in three blocks by purpose: daily sales work first, products and store next, settings last.
type NavItem=[string,string,string,string?];
const navSections:[string,NavItem[]][]=[
 ['Ventas',[['pendientes','Pendientes','clock','orders'],['pedidos','Pedidos','truck','orders'],['leads','Consultas recibidas','growth'],['whatsapp','Ventas WhatsApp','whatsapp','whatsapp']]],
 ['Productos y tienda',[['productos','Mis productos','box'],['catalogo','Explorar productos','grid','catalog'],['archivos','Mis archivos','image'],['plantilla','Plantilla de marca','layout']]],
 ['Configuración',[['@integraciones','Integraciones','link'],['correos','Correos de pedidos','mail','mail'],['notificaciones','Notificaciones','bell']]],
];
const navigation:NavItem[]=navSections.flatMap(([,items])=>items);
const adminNavigation:[string,string,string][]=[['admin','Administración','users']];
// «Integraciones» groups the connections in one expandable menu; each one keeps its own route.
const integrationNavigation:NavItem[]=[['integraciones','Dropi','link'],['ia','IA','automation','ai'],['webhooks','GHL','send','ghl'],['whatsapp/conexion','WhatsApp','whatsapp','whatsapp']];
const INTEGRATION_PATH=/^\/panel\/(integraciones|ia|webhooks|whatsapp\/conexion)(\/|$)/;
// Guided tour: the main parts of the panel, in the order a new store uses them. Steps the account cannot see are skipped.
const tourSteps:TourStep[]=[
 {target:'.app-sidebar nav .nav-group-toggle, .app-sidebar nav a[href="/panel/integraciones"]',title:'Empieza por aquí',text:'Conecta Dropi, la IA, GHL y WhatsApp. Sin esto no se pueden traer productos ni enviar pedidos.'},
 {target:'.app-sidebar nav a[href="/panel/catalogo"]',title:'Explorar productos',text:'Busca productos en el catálogo de Dropi y guarda los que quieras vender.'},
 {target:'.app-sidebar nav a[href="/panel/productos"]',title:'Mis productos',text:'Crea la landing de cada producto o sube uno propio desde cero.'},
 {target:'.app-sidebar nav a[href="/panel/pendientes"]',title:'Pendientes',text:'Lo que necesita tu atención hoy: pedidos por confirmar, envíos y novedades.'},
 {target:'.app-sidebar nav a[href="/panel/pedidos"]',title:'Pedidos',text:'Confirma cada pedido con tu cliente y envíalo a Dropi.'},
 {target:'.app-sidebar nav a[href="/panel/whatsapp"]',title:'Ventas WhatsApp',text:'Atiende tus chats y deja que el asistente de IA te ayude a vender.'},
 {target:'.header [data-tour="help"]',title:'¿Quieres repasarlo?',text:'Toca este botón cuando quieras ver la guía otra vez.',nav:false},
];

function Shell(){
 const {user,setUser}=useContext(AuthContext);const [error,setError]=useFeedbackState('error');const [collapsed,setCollapsed]=useState(false);const [groupOpen,setGroupOpen]=useState(()=>INTEGRATION_PATH.test(window.location.pathname));const [mobile,setMobile]=useState(false);const [tour,setTour]=useState(false);const location=useLocation();const sidebar=useRef<HTMLElement>(null);const menuButton=useRef<HTMLButtonElement>(null);const [smallScreen,setSmallScreen]=useState(window.matchMedia('(max-width:900px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width:900px)');const update=()=>{setSmallScreen(media.matches);if(!media.matches)setMobile(false);};media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{if(!mobile)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';sidebar.current?.querySelector<HTMLElement>('a')?.focus();const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMobile(false);menuButton.current?.focus();}if(e.key==='Tab'){const items=sidebar.current?.querySelectorAll<HTMLElement>('a,button:not([disabled])');const visible=Array.from(items||[]).filter(x=>x.offsetParent!==null);const first=visible[0],last=visible.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};window.addEventListener('keydown',keyboard);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',keyboard);};},[mobile]);
 useEffect(()=>setMobile(false),[location.pathname]);
 // The tour starts by itself only once per account: the server remembers it (any browser or device), and this browser
 // too, so it never waits on the request. Automated browsers (tests) skip it; the «?» button always opens it.
 const markSeen=()=>{if(!user)return;markTourSeen(user.id);if(!user.tour_seen){setUser({...user,tour_seen:true});post('/api/profile/tour').catch(()=>{});}};
 useEffect(()=>{if(!user||user.tour_seen||navigator.webdriver)return;if(tourSeen(user.id)){markSeen();return;}const id=window.setTimeout(()=>{markSeen();setTour(true);},900);return()=>window.clearTimeout(id);},[user?.id]);
 // Idle sessions end on the server; check every minute and when the tab regains focus, without counting as activity
 // (X-Session-Probe), and send the user to the login when it is gone.
 useEffect(()=>{if(!user)return;let stopped=false;
  const probe=async()=>{try{const response=await fetch('/api/auth/session',{credentials:'same-origin',headers:{'X-Session-Probe':'1'}});if(!response.ok)return;const r=await response.json() as {user:User|null;csrf:string};if(stopped)return;setCsrf(r.csrf);if(!r.user){markSessionExpired();setUser(null);}}catch{}};
  const visible=()=>{if(document.visibilityState==='visible')void probe();};const id=window.setInterval(probe,60000);
  document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);
  return()=>{stopped=true;window.clearInterval(id);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);};},[!!user]);
 // Plan changes made by the superadmin reach open sessions on the next navigation (at most once a minute).
 const pending=usePendingCount(!!user&&allowed(user,'orders'),location.pathname);
 const accessCheck=useRef(Date.now());
 useEffect(()=>{if(!user||Date.now()-accessCheck.current<60000)return;accessCheck.current=Date.now();api<Access>('/api/access').then(access=>setUser({...user,access})).catch(()=>{});},[location.pathname]);
 // Only the nav list scrolls; edge fades appear when there is more above or below, and the active link stays in view.
 useEffect(()=>{const nav=sidebar.current?.querySelector<HTMLElement>('nav');if(!nav)return;const fade=()=>{nav.dataset.fadeTop=String(nav.scrollTop>4);nav.dataset.fadeBottom=String(nav.scrollTop+nav.clientHeight<nav.scrollHeight-4);};fade();nav.addEventListener('scroll',fade,{passive:true});const observer=new ResizeObserver(fade);observer.observe(nav);return()=>{nav.removeEventListener('scroll',fade);observer.disconnect();};},[collapsed,user]);
 useEffect(()=>{sidebar.current?.querySelector<HTMLElement>('nav a.active')?.scrollIntoView({block:'nearest'});},[location.pathname,user]);
 // The active-link pill glides between items instead of jumping.
 useEffect(()=>{const nav=sidebar.current?.querySelector<HTMLElement>('nav');if(!nav)return;const place=()=>{let active=nav.querySelector<HTMLElement>('a.active');if(active&&!active.offsetHeight)active=nav.querySelector<HTMLElement>('.nav-group.has-active > .nav-group-toggle');if(!active){nav.style.setProperty('--pill-o','0');return;}nav.style.setProperty('--pill-y',active.offsetTop+'px');nav.style.setProperty('--pill-h',active.offsetHeight+'px');nav.style.setProperty('--pill-o','1');};place();const observer=new ResizeObserver(place);observer.observe(nav);return()=>observer.disconnect();},[location.pathname,collapsed,user,groupOpen]);
 // Opening a connection page (from a link or the browser) unfolds «Integraciones».
 useEffect(()=>{if(INTEGRATION_PATH.test(location.pathname))setGroupOpen(true);},[location.pathname]);
 if(!user)return <Navigate to="/login" replace state={{from:location.pathname}}/>;
 const can=([,,,feature]:NavItem)=>!feature||allowed(user,feature);
 const sections:[string,NavItem[]][]=navSections.map(([title,list])=>[title,[...list.filter(can),...(title==='Configuración'&&user.role==='superadmin'?adminNavigation:[])]]);
 const integrations=integrationNavigation.filter(([,,,feature])=>!feature||allowed(user,feature));
 const inIntegrations=integrations.some(([path])=>location.pathname==='/panel/'+path||location.pathname.startsWith('/panel/'+path+'/'));
 const navLink=([path,label,icon]:NavItem)=><NavLink title={collapsed?label:undefined} key={path} to={'/panel/'+path} className={path==='whatsapp'?({isActive})=>isActive&&!INTEGRATION_PATH.test(location.pathname)?'active':'':undefined}><Icon name={icon}/><span>{label}</span>{path==='pendientes'&&pending>0&&<span className="nav-count" aria-label={pending+' pendientes urgentes'}>{pending>99?'99+':pending}</span>}<Icon name="chevron" className="nav-chevron"/></NavLink>;
 // Collapsed sidebar: the connections show as icons, as before.
 const group=!integrations.length?null:collapsed?integrations.map(([path,label,icon,feature])=>navLink([path,'Integraciones · '+label,icon,feature])):<div className={'nav-group'+(inIntegrations?' has-active':'')+(groupOpen?' is-open':'')} key="@integraciones"><button type="button" className="nav-group-toggle" aria-expanded={groupOpen} aria-controls="nav-integraciones" onClick={()=>setGroupOpen(v=>!v)}><Icon name="link"/><span>Integraciones</span><Icon name="chevron" className="nav-chevron"/></button><div id="nav-integraciones" className="nav-sub" hidden={!groupOpen}>{integrations.map(navLink)}</div></div>;
 const title=[...integrationNavigation.map(([path,label,icon])=>[path,'Integraciones · '+label,icon]),...navigation,...adminNavigation].find(([path])=>location.pathname==='/panel/'+path||location.pathname.startsWith('/panel/'+path+'/'))?.[1]||(location.pathname.endsWith('/perfil')?'Editar perfil':location.pathname.endsWith('/seguridad')?'Cambiar contrase\u00f1a':location.pathname.endsWith('/correos')?'Correos de pedidos':location.pathname.endsWith('/notificaciones')?'Notificaciones':'Editor de landing');
 return <div className={'app-shell '+(collapsed?'is-collapsed':'')+(mobile?' mobile-open':'')}><a className="skip-link" href="#main-content">Saltar al contenido</a><aside ref={sidebar} inert={smallScreen&&!mobile} className="app-sidebar" aria-label="Navegación principal"><NavLink className="brand" to="/panel/catalogo" aria-label="Tinbana — Explorar catálogo"><BrandLogo/></NavLink><div className="space-label"><span className="workspace-avatar"><img src="/brand/tinvana-origami.svg" alt=""/></span><div>Mi espacio<small>Tu negocio, en movimiento</small></div></div><nav><span className="nav-pill" aria-hidden="true"/>{sections.map(([heading,list])=>{const links=list.map(item=>item[0]==='@integraciones'?group:navLink(item)).filter(Boolean);return links.length?<div className="nav-section" key={heading} role="group" aria-label={heading}><span className="nav-section-title" aria-hidden="true">{heading}</span>{links}</div>:null;})}</nav><div className="sidebar-note">Dale vuelo<br/>a tu negocio.<span>Productos, páginas y conversaciones en un mismo lugar.</span></div><button className="collapse-toggle" onClick={()=>setCollapsed(v=>!v)} aria-label={collapsed?'Expandir navegación':'Contraer navegación'} aria-expanded={!collapsed}><Icon name="menu"/><span>Contraer menú</span></button></aside>{mobile&&<button className="nav-scrim" aria-label="Cerrar navegación" onClick={()=>setMobile(false)}/>}<div className="app-content"><header className="header"><button ref={menuButton} className="icon-button mobile-menu" onClick={()=>setMobile(v=>!v)} aria-label="Abrir navegación" aria-expanded={mobile}><Icon name="menu"/></button><div className="breadcrumb">Mi espacio<Icon name="chevron"/><strong>{title}</strong></div><div className="header-actions"><button type="button" className="icon-button tour-help" data-tour="help" onClick={()=>{setMobile(false);markSeen();setTour(true);}} aria-label="Ver guía del panel" title="Ver guía"><span aria-hidden="true">?</span></button><NotificationBell/><ThemeToggle/><AccountMenu user={user} onLogout={async()=>{try{await post('/api/auth/logout');const r=await api<{csrf:string}>('/api/auth/session');setCsrf(r.csrf);setUser(null);}catch(e){setError((e as Error).message);}}}/></div></header><main id="main-content" className="panel-main" tabIndex={-1}><MotionView view={location.pathname}><Outlet/></MotionView></main><footer>Tinbana<span>Ideas que toman vuelo.</span></footer></div><ProductTour steps={tourSteps} open={tour} onClose={()=>setTour(false)} onNav={show=>{if(window.matchMedia('(max-width:900px)').matches)setMobile(show);}}/></div>;
}
const PRELOAD_MIN_MS=1800;
function App(){const [user,setUser]=useState<User|null>(null);const [ready,setReady]=useState(false);const [error,setError]=useFeedbackState('error');async function load(){setError('');try{const r=await api<{user:User|null;csrf:string}>('/api/auth/session');setUser(r.user);setCsrf(r.csrf);
 // The preload stays at least PRELOAD_MIN_MS from page start so its animation can be seen; slow loads add nothing.
 const wait=matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.max(0,PRELOAD_MIN_MS-performance.now());if(wait)await new Promise(r=>setTimeout(r,wait));setReady(true);}catch(e){setError((e as Error).message);}}useEffect(()=>{void load();const reset=()=>{setUser(null);void load();};window.addEventListener('session-expired',reset);return()=>window.removeEventListener('session-expired',reset);},[]);if(error)return <main className="setup panel"><a className="brand" href="/">tinvana</a><h1>El servidor necesita configuración</h1><p className="muted">La conexión no pudo completarse. Revisa el aviso en la parte superior.</p><p>Revisa la conexión PostgreSQL y ejecuta las migraciones siguiendo la guía de instalación.</p><button className="primary" onClick={()=>void load()}>Volver a comprobar</button></main>;if(!ready)return <LoadingScreen/>;return <AuthContext.Provider value={{user,setUser}}><PreloadExit/><NetworkActivity/><BrowserRouter><Routes><Route path="/login" element={<MotionView view="login"><Login/></MotionView>}/><Route path="/registro" element={<AccountAccess key="register" mode="register"/>}/><Route path="/verificar-correo" element={<AccountAccess key="verify" mode="verify"/>}/><Route path="/reenviar-verificacion" element={<AccountAccess key="resend" mode="resend"/>}/><Route path="/recuperar-contrasena" element={<AccountAccess key="forgot" mode="forgot"/>}/><Route path="/restablecer-contrasena" element={<AccountAccess key="reset" mode="reset"/>}/><Route path="/panel" element={<Shell/>}><Route index element={<Navigate to="catalogo" replace/>}/><Route path="catalogo" element={<Gate feature="catalog"><Catalog/></Gate>}/><Route path="integraciones" element={<Integrations/>}/><Route path="webhooks" element={<Gate feature="ghl"><WebhookSettings/></Gate>}/><Route path="ia" element={<Gate feature="ai"><AiSettings/></Gate>}/><Route path="perfil" element={<ProfilePage onUser={setUser}/>}/><Route path="seguridad" element={<PasswordPage/>}/><Route path="correos" element={<Gate feature="mail"><MailSettingsPage/></Gate>}/><Route path="productos" element={<MyProducts/>}/><Route path="productos/nuevo" element={<OwnProductForm/>}/><Route path="productos/:id/editar" element={<OwnProductForm/>}/><Route path="productos/:id/ofertas" element={<ProductOffers/>}/><Route path="archivos" element={<MediaLibraryPage/>}/><Route path="landings/:id" element={<Editor/>}/><Route path="plantilla" element={<Template/>}/><Route path="leads" element={<Leads/>}/><Route path="whatsapp" element={<Gate feature="whatsapp"><WhatsAppInbox/></Gate>}/><Route path="whatsapp/:id" element={<Gate feature="whatsapp"><WhatsAppInbox/></Gate>}/><Route path="whatsapp/conexion" element={<Gate feature="whatsapp"><WhatsAppConnection/></Gate>}/><Route path="notificaciones" element={<NotificationSettings/>}/><Route path="whatsapp/plantillas" element={<Gate feature="whatsapp"><WhatsAppTemplatesPage/></Gate>}/><Route path="whatsapp/confirmaciones" element={<Gate feature="whatsapp"><WhatsAppConfirmationsPage/></Gate>}/><Route path="whatsapp/anuncios" element={<Gate feature="whatsapp"><WhatsAppAdsPage/></Gate>}/><Route path="whatsapp/agente" element={<Gate feature="whatsapp"><Gate feature="whatsapp_ai"><WhatsAppAgentPage/></Gate></Gate>}/><Route path="pendientes" element={<Gate feature="orders"><PendingPage/></Gate>}/><Route path="pedidos" element={<Gate feature="orders"><Orders/></Gate>}/><Route path="pedidos/:id" element={<Gate feature="orders"><OrderDetail/></Gate>}/>{user?.role==='superadmin'&&<><Route path="admin" element={<AdminPage/>}/><Route path="admin/:tab" element={<AdminPage/>}/><Route path="admin/cuentas/:id" element={<AdminAccount/>}/></>}</Route><Route path="/" element={<Navigate to="/panel/catalogo" replace/>}/><Route path="*" element={<ErrorScreen status={404} home="/panel/catalogo"/>}/></Routes></BrowserRouter></AuthContext.Provider>;}
initTheme();initPointerGlow();
// The PHP server embeds the error when it refuses a page (unknown address, expired preview, store without page…).
const refused=serverError();
createRoot(document.getElementById('root')!).render(<React.StrictMode>{refused?<ErrorScreen {...refused}/>:<NotificationProvider><App/></NotificationProvider>}</React.StrictMode>);
