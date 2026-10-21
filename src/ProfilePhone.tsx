import {floatingPhone} from './floating-panel';
import {useEffect,useRef} from 'react';
import intlTelInput from 'intl-tel-input';
import {es} from 'intl-tel-input/locale';
import 'intl-tel-input/styles-no-assets';
export function ProfilePhone({value,onChange,disabled,label='Teléfono (opcional)',required=false}:{value:string;onChange:(value:string)=>void;disabled:boolean;label?:string;required?:boolean}){
 const input=useRef<HTMLInputElement>(null);const dropdown=useRef<HTMLDivElement>(null);const instance=useRef<ReturnType<typeof intlTelInput>|null>(null);const current=useRef(value);const change=useRef(onChange);change.current=onChange;
 useEffect(()=>{
  if(!input.current||!dropdown.current)return;const el=input.current;
  const iti=intlTelInput(el,{initialCountry:'co',countryNameLocale:'es',uiTranslations:es,separateDialCode:true,countrySearch:true,countrySelectorMode:'DROPDOWN',dropdownParent:dropdown.current,matchDropdownWidth:true,formatAsYouType:false});instance.current=iti;
  const stopFloating=floatingPhone(el,dropdown.current);iti.setNumber(current.current);
  const sync=()=>{const raw=el.value.trim();const dial=iti.getSelectedCountry()?.dialCode;const next=!raw?'':raw.startsWith('+')?raw:dial?'+'+dial+raw.replace(/[^0-9]/g,''):raw;current.current=next;change.current(next);};
  el.addEventListener('input',sync);el.addEventListener('change',sync);el.addEventListener('countrychange',sync);
  return()=>{stopFloating();el.removeEventListener('input',sync);el.removeEventListener('change',sync);el.removeEventListener('countrychange',sync);iti.destroy();instance.current=null;};
 },[]);
 useEffect(()=>{if(value!==current.current){current.current=value;instance.current?.setNumber(value);}},[value]);
 useEffect(()=>{instance.current?.setDisabled(disabled);},[disabled]);
 return <div className="profile-phone"><label htmlFor="profile-phone">{label}</label><input ref={input} id="profile-phone" name="phone" type="tel" autoComplete="tel-national" inputMode="tel" maxLength={30} defaultValue={value} disabled={disabled} required={required}/><div ref={dropdown} className="profile-phone-dropdown"/></div>;
}
