const gallery=document.querySelectorAll('[data-gallery]');
gallery.forEach((button,index)=>{button.setAttribute('aria-pressed',String(index===0));button.addEventListener('click',()=>{const hero=document.getElementById('hero-image');if(hero)hero.src=button.dataset.gallery;gallery.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));});});
const form=document.getElementById('lead-form');let submitting=false;
if(form)form.addEventListener('submit',async event=>{
 event.preventDefault();if(submitting)return;submitting=true;
 const status=document.getElementById('lead-status');const button=form.querySelector('button[type="submit"]');const label=button.textContent;
 button.disabled=true;button.textContent='Enviando consulta…';form.setAttribute('aria-busy','true');status.dataset.state='pending';status.textContent='Guardando tu consulta…';
 try{const payload=Object.fromEntries(new FormData(form));const response=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':payload.csrf},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo guardar la consulta.');status.dataset.state='success';status.textContent=result.message;button.textContent='Consulta recibida';form.querySelectorAll('input:not([type="hidden"])').forEach(input=>input.disabled=true);}
 catch(error){status.dataset.state='error';status.textContent=error.message;button.disabled=false;button.textContent=label;submitting=false;}
 finally{form.setAttribute('aria-busy','false');}
});
