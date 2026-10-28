import {prepareLeadForm} from './lead-form';
import {showLeadSuccess} from './lead-success';
import {initVariantPicker,type PickedVariant,type VariantPicker} from './variant-picker';
import './landing-form.css';

// Public landing runtime. No animation library: CSS does the motion, the Web Animations API covers the dialogs.
const preview=document.body.dataset.preview==='true';
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease='cubic-bezier(.2,.8,.2,1)';
const basePrice=document.body.dataset.price===''?null:Number(document.body.dataset.price);
// The chosen variant may have its own price; totals, shipping and the summary follow it.
let price=basePrice;let variantPicker:VariantPicker|null=null;
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
const summaryImage=document.querySelector<HTMLImageElement>('#purchase-dialog .order-summary img');const baseImage=summaryImage?.getAttribute('src')||'';
const heroImage=document.querySelector<HTMLImageElement>('[data-hero-buy]')?.closest('.landing-block')?.querySelector<HTMLImageElement>('.block-gallery-main img')||null;const heroOriginal=heroImage?.getAttribute('src')||'';
const swap=(img:HTMLImageElement|null,next:string)=>{if(!img||!next||img.getAttribute('src')===next)return;img.src=next;if(!reduced())img.animate([{opacity:.35,transform:'scale(.97)'},{opacity:1,transform:'none'}],{duration:240,easing:ease});};
// The chosen variant sets the price, the photos (form summary and, when it has its own photo, the main image) and totals.
function applyVariant(variant:PickedVariant|null){
 price=variant?.price??basePrice;document.querySelectorAll('[data-summary-unit]').forEach(el=>el.textContent=money(price));
 swap(summaryImage,variant?.image||baseImage);swap(heroImage,variant?.image&&variant.image!==baseImage?variant.image:heroOriginal);
 setQuantity(quantity);quoteShipping();
}
// Two copies may exist (purchase box and form): a choice in one is mirrored in the other.
const pickerRoots=[...document.querySelectorAll<HTMLElement>('[data-variant-picker]')];let pickers:VariantPicker[]=[];let syncing=false;
pickers=pickerRoots.map((root,index)=>initVariantPicker(root,(variant,chosen)=>{if(syncing)return;syncing=true;pickers.forEach((p,i)=>{if(i!==index)p.select(chosen);});syncing=false;applyVariant(variant);}));
variantPicker=pickers.find((_,i)=>pickerRoots[i].querySelector('[data-lead-variant]'))||null;
if(pickers.length)applyVariant((variantPicker||pickers[0]).variant);

const purchase=document.querySelector<HTMLDialogElement>('#purchase-dialog');
let trigger:HTMLElement|null=null;let closing=false;let overflow='';
// Resolves once the dialog is really closed and the page scroll restored, so anything opened next sees the true state.
function closePurchase():Promise<void>{if(!purchase?.open||closing)return Promise.resolve();closing=true;const finish=()=>{purchase.close();document.body.style.overflow=overflow;trigger?.focus();closing=false;};if(reduced()){finish();return Promise.resolve();}return purchase.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(12px)'}],{duration:170,easing:'ease-in'}).finished.then(finish,finish);}
// After a saved order the form starts clean for the next one: fields enabled and empty, quantity 1 and a new request
// id (the previous id keeps protecting that order against a double send). The chosen variant stays.
let leadSaved=false;
function newRequestId(){if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function resetLeadForm(){
 const lead=document.querySelector<HTMLFormElement>('#lead-form');if(!lead||!leadSaved)return;leadSaved=false;
 const keep=variantPicker?.variant?.options||null;lead.reset();
 lead.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input:not([type=hidden]),select').forEach(input=>input.disabled=false);
 const key=lead.querySelector<HTMLInputElement>('[name=idempotency_key]');if(key)key.value=newRequestId();
 const send=lead.querySelector<HTMLButtonElement>('button[type=submit]');if(send){send.disabled=false;send.textContent='Enviar solicitud';}
 const state=lead.querySelector<HTMLElement>('#lead-status');if(state){state.textContent='';delete state.dataset.state;}
 lead.dispatchEvent(new Event('lead-reset'));for(const name of ['country_code','department_code','city_code'])lead.querySelector('[name='+name+']')?.dispatchEvent(new Event('change'));
 if(keep)pickers.forEach(p=>p.select(keep));submitting=false;setQuantity(1);
}
function openPurchase(button:HTMLElement){if(!purchase||purchase.open)return;resetLeadForm();setQuantity(quantity);trigger=button;overflow=document.body.style.overflow;document.body.style.overflow='hidden';purchase.showModal();purchase.querySelector<HTMLInputElement>('input[name=first_name]')?.focus();if(!reduced())purchase.animate([{opacity:0,transform:'translateY(24px) scale(.98)'},{opacity:1,transform:'none'}],{duration:320,easing:ease});}
// Stock: the page starts from the saved copy (data-stock); tapping «Comprar» asks the server, which checks Dropi at most
// once per 10 minutes per product. Sold out: the buy buttons look disabled, the form does not open and a short notice
// explains why. If the check fails the form opens as usual (the server checks again when the form is sent).
const stockUrl=document.querySelector<HTMLFormElement>('#lead-form')?.action.replace(/\/lead$/,'/stock')||'';let stockCheckedAt=0;let toastTimer=0;
function stockNotice(text:string){let toast=document.querySelector<HTMLElement>('.stock-toast');if(!toast){toast=document.createElement('div');toast.className='stock-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);}toast.textContent=text;toast.classList.add('is-visible');window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>toast?.classList.remove('is-visible'),3800);}
function markSoldOut(){document.body.dataset.stock='out';document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button=>{button.setAttribute('aria-disabled','true');button.classList.add('is-sold-out');if(!button.dataset.label)button.dataset.label=button.innerHTML;button.textContent='Agotado';});}
// Back in stock: the buttons recover their original label and work again.
function markInStock(){document.body.dataset.stock='in';document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button=>{button.removeAttribute('aria-disabled');button.classList.remove('is-sold-out');if(button.dataset.label){button.innerHTML=button.dataset.label;delete button.dataset.label;}});}
const soldOutText='Este producto no tiene unidades disponibles por ahora.';
if(document.body.dataset.stock==='out'&&!preview)markSoldOut();
document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button=>button.addEventListener('click',async()=>{
 if(button.getAttribute('aria-busy')==='true')return;
 // A sold-out page also asks again (the server reuses Dropi's answer 10 minutes), so restocked products sell again.
 if(document.body.dataset.stock==='out'&&!preview&&Date.now()-stockCheckedAt<=600000){stockNotice(soldOutText);return;}
 if(!preview&&stockUrl&&Date.now()-stockCheckedAt>600000){
  let label=button.innerHTML;button.setAttribute('aria-busy','true');button.style.minWidth=button.offsetWidth+'px';button.textContent='Verificando…';
  const ctl=new AbortController();const timer=window.setTimeout(()=>ctl.abort(),7000);
  try{const r=await fetch(stockUrl,{credentials:'same-origin',signal:ctl.signal,headers:{Accept:'application/json'}});const s=await r.json();if(r.ok){stockCheckedAt=Date.now();if(s.available===false){button.innerHTML=label;button.removeAttribute('aria-busy');markSoldOut();stockNotice(s.message||soldOutText);return;}if(document.body.dataset.stock==='out'){label=button.dataset.label||label;markInStock();}if(s.variants)pickers.forEach(p=>p.setAvailability(s.variants));}}
  catch{/* Unknown stock: the form opens and the server checks again on submit. */}
  finally{window.clearTimeout(timer);if(button.getAttribute('aria-busy')==='true'){button.innerHTML=label;button.removeAttribute('aria-busy');button.style.minWidth='';}}
 }
 if(document.body.dataset.stock==='out'&&!preview){stockNotice(soldOutText);return;}
 openPurchase(button);
}));
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
 try{const payload=Object.fromEntries(new FormData(form));const response=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':String(payload.csrf)},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok){if(result.sold_out){markSoldOut();window.setTimeout(()=>{void closePurchase().then(()=>stockNotice(soldOutText));},1600);}if(result.sold_out_variant)pickers.forEach(p=>p.setAvailability({[result.sold_out_variant]:false}));throw new Error(result.error||'No se pudo guardar la solicitud.');}leadSaved=true;status.dataset.state='success';status.textContent=result.message;button.textContent='Solicitud recibida';form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input:not([type=hidden]),select').forEach(input=>input.disabled=true);form.dispatchEvent(new Event('lead-saved'));if(purchase?.open){const returnTo=trigger;void closePurchase().then(()=>showLeadSuccess(reduced(),returnTo,result.whatsapp?.link?result.whatsapp:null));}}
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
