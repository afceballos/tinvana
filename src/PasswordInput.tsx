import {useState} from 'react';
import type {InputHTMLAttributes} from 'react';
import './password-input.css';

/** Password field with an eye button to show or hide what was typed. Goes inside a <label>; the input stays its control. */
export function PasswordInput(props:Omit<InputHTMLAttributes<HTMLInputElement>,'type'>){
 const [show,setShow]=useState(false);
 return <span className="pw-field"><input {...props} type={show?'text':'password'}/>
  <button type="button" className="pw-toggle" aria-label={show?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={show} title={show?'Ocultar contraseña':'Mostrar contraseña'} onClick={()=>setShow(v=>!v)}>
   <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>{show&&<path d="M4 20 20 4"/>}
   </svg>
  </button>
 </span>;
}
