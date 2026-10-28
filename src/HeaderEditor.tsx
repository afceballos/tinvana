import {MediaPickerButton} from './MediaLibrary';
import {useRef,useState} from 'react';
import {api} from './api';
import {useFeedbackState} from './Notifications';
import {blockRegistry} from './block-registry';
import type {HeaderSettings,LandingBlock} from './types';
import './header-editor.css';
export function HeaderEditor({value,blocks,landingId,onChange,onBusyChange,disabled=false}:{value:HeaderSettings;blocks:LandingBlock[];landingId:string;onChange:(v:HeaderSettings)=>void;onBusyChange:(busy:boolean)=>void;disabled?:boolean}){
 const [busy,setBusy]=useState(false);const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');const input=useRef<HTMLInputElement>(null);
 const latest=useRef(value);latest.current=value;
 const all=blocks.filter(b=>b.type!=='divider');const label=(b:LandingBlock)=>b.type==='hero'?'Inicio':(String(b.data.title||'').replace(/<[^>]*>/g,'').trim()||blockRegistry[b.type].name).slice(0,60);
 const rows=[...value.items.filter(item=>all.some(b=>b.id===item.id)),...all.filter(b=>!value.items.some(i=>i.id===b.id)).map(b=>({id:b.id,label:'',enabled:value.mode==='auto'}))];
 const update=(patch:Partial<HeaderSettings>)=>onChange({...latest.current,...patch});
 function move(index:number,direction:number){const items=[...rows];[items[index],items[index+direction]]=[items[index+direction],items[index]];update({items});}
 return <details className="header-editor" open><summary>Encabezado, logo y menú</summary><p className="builder-hint">El menú lleva a las secciones de esta misma página. Solo se muestran enlaces a secciones visibles.</p>
 <label className="builder-toggle"><input type="checkbox" checked={value.sticky} onChange={e=>update({sticky:e.target.checked})}/>Mantener el encabezado fijo al desplazarse</label>
 <label>Fondo del encabezado<input type="color" value={value.backgroundColor} onChange={e=>update({backgroundColor:e.target.value})}/><span className="builder-hint">Usa un color oscuro para conservar el contraste con el logo y el menú blanco.</span></label>
 <div className="header-logo-preview" style={{background:value.backgroundColor}}><img src={value.logo||'/brand/tinvana-light.svg'} alt={value.logo?(value.logoAlt||'Logo de la tienda'):'Tinbana'}/></div>
 <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(!file||busy||disabled)return;if(file.size>8*1024*1024){setError('El logo debe pesar 8 MB o menos.');return;}setBusy(true);onBusyChange(true);try{const body=new FormData();body.append('image',file);const r=await api<{image:{url:string}}>('/api/landings/'+landingId+'/images',{method:'POST',body});update({logo:r.image.url,logoAlt:value.logoAlt==='ZenZales'?'Logo de la tienda':value.logoAlt});setNotice('Logo actualizado en el borrador. Guarda y publica para mostrarlo en la página.');}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusyChange(false);}}}/>
 <button type="button" className="secondary" disabled={busy||disabled} onClick={()=>input.current?.click()}>{busy?'Optimizando logo…':'Subir o reemplazar logo'}</button><p className="builder-hint">PNG, JPEG o WebP hasta 8 MB. Se convierte a WebP y conserva la transparencia. Para el fondo oscuro, usa un logo claro.</p>
 {value.logo&&<button type="button" className="secondary" disabled={busy} onClick={()=>update({logo:'',logoAlt:'ZenZales'})}>Restaurar logo de Tinbana</button>}
 <label>Nombre de la marca para el logo<input value={!value.logo&&value.logoAlt==='ZenZales'?'Tinbana':value.logoAlt} maxLength={100} onChange={e=>update({logoAlt:e.target.value})}/></label>
 <MediaPickerButton selected={value.logo?[value.logo]:[]} disabled={busy||disabled} onChoose={logo=>update({logo})}/><details><summary>Usar una URL de logo</summary><label>URL del logo<input type="url" value={value.logo} onChange={e=>update({logo:e.target.value})} placeholder="https://…"/></label></details>
 <label className="builder-toggle"><input type="checkbox" checked={value.menuEnabled} onChange={e=>update({menuEnabled:e.target.checked})}/>Mostrar menú por secciones</label>
 {value.menuEnabled&&<><label>Configuración del menú<select value={value.mode} onChange={e=>update({mode:e.target.value as HeaderSettings['mode'],items:e.target.value==='custom'?rows:value.items})}><option value="auto">Automático · según las secciones</option><option value="custom">Personalizar enlaces y orden</option></select></label>
 {value.mode==='auto'?<ul className="header-auto-links">{all.filter(b=>b.visible).map(b=><li key={b.id}>{label(b)}</li>)}</ul>:<ol className="header-menu-editor">{rows.map((item,i)=>{const block=all.find(b=>b.id===item.id)!;return <li key={item.id}><label className="builder-toggle"><input type="checkbox" checked={item.enabled} disabled={!block.visible} onChange={e=>update({items:rows.map((row,n)=>n===i?{...row,enabled:e.target.checked}:row)})}/>{label(block)}{!block.visible&&<small>Sección oculta</small>}</label><input aria-label={'Etiqueta del enlace '+(i+1)} value={item.label} maxLength={60} placeholder={label(block)} onChange={e=>update({items:rows.map((row,n)=>n===i?{...row,label:e.target.value}:row)})}/><div><button type="button" disabled={i===0} aria-label={'Subir enlace '+(i+1)} onClick={()=>move(i,-1)}>↑</button><button type="button" disabled={i===rows.length-1} aria-label={'Bajar enlace '+(i+1)} onClick={()=>move(i,1)}>↓</button></div></li>;})}</ol>}
 {!all.some(b=>b.visible)&&<p className="builder-hint">Agrega una sección visible para generar enlaces.</p>}</>}
 </details>;
}
