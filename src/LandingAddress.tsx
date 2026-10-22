import {useState} from 'react';
import type {Landing} from './types';
import './landing-address.css';

/** Lowercase letters, digits and single hyphens only: what a DNS label allows. */
export function cleanSubdomain(value:string):string{
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-{2,}/g,'-').replace(/^-+/,'').slice(0,40);
}
export function subdomainIssue(value:string):string{
  if(!value)return 'Escribe un nombre para tu subdominio.';
  if(value.length<3)return 'Usa al menos 3 caracteres.';
  if(value.endsWith('-'))return 'No puede terminar en guion.';
  return '';
}
/** Address of the published page: its subdomain when it has one, otherwise /p/<slug>. */
export function liveHref(landing:Landing):string{
  const sub=landing.published_subdomain,base=landing.subdomain_base;
  return sub&&base?window.location.protocol+'//'+sub+'.'+base:'/p/'+(landing.published_slug||landing.slug);
}

export function LandingAddress({landing,onChange}:{landing:Landing;onChange:(change:{slug?:string;subdomain?:string|null})=>void}){
  const base=landing.subdomain_base||null;
  const [mode,setMode]=useState<'path'|'subdomain'>(landing.subdomain?'subdomain':'path');
  const value=landing.subdomain||'';const issue=mode==='subdomain'?subdomainIssue(value):'';
  function choose(next:'path'|'subdomain'){setMode(next);if(next==='path'&&landing.subdomain)onChange({subdomain:null});}
  return <fieldset className="address-picker">
    <legend>Enlace público de la landing</legend>
    <label className={'address-option'+(mode==='path'?' active':'')}>
      <input type="radio" name="address-mode" checked={mode==='path'} onChange={()=>choose('path')}/>
      <span><strong>Enlace normal</strong><small>{window.location.host}/p/<em>{landing.slug||'nombre'}</em></small></span>
    </label>
    <label className={'address-option'+(mode==='subdomain'?' active':'')+(base?'':' disabled')}>
      <input type="radio" name="address-mode" checked={mode==='subdomain'} disabled={!base} onChange={()=>choose('subdomain')}/>
      <span><strong>Subdominio propio</strong><small>{base?<><em>{value||'nombre'}</em>.{base}</>:'Disponible cuando el sitio use su dominio público.'}</small></span>
    </label>
    {mode==='path'&&<label className="address-field">Dirección del borrador<div className="input-prefix"><span>/p/</span><input value={landing.slug} maxLength={180} onChange={e=>onChange({slug:e.target.value})}/></div></label>}
    {mode==='subdomain'&&base&&<label className="address-field">Nombre del subdominio
      <div className="input-prefix address-subdomain"><input value={value} maxLength={40} autoComplete="off" spellCheck={false} placeholder="mi-producto" aria-invalid={Boolean(issue)} onChange={e=>onChange({subdomain:cleanSubdomain(e.target.value)})}/><span>.{base}</span></div>
      <small className={'address-hint'+(issue?' bad':'')}>{issue||'Solo minúsculas, números y guiones; sin espacios. Se publica con la landing, y el enlace normal sigue funcionando.'}</small>
    </label>}
  </fieldset>;
}
