import {floatingPhone} from './floating-panel';
import {enhanceSelect,collator} from './search-select';
import intlTelInput from 'intl-tel-input';
import {es} from 'intl-tel-input/locale';
import 'intl-tel-input/styles-no-assets';

export function prepareLeadForm(form:HTMLFormElement,modal:HTMLDialogElement|null){
 prepareFormHelp(form,modal);
 const country=form.querySelector<HTMLSelectElement>('[name=country_code]');const department=form.querySelector<HTMLSelectElement>('[name=department_code]');const city=form.querySelector<HTMLSelectElement>('[name=city_code]');
 if(country&&department&&city){
  const all=[...city.querySelectorAll<HTMLOptionElement>('option[data-department]')].map(option=>({value:option.value,name:option.textContent||'',department:option.dataset.department}));
  const update=(keep=false)=>{const selected=keep?city.value:'';city.replaceChildren(new Option(department.value?'Seleccionar ciudad':'Primero selecciona un departamento',''));if(country.value==='CO'&&department.value){for(const option of all.filter(item=>item.department===department.value).sort((a,b)=>collator.compare(a.name,b.name)))city.add(new Option(option.name,option.value));}city.disabled=!department.value||country.value!=='CO';if(selected&&[...city.options].some(option=>option.value===selected))city.value=selected;};
  department.addEventListener('change',()=>update());country.addEventListener('change',()=>{department.value='';update();});update(true);
 }
 const pickers:ReturnType<typeof enhanceSelect>[]=[];
 for(const [name,title] of [['country_code','Pa\u00eds de entrega'],['department_code','Departamento'],['city_code','Seleccionar ciudad']]){
  const select=form.querySelector<HTMLSelectElement>('[name='+name+']');if(!select)continue;
  const selected=select.value;const placeholder=select.querySelector('option[value=""]');const sorted=[...select.options].filter(option=>option.value).sort((a,b)=>collator.compare(a.text,b.text));select.replaceChildren(...(placeholder?[placeholder]:[]),...sorted);select.value=selected;
  const old=select.closest('label');if(old){const field=document.createElement('div');field.className='geo-field';const label=document.createElement('label');select.id=select.id||'delivery-'+name;label.htmlFor=select.id;label.textContent=title;old.before(field);field.append(label,select);old.remove();}
  pickers.push(enhanceSelect(select,title,name==='country_code'));
 }
 modal?.addEventListener('close',()=>pickers.forEach(picker=>picker.close()));window.addEventListener('pagehide',()=>pickers.forEach(picker=>picker.destroy()),{once:true});
 const input=form.querySelector<HTMLInputElement>('[name=phone]');const fallback=form.querySelector<HTMLSelectElement>('[name=phone_country]');
 if(input&&fallback){
  try{
   const initialCountry=intlTelInput.getAllCountries().find(country=>country.iso2===fallback.value.toLowerCase())?.iso2||'co';
   const countryList=document.createElement('div');countryList.className='phone-country-dropdown';input.closest('.phone-field')?.append(countryList);
   const instance=intlTelInput(input,{initialCountry,countryNameLocale:'es',uiTranslations:es,separateDialCode:true,countrySearch:true,countrySelectorMode:'DROPDOWN',dropdownParent:countryList,matchDropdownWidth:true,formatAsYouType:false});
   const stopFloating=floatingPhone(input,countryList);
   // The native select is hidden once enhanced: mirror the flag picker into it and clear any pending message.
   const sync=()=>{const iso=instance.getSelectedCountry()?.iso2?.toUpperCase()||'';fallback.value=[...fallback.options].some(option=>option.value===iso)?iso:'';input.setCustomValidity('');input.removeAttribute('aria-invalid');};
   input.addEventListener('countrychange',sync);input.addEventListener('input',()=>{if(fallback.value)input.setCustomValidity('');});sync();form.classList.add('is-phone-enhanced');
   // A hidden invalid control would block the submit silently ("not focusable"): report it on the visible phone field.
   fallback.addEventListener('invalid',event=>{event.preventDefault();sync();if(fallback.checkValidity()){setTimeout(()=>form.requestSubmit());return;}input.setCustomValidity('Selecciona el país de tu teléfono.');input.setAttribute('aria-invalid','true');input.reportValidity();});
   form.addEventListener('lead-saved',()=>instance.setDisabled(true));form.addEventListener('lead-reset',()=>{instance.setDisabled(false);instance.setNumber('');sync();});modal?.addEventListener('close',()=>instance.closeCountrySelector());
   window.addEventListener('pagehide',()=>{stopFloating();instance.destroy();},{once:true});
  }catch{ /* Keep the native country selector if enhancement is unavailable. */ }
 }
}

// Reusable enhancement: informational notes stay in the HTML for the native fallback.
function prepareFormHelp(form:HTMLFormElement,modal:HTMLDialogElement|null){
 const notes=[...form.querySelectorAll<HTMLElement>('.phone-field .form-help')];
 const bubble=document.createElement('div');bubble.className='form-tooltip';bubble.id='lead-form-tooltip';bubble.setAttribute('role','tooltip');bubble.hidden=true;modal?.append(bubble);
 let active:HTMLButtonElement|null=null;
 const close=()=>{active?.setAttribute('aria-expanded','false');active?.removeAttribute('aria-describedby');active=null;bubble.hidden=true;};
 for(const note of notes){
  const button=document.createElement('button');button.type='button';button.className='form-info';button.textContent='i';button.setAttribute('aria-label','M\u00e1s informaci\u00f3n');button.setAttribute('aria-expanded','false');
  const label=note.closest('.phone-field')?.querySelector('label')||note.closest('fieldset')?.querySelector('legend');
  if(label?.tagName==='LEGEND'){label.append(button);}else if(label){const row=document.createElement('span');row.className='form-label-help';label.before(row);row.append(label,button);}else note.before(button);
  const show=()=>{close();active=button;button.setAttribute('aria-expanded','true');button.setAttribute('aria-describedby',bubble.id);bubble.textContent=note.textContent;bubble.hidden=false;const rect=button.getBoundingClientRect();const bounds=modal?.getBoundingClientRect();const left=Math.max((bounds?.left||0)+12,Math.min(rect.left, (bounds?.right||innerWidth)-bubble.offsetWidth-12));bubble.style.left=left+'px';bubble.style.top=Math.max(12,Math.min(rect.bottom+6,innerHeight-bubble.offsetHeight-12))+'px';};
  button.addEventListener('click',show);button.addEventListener('mouseenter',show);button.addEventListener('mouseleave',close);button.addEventListener('focus',show);button.addEventListener('blur',close);
  note.hidden=true;
 }
 modal?.addEventListener('click',event=>{if(!(event.target as Element).closest('.form-info'))close();});
 modal?.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();event.stopImmediatePropagation();close();}},true);
 modal?.querySelector('.purchase-modal-content')?.addEventListener('scroll',close,{passive:true});modal?.addEventListener('close',close);window.addEventListener('resize',close);
}
