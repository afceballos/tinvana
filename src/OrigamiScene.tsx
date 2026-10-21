import {useEffect,useRef} from 'react';
import gsap from 'gsap';

// Facets traced directly from the supplied Tinvana origami SVG.
const faces=[
 {points:[[100,172],[1644,652],[492,808]],color:'#FF6A00'},
 {points:[[492,808],[1644,652],[1168,880],[1064,1500],[1032,892]],color:'#FFBA3D'},
 {points:[[492,808],[1032,892],[1064,1500],[588,1852],[812,1120]],color:'#D64400'},
 {points:[[812,1120],[284,1584],[588,1852]],color:'#E45100'},
 {points:[[812,1120],[1064,1500],[588,1852]],color:'#FF8A3D'},
 {points:[[1168,880],[1644,652],[1072,1492],[1064,1500]],color:'#ED5200'},
 {points:[[1644,652],[1672,1052],[1072,1492]],color:'#FF983D'},
 {points:[[1644,652],[2152,408],[1860,912],[1672,1052]],color:'#FF6A00'},
 {points:[[1460,500],[2012,80],[2152,408],[1644,652]],color:'#D94800'},
 {points:[[2012,80],[2704,228],[2152,408]],color:'#FF7B20'},
];
export function OrigamiScene(){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=host.current!;const motion=matchMedia('(prefers-reduced-motion: reduce)');const small=matchMedia('(max-width: 760px)');
  if(motion.matches||small.matches)return;
  let disposed=false,cleanup=()=>{};
  async function setup(){
   const T=await import('three');if(disposed)return;
   const canvas=document.createElement('canvas');const context=canvas.getContext('webgl2',{alpha:true,antialias:true});if(!context)return;
   const renderer=new T.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
   renderer.setClearColor(0x000000,0);const scene=new T.Scene();const camera=new T.PerspectiveCamera(32,1,.1,40);camera.position.z=6;
   const bird=new T.Group();bird.rotation.set(.06,-.18,-.1);scene.add(bird);
   type Geometry=InstanceType<typeof T.ShapeGeometry>;const geometries:Geometry[]=[];const materials:InstanceType<typeof T.MeshBasicMaterial>[]=[];
   faces.forEach((face,index)=>{const shape=new T.Shape();face.points.forEach(([x,y],i)=>{const px=(x-1400)/850,py=-(y-970)/850;if(!i)shape.moveTo(px,py);else shape.lineTo(px,py);});shape.closePath();const geometry=new T.ShapeGeometry(shape);const material=new T.MeshBasicMaterial({color:face.color,side:T.DoubleSide});const mesh=new T.Mesh(geometry,material);mesh.position.z=index*.012;bird.add(mesh);geometries.push(geometry);materials.push(material);});
   const eyeGeometry=new T.CircleGeometry(.021,16),eyeMaterial=new T.MeshBasicMaterial({color:'#FFE0CD'});const eye=new T.Mesh(eyeGeometry,eyeMaterial);eye.position.set((2220-1400)/850,-(248-970)/850,.15);bird.add(eye);
   el.append(canvas);el.dataset.ready='true';const target={x:0,y:0};let visible=true;
   const resize=()=>{const {width,height}=el.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();};resize();const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el);
   const timer=new T.Timer();timer.connect(document);const animate=()=>{if(!visible||document.hidden)return;timer.update();const elapsed=timer.getElapsed();bird.position.y=Math.sin(elapsed*.65)*.055;bird.rotation.x=.06+Math.sin(elapsed*.45)*.025+target.y;bird.rotation.y=-.18+target.x;renderer.render(scene,camera);};
   const activate=()=>renderer.setAnimationLoop(visible&&!document.hidden&&!motion.matches?animate:null);
   const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;activate();});observer.observe(el);
   const area=el.parentElement!;const pointer=(event:PointerEvent)=>{const r=area.getBoundingClientRect();target.x=((event.clientX-r.left)/r.width-.5)*.32;target.y=((event.clientY-r.top)/r.height-.5)*.12;};const leave=()=>{target.x=0;target.y=0;};area.addEventListener('pointermove',pointer);area.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',activate);
   const reduce=()=>{if(motion.matches){leave();bird.position.y=0;renderer.render(scene,camera);}activate();};motion.addEventListener('change',reduce);
   const entrance=gsap.fromTo(bird.scale,{x:.85,y:.85,z:.85},{x:1,y:1,z:1,duration:1.3,ease:'power3.out'});activate();
   cleanup=()=>{entrance.kill();renderer.setAnimationLoop(null);observer.disconnect();resizeObserver.disconnect();timer.dispose();area.removeEventListener('pointermove',pointer);area.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',activate);motion.removeEventListener('change',reduce);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());eyeGeometry.dispose();eyeMaterial.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();delete el.dataset.ready;};
  }
  setup().catch(()=>{ /* The supplied SVG remains visible if WebGL is unavailable. */ });return()=>{disposed=true;cleanup();};
 },[]);
 return <div className="origami-scene" ref={host} aria-hidden="true"><img className="origami-fallback" src="/brand/tinvana-origami.svg" alt="" width="560" height="388"/></div>;
}
