// Variant picker (color, size…). The server renders one radio group per option, the variants as JSON and the first
// available variant already chosen. This script keeps the choice, marks combinations that are sold out or do not
// exist, shows the units in stock and reports the chosen variant. The page may have two copies (the purchase box and
// the form dialog); the runtime keeps them in sync with select(). Only the form copy has the hidden variant_id.
export type PickedVariant={id:string;label:string;options:Record<string,string>;price:number|null;image:string|null;available:boolean;stock:number|null};
export type VariantPicker=ReturnType<typeof initVariantPicker>;

const units=(n:number)=>'Disponibles: '+new Intl.NumberFormat('es-CO').format(n)+' '+(n===1?'unidad':'unidades');

export function initVariantPicker(root:HTMLElement,onChange:(variant:PickedVariant|null,chosen:Record<string,string>)=>void){
 const variants:PickedVariant[]=JSON.parse(root.querySelector('[data-vp-data]')?.textContent||'[]');
 const hidden=root.querySelector<HTMLInputElement>('[data-lead-variant]');const error=root.querySelector<HTMLElement>('[data-vp-error]')!;const stock=root.querySelector<HTMLElement>('[data-vp-stock]');
 const groups=[...root.querySelectorAll<HTMLFieldSetElement>('[data-vp-option]')];const chosen:Record<string,string>={};
 const nameOf=(g:HTMLFieldSetElement)=>g.dataset.vpOption||'';
 const matches=(v:PickedVariant,want:Record<string,string>)=>Object.entries(want).every(([k,val])=>v.options[k]===val);
 let current:PickedVariant|null=null;
 function refresh(notify=true){
  for(const group of groups){
   const name=nameOf(group);const others={...chosen};delete others[name];
   group.querySelectorAll<HTMLInputElement>('[data-vp-input]').forEach(input=>{
    // A value is "out" when no available variant has it together with the other options already chosen.
    const out=!variants.some(v=>v.available&&v.options[name]===input.value&&matches(v,others));
    input.closest('.vp-choice')?.classList.toggle('is-out',out);input.setAttribute('aria-label',input.value+(out?', agotado':''));
   });
   const label=group.querySelector<HTMLElement>('[data-vp-current]');if(label)label.textContent=chosen[name]||'';
  }
  const complete=groups.every(g=>chosen[nameOf(g)]);
  const found=complete?variants.find(v=>matches(v,chosen)&&Object.keys(v.options).length===Object.keys(chosen).length)||null:null;
  current=found&&found.available?found:null;if(hidden)hidden.value=current?.id||'';
  const message=complete&&!found?'Esta combinación no está disponible. Elige otra.':complete&&found&&!found.available?'Esta opción está agotada. Elige otra.':'';
  error.textContent=message;error.hidden=message==='';root.classList.toggle('has-error',message!=='');
  if(stock)stock.textContent=current&&current.stock!==null?units(current.stock):'';
  if(notify)onChange(current,{...chosen});
 }
 root.querySelectorAll<HTMLInputElement>('[data-vp-input]').forEach(input=>input.addEventListener('change',()=>{const g=input.closest<HTMLFieldSetElement>('[data-vp-option]');if(g)chosen[nameOf(g)]=input.value;refresh();}));
 // Starting choice: what the server checked (the first available variant), or the only value of a group.
 for(const g of groups){const inputs=[...g.querySelectorAll<HTMLInputElement>('[data-vp-input]')];const pick=inputs.find(i=>i.checked)||(inputs.length===1?inputs[0]:null);if(pick){pick.checked=true;chosen[nameOf(g)]=pick.value;}}
 refresh();
 return {
  /** Shows what is missing and moves focus there; returns false when the choice is not complete. */
  validate():boolean{
   if(current)return true;
   const missing=groups.filter(g=>!chosen[nameOf(g)]).map(g=>nameOf(g).toLowerCase());
   if(missing.length){error.textContent='Elige '+missing.join(' y ')+' para continuar.';error.hidden=false;root.classList.add('has-error');}
   const target=groups.find(g=>!chosen[nameOf(g)])||groups[0];target?.querySelector<HTMLInputElement>('[data-vp-input]')?.focus();
   target?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
   return false;
  },
  get variant(){return current;},
  /** Mirrors the choice made in the other copy, without reporting it back. */
  select(want:Record<string,string>){
   for(const g of groups){const name=nameOf(g);const value=want[name];g.querySelectorAll<HTMLInputElement>('[data-vp-input]').forEach(i=>i.checked=i.value===value);if(value)chosen[name]=value;else delete chosen[name];}
   refresh(false);
  },
  /** Stock just read from Dropi: variants that ran out are marked as sold out (and unchosen if they were chosen). */
  setAvailability(map:Record<string,boolean>){for(const v of variants)if(v.id in map)v.available=map[v.id];refresh();},
 };
}
