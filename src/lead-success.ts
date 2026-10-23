import gsap from 'gsap';
import {birdSvg} from './success-bird';

// Success confirmation shown after the purchase form closes: the Tinvana origami bird folds itself together.
// Colours come from the landing (--primary, --paper); motion is skipped under prefers-reduced-motion.
// Focusable parts fade with opacity, not autoAlpha: visibility:hidden would block moving focus to the button.
const confettiColors=['#ff6a00','#ffba3d','#fd8f45','#d53e06','#ffe0cd'];

export function showLeadSuccess(reduced:boolean,returnFocus:HTMLElement|null){
 const dialog=document.createElement('dialog');dialog.className='lead-success';dialog.setAttribute('aria-labelledby','lead-success-title');dialog.setAttribute('aria-describedby','lead-success-text');
 dialog.innerHTML=`<div class="ls-card"><div class="ls-art"><span class="ls-glow"></span>${birdSvg}<span class="ls-check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span><span class="ls-confetti" aria-hidden="true"></span></div><p class="ls-eyebrow">Solicitud enviada</p><h2 id="lead-success-title">¡Listo, la recibimos!</h2><p id="lead-success-text">Gracias por tu pedido. Te contactaremos pronto para confirmar los detalles y el envío.</p><button type="button" class="ls-button">Entendido</button></div>`;
 document.body.append(dialog);
 const button=dialog.querySelector<HTMLButtonElement>('.ls-button')!;const overflow=document.body.style.overflow;let closing=false;
 const timeline=gsap.timeline({paused:true});
 if(!reduced){
  const confetti=dialog.querySelector<HTMLElement>('.ls-confetti')!;
  const pieces=Array.from({length:14},(_,i)=>{const piece=document.createElement('i');piece.style.background=confettiColors[i%confettiColors.length];confetti.append(piece);return piece;});
  timeline
   .fromTo(dialog,{opacity:0,y:24,scale:.96},{opacity:1,y:0,scale:1,duration:.36,ease:'power3.out'})
   .fromTo(dialog.querySelector('.ls-glow'),{scale:.4,autoAlpha:0},{scale:1,autoAlpha:1,duration:.6,ease:'power2.out'},'<.05')
   .fromTo(dialog.querySelectorAll('.ls-fold'),{autoAlpha:0,scale:.2,rotation:(i:number)=>i%2?28:-28,transformOrigin:'50% 50%'},{autoAlpha:1,scale:1,rotation:0,duration:.5,ease:'back.out(1.6)',stagger:.05},'<.1')
   .fromTo(dialog.querySelector('.ls-bird'),{x:-18,rotation:-6},{x:0,rotation:0,duration:.8,ease:'power2.out'},'<')
   .fromTo(dialog.querySelector('.ls-check'),{scale:0},{scale:1,duration:.4,ease:'back.out(2.2)'},'-=.15')
   .fromTo(dialog.querySelector('.ls-check path'),{strokeDashoffset:24},{strokeDashoffset:0,duration:.3,ease:'power1.out'},'<.12')
   .fromTo(pieces,{x:0,y:0,rotation:0,autoAlpha:1,scale:1},{x:()=>gsap.utils.random(-150,150),y:()=>gsap.utils.random(-120,40),rotation:()=>gsap.utils.random(-220,220),scale:()=>gsap.utils.random(.6,1.2),autoAlpha:0,duration:1.1,ease:'power2.out',stagger:.015},'<')
   .fromTo(dialog.querySelectorAll('.ls-eyebrow,h2,#lead-success-text,.ls-button'),{opacity:0,y:10},{opacity:1,y:0,duration:.32,ease:'power2.out',stagger:.06},'-=1')
   // A short finite glide; no endless motion on the page.
   .to(dialog.querySelector('.ls-bird'),{y:-7,rotation:-2,duration:1.4,ease:'sine.inOut',yoyo:true,repeat:3});
 }
 const close=()=>{if(closing)return;closing=true;timeline.kill();const finish=()=>{dialog.close();dialog.remove();document.body.style.overflow=overflow;returnFocus?.focus();};
  if(reduced){finish();return;}gsap.to(dialog,{opacity:0,y:12,duration:.2,ease:'power2.in',onComplete:finish});};
 button.addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 document.body.style.overflow='hidden';dialog.showModal();button.focus({preventScroll:true});timeline.play();
}
