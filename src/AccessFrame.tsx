import {useRef,type ReactNode} from 'react';
import gsap from 'gsap';
import {useGSAP} from '@gsap/react';
import {Link} from 'react-router-dom';
import {BrandLogo} from './Brand';
import {OrigamiScene} from './OrigamiScene';
import {ThemeToggle} from './theme';
gsap.registerPlugin(useGSAP);
export function AccessFrame({children}:{children:ReactNode}){
 const root=useRef<HTMLElement>(null);
 useGSAP(()=>{const mm=gsap.matchMedia();mm.add('(prefers-reduced-motion: no-preference)',()=>{gsap.fromTo('.access-copy>*',{opacity:0,y:20},{opacity:1,y:0,duration:.7,stagger:.12,ease:'power3.out',clearProps:'all'});gsap.fromTo('.auth-form-container',{opacity:0,y:14},{opacity:1,y:0,duration:.65,delay:.15,ease:'power3.out',clearProps:'all'});});return()=>mm.revert();},{scope:root});
 return <main ref={root} className="login-layout auth-layout"><section className="login-intro"><Link className="brand" to="/login" aria-label="Tinbana · Iniciar sesión"><BrandLogo/></Link><div className="access-copy"><span className="eyebrow">Dropshipping con dirección</span><h1>Tu próxima idea<br/>está lista para volar.</h1><p>Conecta tu catálogo, crea páginas que hablen de tu marca y reúne cada oportunidad en un mismo lugar.</p></div><OrigamiScene/><div className="access-bottom"><span>De tu idea a tu próxima oportunidad.</span><small>Hecho para emprender en Latinoamérica</small></div></section><section className="login-form panel auth-form-container"><ThemeToggle className="theme-toggle-floating"/>{children}<nav className="auth-legal" aria-label="Documentos legales"><a href="/privacidad">Política de privacidad</a><span aria-hidden="true">·</span><a href="/terminos">Términos y condiciones</a></nav></section></main>;
}
