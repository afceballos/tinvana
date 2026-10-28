import {prepareLeadForm} from './lead-form';
import {showLeadSuccess} from './lead-success';
import {initVariantPicker} from './variant-picker';
import './landing-form.css';

// Public landing runtime. No animation library: CSS does the motion, the Web Animations API covers the dialogs.
const preview=document.body.dataset.preview==='true';
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease='cubic-bezier(.2,.8,.2,1)';
const basePrice=document.body.dataset.price===''?null:Number(document.body.dataset.price);
// The chosen variant may have its own price; totals, shipping and the summary follow it.
let price=basePrice;let variantPicker:ReturnType<typeof initVariantPicker>|null=null;
const max=Number(document.body.dataset.maxQuantity)||1;
let quantity=1;
const money=(value:number|null)=>value===null?'Consulta el precio':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value);
function setQuantity(value:number){const before=quantity;quantity=Math.min(max,Math.max(1,Number.isFinite(value)?Math.trunc(value):1));document.querySelectorAll<HTMLInputElement>('[data-quantity],[data-lead-quantity]').forEach(input=>input.value=String(quantity));document.querySelectorAll('[data-summary-quantity]').forEach(el=>el.textContent=String(quantity));document.querySelectorAll('[data-summary-total]').forEach(el=>el.textContent=money(price===null?null:Math.round(price*quantity*100)/100));renderShipping();if(before!==quantity)quoteShipping();}
// Optional Dropi freight by buyer city: the server quotes (and re-quotes on submit); the browser only displays it.
const shippingEnabled=document.body.dataset.shipping==='dropi'&&!preview;let shipping:{state:'idle'|'loading'|'ok'|'none',amount:number|null}={state:'idle',amount:null};let shippingRequest:AbortController|null=null;let shippingTimer=0;
function renderShipping(){if(!shippingEnabled)return;const product=price===null?null:Math.round(price*quantity*100)/100;const label={idle:'Elige tu ciudad',loading:'Calculando…',ok:money(shipping.amount),none:'Se confirma al procesar el pedido'}[shipping.state];document.querySelectorAll('[data-summary-shipping]').forEach(el=>el.textContent=label);document.querySelectorAll('[data-summary-grand]').forEach(el=>el.textContent=shipping.state==='ok'&&product!==null?money(product+(shipping.amount??0)):money(product)+(shipping.state==='ok'?'':' + envío'));}
function quoteShipping(){if(!shippingEnabled)return;const lead=document.querySelector<HTMLFormElement>('#lead-form');const city=lead?.querySelector<HTMLSelectElement>('[name=city_code]')?.value||'';window.clearTimeout(shippingTimer);shippingRequest?.abort();if(!lead||!/^[0-9]{5}$/.test(city)){shipping={state:'idle',amount:null};renderShipping();return;}shipping={state:'loading',amount:null};renderShipping();shippingTimer=window.setTimeout(async()=>{const ctl=new AbortController();shippingRequest=ctl;try{const csrf=lead.querySelector<HTMLInputElement>('[name=csrf]')?.value||'';const r=await fetch(lead.action.replace(/\/lead$/,'/shipping'),{method:'POST',credentials:'same-origin',signal:ctl.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({city_code:city,quantity,csrf,variant_id:variantPicker?.variant?.id||''})});const data=await r.json();shipping=r.ok&&typeof data.amount==='number'?{state:'ok',amount:data.amount}:{state:'none',amount:null};}catch(e){if((e as Error).name==='AbortError')return;shipping={state:'none',amount:null};}renderShipping();},250);}
document.querySelectorAll<HTMLInputElement>('[data-quantity]').forEach(input=>input.addEventListener('change',()=>setQuantity(Number(input.value))));
document.querySelectorAll<HTMLButtonElement>('[data-quantity-step]').forEach(button=>button.addEventListener('click',()=>setQuantity(quantity+Number(button.dataset.quantityStep))));
const pickerRoot=document.querySelector<HTMLElement>('[data-variant-picker]');const summaryImage=document.querySelector<HTMLImageElement>('#purchase-dialog .order-summary img');const baseImage=summaryImage?.getAttribute('src')||'';
if(pickerRoot)variantPicker=initVariantPicker(pickerRoot,variant=>{
 price=variant?.price??basePrice;document.querySelectorAll('[data-summary-unit]').forEach(el=>el.textContent=money(price));
 const next=variant?.image||baseImage;if(summaryImage&&next&&summaryImage.getAttribute('src')!==next){summaryImage.src=next;if(!reduced())summaryImage.animate([{opacity:.35,transform:'scale(.97)'},{opacity:1,transform:'none'}],{duration:240,easing:ease});}
 setQuantity(quantity);quoteShipping();
});

const purchase=document.querySelector<HTMLDialogElement>('#purchase-dialog');
let trigger:HTMLElement|null=null;let closing=false;let overflow='';
// Resolves once the dialog is really closed and the page scroll restored, so anything opened next sees the true state.
function closePurchase():Promise<void>{if(!purchase?.open||closing)return Promise.resolve();closing=true;const finish=()=>{purchase.close();document.body.style.overflow=overflow;trigger?.focus();closing=false;};if(reduced()){finish();return Promise.resolve();}return purchase.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(12px)'}],{duration:170,easing:'ease-in'}).finished.then(finish,finish);}
document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button=>button.addEventListener('click',()=>{if(!purchase||purchase.open)return;setQuantity(quantity);trigger=button;overflow=document.body.style.overflow;document.body.style.overflow='hidden';purchase.showModal();purchase.querySelector<HTMLInputElement>('input[name=first_name]')?.focus();if(!reduced())purchase.animate([{opacity:0,transform:'translateY(24px) scale(.98)'},{opacity:1,transform:'none'}],{duration:320,easing:ease});}));
purchase?.addEventListener('cancel',event=>{event.preventDefault();closePurchase();});
document.querySelector('[data-close-purchase]')?.addEventListener('click',closePurchase);
purchase?.addEventListener('click',event=>{if(event.target===purchase){const r=purchase.getBoundingClientRect();const e=event as MouseEvent;if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePurchase();}});

document.querySelectorAll<HTMLElement>('[data-gallery]').forEach(button=>button.addEventListener('click',()=>{const group=button.closest('[data-gallery-group]');const image=group?.querySelector<HTMLImageElement>('.block-gallery-main img');if(image){image.src=button.dataset.gallery||'';if(!reduced())image.animate([{opacity:.3,transform:'scale(.97)'},{opacity:1,transform:'none'}],{duration:280,easing:ease});group?.querySelectorAll('[data-gallery]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));}}));
const zoom=document.querySelector<HTMLDialogElement>('#image-zoom');let zoomTrigger:HTMLElement|null=null;let zoomOverflow='';
document.querySelectorAll<HTMLElement>('[data-zoom]').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector<HTMLImageElement>('img');const target=zoom?.querySelector('img');if(!image||!target||!zoom||zoom.open)return;zoomTrigger=button;target.src=image.src;target.alt=image.alt;zoomOverflow=document.body.style.overflow;document.body.style.overflow='hidden';zoom.showModal();}));
const closeZoom=()=>{zoom?.close();document.body.style.overflow=zoomOverflow;zoomTrigger?.focus();};document.querySelector('[data-close-zoom]')?.addEventListener('click',closeZoom);zoom?.addEventListener('cancel',event=>{event.preventDefault();closeZoom();});
document.querySelectorAll<HTMLButtonElement>('[data-carousel]').forEach(button=>button.addEventListener('click',()=>{const root=button.closest('.block-inner');const track=root?.querySelector<HTMLElement>('.block-gallery-images,.block-items,.related-products');track?.scrollBy({left:track.clientWidth*Number(button.dataset.carousel),behavior:reduced()?'instant':'smooth'});}));

document.querySelectorAll<HTMLDetailsElement>('.block-accordion').forEach(details=>details.addEventListener('toggle',()=>{if(!details.open||reduced())return;const content=details.querySelector('.accordion-content,.block-specs,.shipping-items,.rich-content');content?.animate([{opacity:.3,transform:'translateY(-6px)'},{opacity:1,transform:'none'}],{duration:240,easing:ease});}));
if(preview){document.querySelectorAll<HTMLElement>('[data-block-id]').forEach(block=>block.addEventListener('click',()=>parent.postMessage({type:'zenzales-select-block',id:block.dataset.blockId},'*')));window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='zenzales-highlight-block')return;document.querySelectorAll<HTMLElement>('[data-block-id]').forEach(block=>block.classList.toggle('preview-selected',block.dataset.blockId===event.data.id));if(Number.isFinite(event.data.restoreY))window.scrollTo(0,event.data.restoreY);if(event.data.scroll)document.getElementById('section-'+String(event.data.id))?.scrollIntoView({behavior:'instant',block:'start'});});window.addEventListener('scroll',()=>parent.postMessage({type:'zenzales-preview-scroll',y:window.scrollY},'*'),{passive:true});parent.postMessage({type:'zenzales-preview-ready'},'*');}

const form=document.querySelector<HTMLFormElement>('#lead-form');if(form)prepareLeadForm(form,purchase);let submitting=false;
form?.querySelector('[name=city_code]')?.addEventListener('change',quoteShipping);form?.querySelector('[name=department_code]')?.addEventListener('change',()=>window.setTimeout(quoteShipping));renderShipping();
form?.addEventListener('submit',async event=>{
 event.preventDefault();if(submitting||preview)return;if(variantPicker&&!variantPicker.validate())return;setQuantity(quantity);submitting=true;
 const status=document.querySelector<HTMLElement>('#lead-status')!;const button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
 button.disabled=true;button.textContent='Enviando solicitud…';form.setAttribute('aria-busy','true');status.dataset.state='pending';status.textContent='Guardando tu solicitud…';
 try{const payload=Object.fromEntries(new FormData(form));const response=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':String(payload.csrf)},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo guardar la solicitud.');status.dataset.state='success';status.textContent=result.message;button.textContent='Solicitud recibida';form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input:not([type=hidden]),select').forEach(input=>input.disabled=true);form.dispatchEvent(new Event('lead-saved'));if(purchase?.open){const returnTo=trigger;void closePurchase().then(()=>showLeadSuccess(reduced(),returnTo,result.whatsapp?.link?result.whatsapp:null));}}
 catch(error){status.dataset.state='error';status.textContent=(error as Error).message;button.disabled=false;button.textContent='Reintentar solicitud';submitting=false;}
 finally{form.setAttribute('aria-busy','false');}
});

// Scroll reveals: content is visible by default; only with JavaScript and motion allowed does it start hidden and appear once.
if(!preview&&!reduced()&&'IntersectionObserver' in window){
 document.body.classList.add('motion-ready');
 const reveal=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;entry.target.classList.add('is-in');reveal.unobserve(entry.target);}),{threshold:.12,rootMargin:'0px 0px -8% 0px'});
 document.querySelectorAll('.landing-block:not(.type-hero)').forEach(block=>{block.querySelectorAll<HTMLElement>('.shipping-item,.related-card,.selected-product-card,.block-accordion,.spec-row,.block-gallery-images>button').forEach((el,i)=>el.style.setProperty('--i',String(i)));reveal.observe(block);});
 window.addEventListener('pagehide',()=>reveal.disconnect());
}

// Sticky purchase bar: visible whenever the hero purchase box is out of view (already passed, or still below a long
// description), except right at the top of the page. Checked on scroll so a fast jump past the box is never missed.
const sticky=document.querySelector<HTMLElement>('[data-sticky-buy]');
if(sticky){
 const anchor=document.querySelector('[data-hero-buy]')||document.querySelector('.purchase-box');let frame=0;
 const update=()=>{frame=0;const r=anchor?.getBoundingClientRect();const visible=window.scrollY>160&&(!r||r.bottom<0||r.top>window.innerHeight);sticky.classList.toggle('is-visible',visible);document.body.classList.toggle('sticky-on',visible);};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});update();
}

// Share menu (<details>, so it opens without JavaScript). Native share on phones when enabled; copy link with confirmation.
const share=document.querySelector<HTMLDetailsElement>('[data-share]');
if(share){
 const url=share.dataset.url||location.href;const title=share.dataset.title||document.title;const status=share.querySelector<HTMLElement>('.share-status');
 const nativeAllowed=share.dataset.native==='true'&&typeof navigator.share==='function';
 const others=share.querySelectorAll('.share-option:not([data-share-native])').length;
 const nativeButton=share.querySelector<HTMLButtonElement>('[data-share-native]');if(nativeButton&&nativeAllowed)nativeButton.hidden=false;
 // Native only (nothing else to choose) or a touch device: go straight to the phone's share sheet.
 if(share.dataset.native==='true'&&!nativeAllowed&&!others)share.hidden=true;
 const nativeShare=async()=>{try{await navigator.share({title,url});share.open=false;}catch{}};
 share.querySelector('summary')?.addEventListener('click',event=>{if(nativeAllowed&&(!others||matchMedia('(pointer: coarse)').matches)){event.preventDefault();void nativeShare();}});
 nativeButton?.addEventListener('click',()=>void nativeShare());
 share.querySelector<HTMLButtonElement>('[data-share-copy]')?.addEventListener('click',async()=>{let ok=false;try{await navigator.clipboard.writeText(url);ok=true;}catch{const field=document.createElement('textarea');field.value=url;document.body.append(field);field.select();try{ok=document.execCommand('copy');}catch{}field.remove();}if(status)status.textContent=ok?'Enlace copiado':'Copia este enlace: '+url;});
 share.addEventListener('toggle',()=>{if(!share.open&&status)status.textContent='';});
 document.addEventListener('click',event=>{if(share.open&&!share.contains(event.target as Node))share.open=false;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&share.open){share.open=false;share.querySelector('summary')?.focus();}});
}

// Store subdomain: ask the main domain (with its session) whether the viewer owns this landing; only then add the shortcut.
const ownerCheck=document.body.dataset.ownerCheck;
if(ownerCheck&&!preview&&!document.querySelector('.owner-edit')){
 fetch(ownerCheck,{credentials:'include'}).then(r=>r.ok?r.json():null).then((data:{owner?:boolean;edit?:string}|null)=>{
  if(!data?.owner||!data.edit||!/^https?:\/\//.test(data.edit))return;
  const link=document.createElement('a');link.className='owner-edit';link.href=data.edit;link.setAttribute('aria-label','Editar esta landing en el panel');
  link.innerHTML='<svg aria-hidden="true" class="block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z M13 7l4 4"/></svg><span>Editar landing</span>';
  document.body.append(link);
 }).catch(()=>{});
}

const pageHeader=document.querySelector<HTMLElement>('.landing-header');
if(pageHeader){
 const menu=pageHeader.querySelector<HTMLDetailsElement>('.landing-menu');const anchors=[...pageHeader.querySelectorAll<HTMLAnchorElement>('[data-section-link]')];let sectionObserver:IntersectionObserver|undefined;
 const current=(id:string)=>anchors.forEach(link=>{if(link.hash==='#'+id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
 const resize=()=>{const offset=pageHeader.classList.contains('is-sticky')?Math.ceil(pageHeader.getBoundingClientRect().height):0;document.body.style.setProperty('--landing-header-offset',offset+'px');sectionObserver?.disconnect();const intersecting=new Set<Element>();sectionObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>entry.isIntersecting?intersecting.add(entry.target):intersecting.delete(entry.target));const first=[...intersecting].sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];if(first)current(first.id);},{rootMargin:`-${offset}px 0px -55% 0px`,threshold:0});document.querySelectorAll('.landing-block').forEach(block=>sectionObserver?.observe(block));};
 const headerSize=new ResizeObserver(resize);headerSize.observe(pageHeader);resize();
 anchors.forEach(link=>link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const target=document.getElementById(link.hash.slice(1));if(!target)return;event.preventDefault();if(menu)menu.open=false;if(!preview)history.pushState(null,'',link.hash);current(target.id);target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'});}));
 const outside=(event:MouseEvent)=>{if(menu?.open&&!menu.contains(event.target as Node))menu.open=false;};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&menu?.open){menu.open=false;menu.querySelector('summary')?.focus();}};
 document.addEventListener('click',outside);document.addEventListener('keydown',escape);
 window.addEventListener('pagehide',()=>{headerSize.disconnect();sectionObserver?.disconnect();document.removeEventListener('click',outside);document.removeEventListener('keydown',escape);});
}
