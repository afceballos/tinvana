import gsap from 'gsap';

/** Decorative paper facets: deterministic triangles in three depth layers; near the pointer they lift like paper in the air. */
const NS='http://www.w3.org/2000/svg';

function rng(seed:number){return()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};}

export function buildFacets(host:HTMLElement,seed:number,count:number){
 const rand=rng(seed),svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');
 const layers=[0,1,2].map(depth=>{const g=document.createElementNS(NS,'g');g.dataset.depth=String(depth);svg.append(g);return g;});
 for(let i=0;i<count;i++){
  // Keep the centre lighter so text stays readable: facets cluster at the edges.
  const side=rand()<.3,cx=side?rand()*110:640+rand()*360,cy=rand()*1000,size=18+rand()*58*(1+(i%3)*.3),angle=rand()*Math.PI*2;
  const pts=[0,1,2].map(k=>{const a=angle+k*(Math.PI*2/3)+(rand()-.5)*.6,r=size*(.6+rand()*.5);return`${(cx+Math.cos(a)*r).toFixed(1)},${(cy+Math.sin(a)*r*1.1).toFixed(1)}`;}).join(' ');
  const p=document.createElementNS(NS,'polygon');p.setAttribute('points',pts);p.setAttribute('class','t'+(1+Math.floor(rand()*4)));p.dataset.cx=String(cx);p.dataset.cy=String(cy);
  layers[i%3].append(p);
 }
 host.append(svg);return svg;
}

/** Pointer lift (fine pointers only). One passive pointermove, one update per frame, only for facets on screen. */
export function facetPointer(hosts:HTMLElement[]){
 type Item={el:SVGPolygonElement;cx:number;cy:number;y:(v:number)=>void;r:(v:number)=>void;s:(v:number)=>void;lifted:boolean};
 const groups=new Map<HTMLElement,{items:Item[];visible:boolean;box:DOMRect}>();
 const io=new IntersectionObserver(entries=>entries.forEach(e=>{const g=groups.get(e.target as HTMLElement);if(g){g.visible=e.isIntersecting;g.box=e.target.getBoundingClientRect();}}));
 hosts.forEach(host=>{
  const items=[...host.querySelectorAll<SVGPolygonElement>('polygon')].map(el=>({el,cx:+el.dataset.cx!,cy:+el.dataset.cy!,y:gsap.quickTo(el,'y',{duration:.6,ease:'power3.out'}),r:gsap.quickTo(el,'rotation',{duration:.8,ease:'power3.out'}),s:gsap.quickTo(el,'scale',{duration:.6,ease:'power3.out'}),lifted:false}));
  groups.set(host,{items,visible:false,box:host.getBoundingClientRect()});io.observe(host);
 });
 let px=-1e4,py=-1e4,frame=0;
 const measure=()=>groups.forEach((g,host)=>{g.box=host.getBoundingClientRect();});
 const tick=()=>{frame=0;groups.forEach(g=>{if(!g.visible)return;const {left,top,width,height}=g.box;g.items.forEach(it=>{const x=left+it.cx/1000*width,y=top+it.cy/1000*height,d=Math.hypot(px-x,py-y),k=Math.max(0,1-d/160);
   if(k>0){it.y(-14*k);it.r((px<x?1:-1)*10*k);it.s(1+.08*k);it.lifted=true;}else if(it.lifted){it.y(0);it.r(0);it.s(1);it.lifted=false;}});});};
 const move=(e:PointerEvent)=>{px=e.clientX;py=e.clientY;if(!frame)frame=requestAnimationFrame(tick);};
 const scroll=()=>{measure();if(!frame)frame=requestAnimationFrame(tick);};
 document.addEventListener('pointermove',move,{passive:true});addEventListener('scroll',scroll,{passive:true});addEventListener('resize',measure);
 return()=>{io.disconnect();document.removeEventListener('pointermove',move);removeEventListener('scroll',scroll);removeEventListener('resize',measure);cancelAnimationFrame(frame);};
}
