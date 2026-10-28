import {birdSvg} from './success-bird';

// Success confirmation shown after the purchase form closes: the Tinbana origami bird folds itself together.
// Web Animations API only (no animation library on public landings); skipped under prefers-reduced-motion.
// Focusable parts fade with opacity, never visibility, so focus can move to the button immediately.
const confettiColors=['#ff6a00','#ffba3d','#fd8f45','#d53e06','#ffe0cd'];
const ease='cubic-bezier(.2,.8,.2,1)';const back='cubic-bezier(.34,1.56,.64,1)';
const rand=(min:number,max:number)=>min+Math.random()*(max-min);

/** WhatsApp step of the order confirmation: the customer writes first, so the store can answer without a template. */
export type LeadWhatsApp={link:string;code:string};
export type LeadOrder={number:string;url:string|null};
const waIcon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/></svg>';

export function showLeadSuccess(reduced:boolean,returnFocus:HTMLElement|null,whatsapp:LeadWhatsApp|null=null,order:LeadOrder|null=null){
 const clean=(v:string)=>v.replace(/[^A-Z0-9-]/g,'');const number=order?clean(order.number):whatsapp?clean(whatsapp.code):'';
 const numberHtml=number?`<p class="ls-code">Tu número de pedido: <strong>${number}</strong></p>`:'';
 const lookup=order?.url?`<a class="ls-later ls-lookup" href="${order.url.replace(/"/g,'&quot;')}" target="_blank" rel="noopener noreferrer">Consultar mi pedido</a>`:'';
 const dialog=document.createElement('dialog');dialog.className='lead-success';dialog.setAttribute('aria-labelledby','lead-success-title');dialog.setAttribute('aria-describedby','lead-success-text');
 dialog.innerHTML=`<div class="ls-card"><div class="ls-art"><span class="ls-glow"></span>${birdSvg}<span class="ls-check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span><span class="ls-confetti" aria-hidden="true"></span></div><p class="ls-eyebrow">Solicitud enviada</p><h2 id="lead-success-title">¡Listo, la recibimos!</h2>${whatsapp?`<p id="lead-success-text">Confirma tu pedido por WhatsApp: toca el botón y envía el mensaje que aparece. Te mandamos el resumen al instante.</p><a class="ls-button ls-wa" href="${whatsapp.link.replace(/"/g,'&quot;')}" target="_blank" rel="noopener noreferrer">${waIcon}Confirmar por WhatsApp</a>${numberHtml}<button type="button" class="ls-later">Ahora no</button>`:'<p id="lead-success-text">Gracias por tu pedido. Te contactaremos pronto para confirmar los detalles y el envío.</p><button type="button" class="ls-button">Entendido</button>'+numberHtml+lookup}</div>`;
 document.body.append(dialog);
 const button=dialog.querySelector<HTMLElement>('.ls-button')!;const overflow=document.body.style.overflow;let closing=false;const running:Animation[]=[];
 const play=(el:Element|null,frames:Keyframe[],options:KeyframeAnimationOptions)=>{if(el)running.push(el.animate(frames,{fill:'backwards',...options}));};
 const start=()=>{
  if(reduced)return;
  play(dialog,[{opacity:0,transform:'translateY(24px) scale(.96)'},{opacity:1,transform:'none'}],{duration:360,easing:ease});
  play(dialog.querySelector('.ls-glow'),[{opacity:0,transform:'scale(.4)'},{opacity:1,transform:'scale(1)'}],{duration:600,delay:50,easing:'ease-out'});
  dialog.querySelectorAll('.ls-fold').forEach((fold,i)=>play(fold,[{opacity:0,transform:`scale(.2) rotate(${i%2?28:-28}deg)`},{opacity:1,transform:'none'}],{duration:500,delay:150+i*50,easing:back}));
  play(dialog.querySelector('.ls-bird'),[{transform:'translateX(-18px) rotate(-6deg)'},{transform:'none'}],{duration:800,delay:150,easing:'ease-out'});
  play(dialog.querySelector('.ls-check'),[{transform:'scale(0)'},{transform:'scale(1)'}],{duration:400,delay:800,easing:back});
  play(dialog.querySelector('.ls-check path'),[{strokeDashoffset:24},{strokeDashoffset:0}],{duration:300,delay:920,easing:'ease-out'});
  const confetti=dialog.querySelector<HTMLElement>('.ls-confetti')!;
  for(let i=0;i<14;i++){const piece=document.createElement('i');piece.style.background=confettiColors[i%confettiColors.length];confetti.append(piece);
   running.push(piece.animate([{opacity:1,transform:'translate(0,0) rotate(0) scale(1)'},{opacity:0,transform:`translate(${rand(-150,150)}px,${rand(-120,40)}px) rotate(${rand(-220,220)}deg) scale(${rand(.6,1.2)})`}],{duration:1100,delay:800+i*15,easing:'ease-out',fill:'both'}));}
  dialog.querySelectorAll('.ls-eyebrow,h2,#lead-success-text,.ls-button,.ls-code,.ls-later').forEach((el,i)=>play(el,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:320,delay:500+i*60,easing:'ease-out'}));
  // A short finite glide; no endless motion on the page.
  play(dialog.querySelector('.ls-bird'),[{transform:'none'},{transform:'translateY(-7px) rotate(-2deg)'}],{duration:1400,delay:1300,iterations:4,direction:'alternate',easing:'ease-in-out'});
 };
 const close=()=>{if(closing)return;closing=true;running.forEach(a=>a.cancel());const finish=()=>{dialog.close();dialog.remove();document.body.style.overflow=overflow;returnFocus?.focus();};
  if(reduced){finish();return;}dialog.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(12px)'}],{duration:200,easing:'ease-in'}).finished.then(finish,finish);};
 // The WhatsApp link opens the chat in a new tab and closes the popup; «Ahora no» only closes it.
 button.addEventListener('click',close);dialog.querySelector('.ls-later')?.addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 document.body.style.overflow='hidden';dialog.showModal();button.focus({preventScroll:true});start();
}
