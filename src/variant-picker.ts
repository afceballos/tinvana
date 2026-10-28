// Variant picker of the purchase dialog (color, size…). The server renders one radio group per option and the
// variants as JSON; this script keeps the choice, marks combinations that are sold out or do not exist, and reports
// the chosen variant. Without a complete, available choice the hidden variant_id stays empty and the form refuses.
export type PickedVariant={id:string;label:string;options:Record<string,string>;price:number|null;image:string|null;available:boolean};

export function initVariantPicker(root:HTMLElement,onChange:(variant:PickedVariant|null)=>void){
 const variants:PickedVariant[]=JSON.parse(root.querySelector('[data-vp-data]')?.textContent||'[]');
 const hidden=root.querySelector<HTMLInputElement>('[data-lead-variant]')!;const error=root.querySelector<HTMLElement>('[data-vp-error]')!;
 const groups=[...root.querySelectorAll<HTMLFieldSetElement>('[data-vp-option]')];const chosen:Record<string,string>={};
 const matches=(v:PickedVariant,want:Record<string,string>)=>Object.entries(want).every(([k,val])=>v.options[k]===val);
 let current:PickedVariant|null=null;
 function refresh(){
  for(const group of groups){
   const name=group.dataset.vpOption||'';const others={...chosen};delete others[name];
   group.querySelectorAll<HTMLInputElement>('[data-vp-input]').forEach(input=>{
    // A value is "out" when no available variant has it together with the other options already chosen.
    const out=!variants.some(v=>v.available&&v.options[name]===input.value&&matches(v,others));
    input.closest('.vp-choice')?.classList.toggle('is-out',out);input.setAttribute('aria-label',input.value+(out?', agotado':''));
   });
   const label=group.querySelector<HTMLElement>('[data-vp-current]');if(label)label.textContent=chosen[name]||'';
  }
  const complete=groups.every(g=>chosen[g.dataset.vpOption||'']);
  const found=complete?variants.find(v=>matches(v,chosen)&&Object.keys(v.options).length===Object.keys(chosen).length)||null:null;
  current=found&&found.available?found:null;hidden.value=current?.id||'';
  const message=complete&&!found?'Esta combinación no está disponible. Elige otra.':complete&&found&&!found.available?'Esta opción está agotada. Elige otra.':'';
  error.textContent=message;error.hidden=message==='';root.classList.toggle('has-error',message!=='');
  onChange(current);
 }
 root.querySelectorAll<HTMLInputElement>('[data-vp-input]').forEach(input=>input.addEventListener('change',()=>{const g=input.closest<HTMLFieldSetElement>('[data-vp-option]');if(g)chosen[g.dataset.vpOption||'']=input.value;refresh();}));
 // A group with a single value (or a product with one variant) starts chosen.
 for(const g of groups){const inputs=g.querySelectorAll<HTMLInputElement>('[data-vp-input]');if(inputs.length===1){inputs[0].checked=true;chosen[g.dataset.vpOption||'']=inputs[0].value;}}
 refresh();
 return {
  /** Shows what is missing and moves focus there; returns false when the choice is not complete. */
  validate():boolean{
   if(current)return true;
   const missing=groups.filter(g=>!chosen[g.dataset.vpOption||'']).map(g=>(g.dataset.vpOption||'').toLowerCase());
   if(missing.length){error.textContent='Elige '+missing.join(' y ')+' para continuar.';error.hidden=false;root.classList.add('has-error');}
   const target=groups.find(g=>!chosen[g.dataset.vpOption||''])||groups[0];target?.querySelector<HTMLInputElement>('[data-vp-input]')?.focus();
   target?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
   return false;
  },
  get variant(){return current;},
 };
}
