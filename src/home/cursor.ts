import gsap from 'gsap';

/** Minimal brand cursor: an exact dot plus a trailing paper facet that turns toward the movement.
 *  Only for fine pointers with motion allowed; states come from data-cursor via delegation (no per-element listeners). */
const LABELS:Record<string,string>={card:'Ver',demo:'▶ Ver demo'};

export function initCursor(){
 const root=document.querySelector<HTMLElement>('.cursor');if(!root)return()=>{};
 const dot=root.querySelector<HTMLElement>('.cursor-dot')!,facet=root.querySelector<HTMLElement>('.cursor-facet')!,label=facet.querySelector('em')!;
 document.documentElement.classList.add('has-cursor');
 gsap.set([dot,facet],{xPercent:0,yPercent:0,x:-100,y:-100});
 const dx=gsap.quickTo(dot,'x',{duration:.08,ease:'none'}),dy=gsap.quickTo(dot,'y',{duration:.08,ease:'none'});
 const fx=gsap.quickTo(facet,'x',{duration:.42,ease:'power3.out'}),fy=gsap.quickTo(facet,'y',{duration:.42,ease:'power3.out'}),fr=gsap.quickTo(facet,'rotation',{duration:.6,ease:'power3.out'});
 let state='',lastX=0,lastY=0,snap:HTMLElement|null=null,snapBox:DOMRect|null=null;
 const magnets=new WeakMap<HTMLElement,{x:(v:number)=>void;y:(v:number)=>void}>();
 const setState=(next:string,text='')=>{if(next===state&&label.textContent===text)return;root.classList.remove('is-'+state,'is-label');state=next;if(next)root.classList.add('is-'+next);label.textContent=text;if(text)root.classList.add('is-label');};
 const move=(e:PointerEvent)=>{
  if(e.pointerType!=='mouse')return;
  const x=e.clientX,y=e.clientY;dx(x);dy(y);
  if(snap&&snapBox&&(state==='link'||state==='cta')){const cx=snapBox.left+snapBox.width/2,cy=snapBox.top+snapBox.height/2;fx(cx+(x-cx)*.25);fy(cy+(y-cy)*.25);}
  else{fx(x);fy(y);const vx=x-lastX,vy=y-lastY;if(Math.abs(vx)+Math.abs(vy)>2)fr(Math.atan2(vy,vx)*180/Math.PI+90);}
  lastX=x;lastY=y;
  const m=snap?.hasAttribute('data-magnetic')&&snapBox?magnets.get(snap):null;
  if(m&&snapBox){m.x((x-(snapBox.left+snapBox.width/2))*.25);m.y((y-(snapBox.top+snapBox.height/2))*.3);}
  if(state==='card'&&snap){snap.style.setProperty('--mx',(x-snapBox!.left)+'px');snap.style.setProperty('--my',(y-snapBox!.top)+'px');}
 };
 const over=(e:PointerEvent)=>{
  const t=e.target as Element;
  if(t.closest('input,textarea,select,[contenteditable]')){setState('text');return;}
  const el=t.closest<HTMLElement>('[data-cursor],a,button,summary');
  if(el===snap)return;
  release();
  if(!el){setState('');return;}
  const kind=el.dataset.cursor||'link';snap=el;snapBox=el.getBoundingClientRect();
  if(el.hasAttribute('data-magnetic')&&!magnets.has(el))magnets.set(el,{x:gsap.quickTo(el,'x',{duration:.5,ease:'power3.out'}),y:gsap.quickTo(el,'y',{duration:.5,ease:'power3.out'})});
  setState(kind==='link'||kind==='cta'||kind==='card'||kind==='demo'||kind==='theme'?kind==='demo'?'card':kind:'link',LABELS[kind]??'');
  if(kind==='cta'||kind==='link'){gsap.to(facet,{rotation:0,duration:.3});}
 };
 const release=()=>{if(snap&&magnets.has(snap)){const m=magnets.get(snap)!;m.x(0);m.y(0);}snap=null;snapBox=null;};
 const down=(e:PointerEvent)=>{if(e.pointerType!=='mouse')return;gsap.to(dot,{scale:.6,duration:.12,yoyo:true,repeat:1});
  for(let i=0;i<3;i++){const b=document.createElement('span');b.className='cursor-burst';document.body.append(b);const a=-Math.PI/2+(i-1)*.9;
   gsap.fromTo(b,{x:e.clientX,y:e.clientY,rotation:i*40,scale:1,opacity:.9},{x:e.clientX+Math.cos(a)*26,y:e.clientY+Math.sin(a)*26,rotation:i*40+90,scale:.3,opacity:0,duration:.42,ease:'power2.out',onComplete:()=>b.remove()});}};
 const leave=()=>{root.classList.add('is-hidden');release();};
 const enter=()=>root.classList.remove('is-hidden');
 const key=(e:KeyboardEvent)=>{if(e.key==='Tab')root.classList.add('is-hidden');};
 const remeasure=()=>{if(snap)snapBox=snap.getBoundingClientRect();};
 document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerover',over,{passive:true});document.addEventListener('pointerdown',down,{passive:true});
 document.documentElement.addEventListener('pointerleave',leave);document.documentElement.addEventListener('pointerenter',enter);document.addEventListener('pointermove',enter,{passive:true,once:false});
 document.addEventListener('keydown',key);addEventListener('scroll',remeasure,{passive:true});addEventListener('resize',remeasure);
 return()=>{document.documentElement.classList.remove('has-cursor');document.removeEventListener('pointermove',move);document.removeEventListener('pointerover',over);document.removeEventListener('pointerdown',down);
  document.documentElement.removeEventListener('pointerleave',leave);document.documentElement.removeEventListener('pointerenter',enter);document.removeEventListener('pointermove',enter);document.removeEventListener('keydown',key);removeEventListener('scroll',remeasure);removeEventListener('resize',remeasure);};
}
