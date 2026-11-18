// Phase B: «Arma tu kit» on a public landing. The buyer picks a size and fills it with pieces; the choice travels to the
// order form as JSON (name="kit") and the server validates it and sets the price (Kits::apply). One kit per order.
type Size={id:string;label:string;pieces:number;price:number|null};
type Piece={id:string;name:string;max:number|null;out:boolean};

export function initKit(money:(v:number|null)=>void|string,onPrice:(price:number|null)=>void){
 const found=document.querySelector<HTMLElement>('[data-kit-block]');if(!found)return;const root:HTMLElement=found;
 let cfg:{sizes:Size[];pieces:Piece[]};try{cfg=JSON.parse(root.dataset.kit||'');}catch{return;}
 if(!cfg.sizes?.length)return;
 let size=cfg.sizes[0];const counts=new Map<string,number>(cfg.pieces.map(p=>[p.id,0]));
 const fmt=money as (v:number|null)=>string;
 const total=()=>[...counts.values()].reduce((a,b)=>a+b,0);
 const complete=()=>total()===size.pieces;
 const summary=root.querySelector<HTMLElement>('[data-kit-summary]')!;
 const text=()=>size.label+': '+cfg.pieces.filter(p=>(counts.get(p.id)||0)>0).map(p=>counts.get(p.id)+' × '+p.name).join(', ');
 function render(){
  const n=total(),left=size.pieces-n;
  root.querySelector('[data-kit-count]')!.textContent=String(n);root.querySelector('[data-kit-total]')!.textContent=String(size.pieces);
  root.querySelector<HTMLElement>('[data-kit-bar]')!.style.width=Math.min(100,Math.round(n/size.pieces*100))+'%';
  root.classList.toggle('is-complete',left===0);
  root.querySelectorAll<HTMLButtonElement>('[data-kit-size]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.kitSize===size.id)));
  for(const p of cfg.pieces){
   const li=root.querySelector<HTMLElement>(`[data-kit-piece="${CSS.escape(p.id)}"]`);if(!li)continue;const c=counts.get(p.id)||0;
   li.querySelector('[data-kit-n]')!.textContent=String(c);li.classList.toggle('is-picked',c>0);
   li.querySelector<HTMLButtonElement>('[data-kit-step="-1"]')!.disabled=c===0;
   li.querySelector<HTMLButtonElement>('[data-kit-step="1"]')!.disabled=p.out||left<=0||(p.max!==null&&c>=p.max);
  }
  summary.classList.remove('is-warn');
  summary.textContent=n===0?'Suma piezas hasta completar tu '+size.label.toLowerCase()+'.':left>0?'Te '+(left===1?'falta 1 pieza':'faltan '+left+' piezas')+' · '+text():'¡Listo! '+text()+' · '+fmt(size.price);
  const input=document.querySelector<HTMLInputElement>('[data-kit-input]');
  if(input)input.value=left===0?JSON.stringify({size:size.id,pieces:Object.fromEntries([...counts].filter(([,v])=>v>0))}):'';
  const line=document.querySelector<HTMLElement>('[data-kit-order]');if(line){line.hidden=left!==0;line.textContent=left===0?text():'';}
  onPrice(size.price);
 }
 root.querySelectorAll<HTMLButtonElement>('[data-kit-size]').forEach(b=>b.addEventListener('click',()=>{
  const next=cfg.sizes.find(s=>s.id===b.dataset.kitSize);if(!next||next.id===size.id)return;size=next;
  // A smaller kit keeps the pieces only while they fit; otherwise the buyer starts again.
  if(total()>size.pieces)for(const k of counts.keys())counts.set(k,0);render();
 }));
 root.querySelectorAll<HTMLElement>('[data-kit-piece]').forEach(li=>li.querySelectorAll<HTMLButtonElement>('[data-kit-step]').forEach(b=>b.addEventListener('click',()=>{
  const id=li.dataset.kitPiece!,p=cfg.pieces.find(x=>x.id===id);if(!p)return;const c=counts.get(id)||0,step=Number(b.dataset.kitStep);
  if(step>0&&(p.out||total()>=size.pieces||(p.max!==null&&c>=p.max)))return;counts.set(id,Math.max(0,c+step));render();
 })));
 // Any «Pedir» button waits for a complete kit: it brings the buyer back to the kit and says what is missing.
 document.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest('[data-buy]');if(!b||complete())return;e.preventDefault();e.stopImmediatePropagation();
  root.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  const left=size.pieces-total();summary.textContent='Completa tu kit antes de pedir: '+(left===1?'falta 1 pieza':'faltan '+left+' piezas')+'.';summary.classList.add('is-warn');},true);
 document.querySelector('#lead-form')?.addEventListener('lead-reset',render);
 render();
}
