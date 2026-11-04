import './home.css';
import gsap from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {createRoot} from 'react-dom/client';
import {OrigamiScene} from '../OrigamiScene';
import {ChatDemo} from './ChatDemo';
import {Calculator} from './Calculator';
import {buildFacets,facetPointer} from './facets';
import {initCursor} from './cursor';

gsap.registerPlugin(ScrollTrigger);
const html=document.documentElement;
const $=<T extends Element=HTMLElement>(s:string,r:ParentNode=document)=>r.querySelector<T>(s);
const $$=<T extends Element=HTMLElement>(s:string,r:ParentNode=document)=>[...r.querySelectorAll<T>(s)];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const finePointer=matchMedia('(hover: hover) and (pointer: fine)');

/* ---------- Theme (same storage key as the panel) ---------- */
const THEME_KEY='tinvana-theme';
function applyTheme(next:'light'|'dark'){html.dataset.theme=next;html.style.colorScheme=next;$('meta[name=theme-color]')?.setAttribute('content',next==='dark'?'#14120f':'#fff8f1');
 $$('[data-theme-toggle]').forEach(b=>b.setAttribute('aria-label',next==='dark'?'Cambiar a modo claro':'Cambiar a modo oscuro'));}
applyTheme(html.dataset.theme==='dark'?'dark':'light');
$$('[data-theme-toggle]').forEach(btn=>btn.addEventListener('click',e=>{
 const next=html.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(THEME_KEY,next);}catch{/* private mode */}
 const doc=document as Document&{startViewTransition?:(cb:()=>void)=>{ready:Promise<void>}};
 if(!doc.startViewTransition||reducedMotion.matches){applyTheme(next);return;}
 const x=(e as MouseEvent).clientX||innerWidth-40,y=(e as MouseEvent).clientY||40,r=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
 doc.startViewTransition(()=>applyTheme(next)).ready.then(()=>{html.animate({clipPath:[`circle(0 at ${x}px ${y}px)`,`circle(${r}px at ${x}px ${y}px)`]},{duration:620,easing:'cubic-bezier(.16,1,.3,1)',pseudoElement:'::view-transition-new(root)'});}).catch(()=>{});
}));

/* ---------- Header and mobile menu ---------- */
const header=$('[data-header]')!;
const onScroll=()=>header.classList.toggle('is-scrolled',scrollY>12);onScroll();addEventListener('scroll',onScroll,{passive:true});
const menu=$('#menu')!,menuBtn=$('[data-menu-toggle]')!;
const setMenu=(open:boolean)=>{menu.classList.toggle('is-open',open);menuBtn.setAttribute('aria-expanded',String(open));menuBtn.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');};
menuBtn.addEventListener('click',()=>setMenu(!menu.classList.contains('is-open')));
menu.addEventListener('click',e=>{if((e.target as Element).closest('a'))setMenu(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('is-open')){setMenu(false);menuBtn.focus();}});
$$('[data-year]').forEach(el=>{el.textContent=String(new Date().getFullYear());});

/* ---------- Islands ---------- */
const hero=$('[data-hero]')!;
const birdHost=$('[data-hero-bird]')!;
createRoot(birdHost).render(<OrigamiScene area={hero} tilt={1.6}/>);
const phone=$('.phone');const chat=$('#chat-demo')!;
const chatHost=document.createElement('div');chat.replaceWith(chatHost);createRoot(chatHost).render(<ChatDemo phone={phone}/>);
createRoot($('#calc')!).render(<Calculator/>);

/* ---------- Facets ---------- */
const facetHosts=$$('[data-facets]');facetHosts.forEach((h,i)=>buildFacets(h,7+i*13,innerWidth<700?14:30));

/* ---------- FAQ: animate open/close height, keep native <details> semantics ---------- */
$$<HTMLDetailsElement>('.faq-list details').forEach(d=>{const s=$('summary',d)!,a=$('.faq-a',d)!;
 s.addEventListener('click',e=>{if(reducedMotion.matches)return;e.preventDefault();
  if(d.open){gsap.to(a,{height:0,opacity:0,duration:.3,ease:'power2.in',onComplete:()=>{d.open=false;gsap.set(a,{clearProps:'all'});}});}
  else{d.open=true;gsap.from(a,{height:0,opacity:0,duration:.4,ease:'power3.out',clearProps:'all'});}
 });
});

/* ---------- Features: active item follows scroll (desktop) or click ---------- */
const features=$$('[data-feature]'),screens=$$('[data-screen]');
const activate=(i:number)=>{features.forEach((f,k)=>f.classList.toggle('is-active',k===i));screens.forEach((s,k)=>s.classList.toggle('is-active',k===i));};
features.forEach((f,i)=>f.addEventListener('click',()=>activate(i)));

/* ---------- Preload: once per session, capped at 1.2 s, the bird flies into the hero ---------- */
let introPromise:Promise<void>|null=null;
function intro():Promise<void>{return introPromise??=playIntro();}
function playIntro():Promise<void>{
 const pre=$('.home-preload');
 if(!pre||!html.classList.contains('intro-on'))return Promise.resolve();
 // Late script (slow network): the CSS failsafe already hid the overlay; never bring it back.
 if(performance.now()>1400||getComputedStyle(pre).visibility==='hidden'){pre.classList.add('is-gone');return Promise.resolve();}
 const cap=new Promise(r=>setTimeout(r,Math.max(0,1200-performance.now())));
 return Promise.race([document.fonts?.ready??Promise.resolve(),cap]).then(()=>new Promise<void>(done=>{
  if(performance.now()<300||getComputedStyle(pre).visibility==='hidden'){pre.classList.add('is-gone');done();return;}
  pre.style.animation='none';pre.style.opacity='1';
  const bird=$('.pl-bird',pre)!,from=bird.getBoundingClientRect(),to=$('.origami-fallback,canvas',birdHost)?.getBoundingClientRect()??birdHost.getBoundingClientRect();
  const tl=gsap.timeline({onComplete:()=>{pre.classList.add('is-gone');done();}});
  tl.to($$('.pl-orbit,.pl-ring,.pl-ripple,.pl-shadow,.pl-title,.pl-bar,.pl-brand,.pl-grid',pre),{opacity:0,duration:.25,ease:'power1.out'},0)
   .to(bird,{x:to.left+to.width/2-(from.left+from.width/2),y:to.top+to.height/2-(from.top+from.height/2),scale:to.width/from.width,duration:.6,ease:'power3.inOut'},0)
   .to(pre,{backgroundColor:'transparent',duration:.35},.2)
   .to(bird,{opacity:0,duration:.2},.5);
 }));
}

/* ---------- Motion ---------- */
const mm=gsap.matchMedia();
mm.add({motion:'(prefers-reduced-motion: no-preference)',desktop:'(min-width: 861px)',mobile:'(max-width: 860px)'},ctx=>{
 const {motion,desktop}=ctx.conditions as {motion:boolean;desktop:boolean;mobile:boolean};
 if(!motion){html.classList.remove('js-motion');return;}
 html.classList.add('js-motion');

 // Hero title folds open word by word, like paper. If the script arrives late (the CSS failsafe already showed the
 // hero), skip the entrance instead of hiding visible text again.
 const title=$('[data-fold]')!;
 if(performance.now()>2600){html.classList.add('hero-armed');intro();}else{
 if(!title.querySelector('.w'))title.innerHTML=title.textContent!.trim().split(/\s+/).map(w=>`<span class="w">${w.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!))}</span>`).join(' ');
 gsap.set($$('.w',title),{rotateX:-95,opacity:0,transformPerspective:600});
 gsap.set(['.hero .eyebrow','.hero-sub','.hero-ctas','.hero-points','.mock-hero'],{opacity:0,y:18});
 gsap.set(title,{opacity:1});html.classList.add('hero-armed');
 intro().then(()=>{
  gsap.timeline({defaults:{ease:'expo.out'}})
   .to($$('.w',title),{rotateX:0,opacity:1,duration:.9,stagger:.06},0)
   .to('.hero .eyebrow',{opacity:1,y:0,duration:.6},.05)
   .to(['.hero-sub','.hero-ctas','.hero-points'],{opacity:1,y:0,duration:.7,stagger:.08},.3)
   .to('.mock-hero',{opacity:1,y:0,duration:.8},.45);
 });
 }

 // Reveal once on entering the viewport.
 ScrollTrigger.batch('[data-reveal]',{start:'top 88%',once:true,onEnter:els=>gsap.to(els,{opacity:1,y:0,duration:.7,ease:'power3.out',stagger:.08})});
 ScrollTrigger.batch(['.feature','.step','.soon-card','.faq-list details','.phone','.calc-card'],{start:'top 90%',once:true,onEnter:els=>gsap.from(els,{opacity:0,y:24,scale:.98,duration:.6,ease:'power3.out',stagger:.07,clearProps:'transform,opacity'})});

 // Facet layers drift at different depths while scrolling.
 facetHosts.forEach(h=>$$('g',h).forEach(g=>{const d=+(g.dataset.depth??0);gsap.to(g,{yPercent:-(d+1)*4,ease:'none',scrollTrigger:{trigger:h.parentElement,start:'top bottom',end:'bottom top',scrub:true}});}));

 // Steps: the fold line draws as you scroll.
 gsap.to('.step-progress span',{[desktop?'scaleX':'scaleY']:1,ease:'none',scrollTrigger:{trigger:'.step-line',start:'top 75%',end:'bottom 55%',scrub:.6}});

 // The final bird glides in.
 gsap.from('.final-bird',{y:40,rotation:-8,opacity:0,duration:1,ease:'expo.out',scrollTrigger:{trigger:'.final',start:'top 75%',once:true}});

 if(desktop){
  // Hero bird flies away toward the next section.
  gsap.to(birdHost,{x:120,y:-140,rotation:-10,scale:.86,ease:'none',scrollTrigger:{trigger:hero,start:'top top',end:'bottom top',scrub:.8}});
  gsap.to('.mock-hero',{y:-60,ease:'none',scrollTrigger:{trigger:hero,start:'top top',end:'bottom top',scrub:.8}});

  // Problem: the loose tools fold into one Tinbana triangle.
  const scatter=$('[data-scatter]')!;const tools=$$('.tool',scatter);
  const tl=gsap.timeline({scrollTrigger:{trigger:'.problem',start:'top top',end:'+=700',scrub:.7,pin:true,anticipatePin:1,invalidateOnRefresh:true}});
  tl.to(tools,{x:(_i:number,el:HTMLElement)=>{const s=scatter.getBoundingClientRect(),b=el.getBoundingClientRect();return s.left+s.width/2-(b.left+b.width/2);},
    y:(_i:number,el:HTMLElement)=>{const s=scatter.getBoundingClientRect(),b=el.getBoundingClientRect();return s.top+s.height/2-(b.top+b.height/2);},
    rotation:0,scale:.35,opacity:0,ease:'power2.in',stagger:.04,duration:1},0)
   .to('.unify',{opacity:1,scale:1.15,rotation:-6,ease:'back.out(1.6)',duration:.5},.75);

  // Features follow the scroll position.
  features.forEach((f,i)=>ScrollTrigger.create({trigger:f,start:'top 55%',end:'bottom 45%',onToggle:self=>{if(self.isActive)activate(i);}}));
 }
 return()=>{html.classList.remove('js-motion');};
});
if(reducedMotion.matches)intro();

/* ---------- Pointer interactions (desktop with a mouse, motion allowed) ---------- */
let stopPointer:(()=>void)|null=null;
const pointerSetup=()=>{stopPointer?.();stopPointer=null;if(!finePointer.matches||reducedMotion.matches)return;
 const a=initCursor(),b=facetPointer(facetHosts);
 const titles=$$('.section-head h2,.hero-title');const tx=titles.map(t=>gsap.quickTo(t,'x',{duration:1,ease:'power3.out'}));
 const par=(e:PointerEvent)=>{const k=(e.clientX/innerWidth-.5)*6;tx.forEach(f=>f(k));};document.addEventListener('pointermove',par,{passive:true});
 stopPointer=()=>{a();b();document.removeEventListener('pointermove',par);tx.forEach(f=>f(0));};};
pointerSetup();finePointer.addEventListener('change',pointerSetup);reducedMotion.addEventListener('change',pointerSetup);
