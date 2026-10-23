import {useState} from 'react';
import {Icon} from './ui';
import {api} from './api';
import {useFeedbackState} from './Notifications';
import './store-address.css';

export type StoreInfo={subdomain:string|null;base:string|null;url:string|null};

/** Lowercase letters, digits and single hyphens only: what a DNS label allows. */
export function cleanSubdomain(value:string):string{
  return value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-{2,}/g,'-').replace(/^-+/,'').slice(0,40);
}
export function subdomainIssue(value:string):string{
  if(!value)return '';
  if(value.length<3)return 'Usa al menos 3 caracteres.';
  if(value.endsWith('-'))return 'No puede terminar en guion.';
  return '';
}

export function StoreAddress({store,onSaved}:{store:StoreInfo;onSaved:(store:StoreInfo)=>void}){
  const [value,setValue]=useState(store.subdomain||'');const [busy,setBusy]=useState(false);const [,error]=useFeedbackState('error');const [,notice]=useFeedbackState('success');
  const base=store.base;const saved=store.subdomain||'';const issue=subdomainIssue(value);const changed=value!==saved;
  async function save(){
    if(busy||issue||!changed)return;setBusy(true);
    try{const r=await api<{profile:{store:StoreInfo}}>('/api/profile/store',{method:'PUT',body:JSON.stringify({subdomain:value||null})});onSaved(r.profile.store);setValue(r.profile.store.subdomain||'');notice(r.profile.store.subdomain?'Tu tienda quedó en '+r.profile.store.url+'.':'Tus productos volvieron al enlace normal.');}
    catch(e){error((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="panel store-card webhook-current" aria-labelledby="store-card-title">
    <div className="webhook-head"><span className="webhook-logo" aria-hidden="true"><Icon name="globe"/></span><div><span className="eyebrow">Dirección de tus landings</span><h2 id="store-card-title">Tu tienda</h2></div><span className={'webhook-state '+(saved?'on':'off')}>{saved?'Activa':'Sin subdominio'}</span></div>
    {saved&&base&&<div className="webhook-url"><Icon name="link"/><code>{saved}.{base}</code></div>}
    {!base?<p className="muted">El subdominio de tienda estará disponible cuando el sitio use su dominio público.</p>:<form className="store-form" onSubmit={e=>{e.preventDefault();void save();}}>
      <p className="muted">Elige el nombre de tu tienda y todos tus productos publicados quedarán en ese subdominio. Es opcional: sin nombre, usan el enlace normal.</p>
      <label>Nombre de tu tienda
        <div className="input-prefix store-input"><input value={value} maxLength={40} autoComplete="off" spellCheck={false} placeholder="mi-tienda" aria-invalid={Boolean(issue)} disabled={busy} onChange={e=>setValue(cleanSubdomain(e.target.value))}/><span>.{base}</span></div>
      </label>
      <p className={'store-hint'+(issue?' bad':'')}>{issue||'Solo minúsculas, números y guiones; sin espacios. De 3 a 40 caracteres.'}</p>
      <p className="store-preview" aria-live="polite">Así se verán tus enlaces: <strong>{value&&!issue?<>{value}.{base}</>:base}/p/<em>mi-producto</em></strong></p>
      {saved&&changed&&<p className="store-warning" role="note">Si cambias el nombre, los enlaces con «{saved}.{base}» dejarán de funcionar. Los enlaces con {base}/p/… siguen activos.</p>}
      <div className="store-actions"><button className="primary" disabled={busy||Boolean(issue)||!changed}>{busy?'Guardando…':value?'Guardar tienda':saved?'Quitar subdominio':'Guardar tienda'}</button></div>
    </form>}
  </section>;
}
