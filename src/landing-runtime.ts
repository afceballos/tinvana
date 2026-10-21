import gsap from 'gsap';
import {prepareLeadForm} from './lead-form';
import './landing-form.css';

// Presentation only: retain PHP output, published content and all contracts unchanged.
if(['#193e35','#06444a'].includes(document.body.style.getPropertyValue('--primary').trim()))document.body.classList.add('tinvana-default-palette');
if(['#fafbf7','#f4faf7'].includes(document.body.style.getPropertyValue('--paper').trim()))document.body.classList.add('tinvana-default-paper');
const platformFooter=document.querySelector('body.block-page>footer');
if(platformFooter?.textContent?.startsWith('Zenzales ·'))platformFooter.textContent=platformFooter.textContent.replace(/^Zenzales/,'Tinvana');
document.querySelectorAll<HTMLImageElement>('img[src="/brand/logo-white.png"]').forEach(image=>{image.src='/brand/tinvana-light.svg';image.alt='Tinvana';});
if(!document.querySelector('link[rel="icon"]')){const favicon=document.createElement('link');favicon.rel='icon';favicon.type='image/svg+xml';favicon.href='/brand/tinvana-origami.svg';document.head.append(favicon);}

const preview=document.body.dataset.preview==='true';
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const price=document.body.dataset.price===''?null:Number(document.body.dataset.price);
const max=Number(document.body.dataset.maxQuantity)||1;
let quantity=1;
const money=(value:number|null)=>value===null?'Consulta el precio':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value);
function setQuantity(value:number){quantity=Math.min(max,Math.max(1,Number.isFinite(value)?Math.trunc(value):1));document.querySelectorAll<HTMLInputElement>('[data-quantity],[data-lead-quantity]').forEach(input=>input.value=String(quantity));document.querySelectorAll('[data-summary-quantity]').forEach(el=>el.textContent=String(quantity));document.querySelectorAll('[data-summary-total]').forEach(el=>el.textContent=money(price===null?null:Math.round(price*quantity*100)/100));}
document.querySelectorAll<HTMLInputElement>('[data-quantity]').forEach(input=>input.addEventListener('change',()=>setQuantity(Number(input.value))));
document.querySelectorAll<HTMLButtonElement>('[data-quantity-step]').forEach(button=>button.addEventListener('click',()=>setQuantity(quantity+Number(button.dataset.quantityStep))));

const purchase=document.querySelector<HTMLDialogElement>('#purchase-dialog');
let trigger:HTMLElement|null=null;let closing=false;let overflow='';let modalTween:gsap.core.Tween|undefined;
function closePurchase(){if(!purchase?.open||closing)return;closing=true;modalTween?.kill();const finish=()=>{purchase.close();document.body.style.overflow=overflow;trigger?.focus();closing=false;gsap.set(purchase,{clearProps:'all'});};if(reduced()){finish();return;}modalTween=gsap.to(purchase,{opacity:0,y:12,duration:.17,onComplete:finish});}
document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button=>button.addEventListener('click',()=>{if(!purchase||purchase.open)return;setQuantity(quantity);trigger=button;overflow=document.body.style.overflow;document.body.style.overflow='hidden';purchase.showModal();purchase.querySelector<HTMLInputElement>('input[name=first_name]')?.focus();if(!reduced())modalTween=gsap.fromTo(purchase,{opacity:0,y:24,scale:.98},{opacity:1,y:0,scale:1,duration:.32,ease:'power3.out',clearProps:'all'});}));
purchase?.addEventListener('cancel',event=>{event.preventDefault();closePurchase();});
document.querySelector('[data-close-purchase]')?.addEventListener('click',closePurchase);
purchase?.addEventListener('click',event=>{if(event.target===purchase){const r=purchase.getBoundingClientRect();const e=event as MouseEvent;if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePurchase();}});

document.querySelectorAll<HTMLElement>('[data-gallery]').forEach(button=>button.addEventListener('click',()=>{const group=button.closest('[data-gallery-group]');const image=group?.querySelector<HTMLImageElement>('.block-gallery-main img');if(image){image.src=button.dataset.gallery||'';group?.querySelectorAll('[data-gallery]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));}}));
const zoom=document.querySelector<HTMLDialogElement>('#image-zoom');let zoomTrigger:HTMLElement|null=null;let zoomOverflow='';
document.querySelectorAll<HTMLElement>('[data-zoom]').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector<HTMLImageElement>('img');const target=zoom?.querySelector('img');if(!image||!target||!zoom||zoom.open)return;zoomTrigger=button;target.src=image.src;target.alt=image.alt;zoomOverflow=document.body.style.overflow;document.body.style.overflow='hidden';zoom.showModal();}));
const closeZoom=()=>{zoom?.close();document.body.style.overflow=zoomOverflow;zoomTrigger?.focus();};document.querySelector('[data-close-zoom]')?.addEventListener('click',closeZoom);zoom?.addEventListener('cancel',event=>{event.preventDefault();closeZoom();});
document.querySelectorAll<HTMLButtonElement>('[data-carousel]').forEach(button=>button.addEventListener('click',()=>{const root=button.closest('.block-inner');const track=root?.querySelector<HTMLElement>('.block-gallery-images,.block-items,.related-products');track?.scrollBy({left:track.clientWidth*Number(button.dataset.carousel),behavior:reduced()?'instant':'smooth'});}));

const faqTweens=new Map<Element,gsap.core.Tween>();
document.querySelectorAll<HTMLDetailsElement>('.block-accordion').forEach(details=>details.addEventListener('toggle',()=>{faqTweens.get(details)?.kill();if(details.open&&!reduced()){const content=details.querySelector('.accordion-content,.block-specs,.shipping-items');if(content)faqTweens.set(details,gsap.fromTo(content,{opacity:.4,y:-4},{opacity:1,y:0,duration:.22,clearProps:'all'}));}}));
if(preview){document.querySelectorAll<HTMLElement>('[data-block-id]').forEach(block=>block.addEventListener('click',()=>parent.postMessage({type:'zenzales-select-block',id:block.dataset.blockId},'*')));window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='zenzales-highlight-block')return;document.querySelectorAll<HTMLElement>('[data-block-id]').forEach(block=>block.classList.toggle('preview-selected',block.dataset.blockId===event.data.id));if(Number.isFinite(event.data.restoreY))window.scrollTo(0,event.data.restoreY);if(event.data.scroll)document.getElementById('section-'+String(event.data.id))?.scrollIntoView({behavior:'instant',block:'start'});});window.addEventListener('scroll',()=>parent.postMessage({type:'zenzales-preview-scroll',y:window.scrollY},'*'),{passive:true});parent.postMessage({type:'zenzales-preview-ready'},'*');}

const form=document.querySelector<HTMLFormElement>('#lead-form');if(form)prepareLeadForm(form,purchase);let submitting=false;
form?.addEventListener('submit',async event=>{
 event.preventDefault();if(submitting||preview)return;setQuantity(quantity);submitting=true;
 const status=document.querySelector<HTMLElement>('#lead-status')!;const button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
 button.disabled=true;button.textContent='Enviando solicitud…';form.setAttribute('aria-busy','true');status.dataset.state='pending';status.textContent='Guardando tu solicitud…';
 try{const payload=Object.fromEntries(new FormData(form));const response=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':String(payload.csrf)},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo guardar la solicitud.');status.dataset.state='success';status.textContent=result.message;button.textContent='Solicitud recibida';form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input:not([type=hidden]),select').forEach(input=>input.disabled=true);form.dispatchEvent(new Event('lead-saved'));if(!reduced())gsap.fromTo(status,{opacity:.4,y:6},{opacity:1,y:0,duration:.25,clearProps:'all'});}
 catch(error){status.dataset.state='error';status.textContent=(error as Error).message;button.disabled=false;button.textContent='Reintentar solicitud';submitting=false;}
 finally{form.setAttribute('aria-busy','false');}
});

const media=gsap.matchMedia();
if(!preview)media.add('(prefers-reduced-motion: no-preference)',context=>{
 const hero=document.querySelector('.type-hero .hero-copy');if(hero)gsap.fromTo(hero,{opacity:.6,y:12},{opacity:1,y:0,duration:.4,ease:'power2.out',clearProps:'all'});
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;observer.unobserve(entry.target);context.add(()=>gsap.fromTo(entry.target.querySelectorAll('.block-item'),{opacity:.4,y:12},{opacity:1,y:0,duration:.35,stagger:{amount:.18},clearProps:'all'}));}),{threshold:.1});document.querySelectorAll('.type-benefits,.type-usage').forEach(el=>observer.observe(el));return()=>observer.disconnect();
});
window.addEventListener('pagehide',()=>{media.revert();modalTween?.kill();faqTweens.forEach(tween=>tween.kill());});

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
