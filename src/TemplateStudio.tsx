import {useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {Icon} from './ui';
import {useFeedbackState} from './Notifications';
import type {Visual} from './types';
import './template-studio.css';

const presets:{name:string;primaryColor:string;backgroundColor:string}[]=[
 {name:'Naranja Tinvana',primaryColor:'#ff6a00',backgroundColor:'#fff8f1'},
 {name:'Naranja intenso',primaryColor:'#c24e00',backgroundColor:'#fff8f1'},
 {name:'Océano',primaryColor:'#0b62c4',backgroundColor:'#f1f7ff'},
 {name:'Bosque',primaryColor:'#1b7a50',backgroundColor:'#f3fbf6'},
 {name:'Violeta',primaryColor:'#5b3fe0',backgroundColor:'#f6f4ff'},
 {name:'Rosa',primaryColor:'#c72a5f',backgroundColor:'#fff4f7'},
 {name:'Turquesa',primaryColor:'#087f7c',backgroundColor:'#f0fbfb'},
 {name:'Ámbar',primaryColor:'#a85f00',backgroundColor:'#fffaf0'},
 {name:'Grafito',primaryColor:'#1e1e1e',backgroundColor:'#f5f5f4'}
];
const hex=/^#[0-9a-f]{6}$/i;

function channel(v:number){const c=v/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4);}
function luminance(color:string){const n=parseInt(color.slice(1),16);return .2126*channel(n>>16&255)+.7152*channel(n>>8&255)+.0722*channel(n&255);}
export function contrast(a:string,b:string){const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);}

function ColorField({label,hint,value,onChange}:{label:string;hint:string;value:string;onChange:(v:string)=>void}){
 const [text,setText]=useState(value);
 useEffect(()=>setText(value),[value]);
 return <div className="ts-color"><label><span>{label}</span><small>{hint}</small></label><div className="ts-color-row"><input type="color" aria-label={label} value={value} onChange={e=>onChange(e.target.value)}/><input className="ts-hex" aria-label={label+' en hexadecimal'} value={text} maxLength={7} spellCheck={false} onChange={e=>{const next=e.target.value.startsWith('#')?e.target.value:'#'+e.target.value;setText(next);if(hex.test(next))onChange(next.toLowerCase());}} onBlur={()=>setText(value)}/></div></div>;
}

function Preview({value,device}:{value:Visual;device:'desktop'|'mobile'}){
 const phone=/^[1-9][0-9]{7,14}$/.test(value.whatsapp);
 return <div className={'ts-frame ts-'+device} style={{['--ts-primary' as string]:value.primaryColor,['--ts-bg' as string]:value.backgroundColor}} aria-label="Vista previa aproximada de una landing">
  <div className="ts-chrome"><i/><i/><i/><span>tu-marca.com/p/producto</span></div>
  <div className="ts-page">
   <div className="ts-nav"><b>Tu marca</b><span/><span/><span/></div>
   <div className="ts-hero"><div className="ts-copy"><small>Nuevo</small><h3>Un producto pensado para ti</h3><p>Descripción breve que explica el beneficio principal en una frase clara.</p><div className="ts-price"><strong>$ 89.900</strong><s>$ 119.900</s></div><button type="button" tabIndex={-1} className="ts-cta">{value.buttonText||'Comprar ahora'}</button><div className="ts-trust"><span><Icon name="truck"/>Envío a todo el país</span><span><Icon name="check"/>Pago contraentrega</span></div></div><div className="ts-art"><img src="/brand/tinvana-origami.svg" alt=""/></div></div>
   <div className="ts-benefits"><span/><span/><span/></div>
   {phone&&<span className="ts-wa" title="Botón de WhatsApp"><Icon name="whatsapp"/></span>}
  </div>
 </div>;
}

export function TemplateStudio(){
 const [value,setValue]=useState<Visual|null>(null);const [saved,setSaved]=useState<Visual|null>(null);
 const [error,setError]=useFeedbackState('error');const [notice,setNotice]=useFeedbackState('success');const [busy,setBusy]=useState(false);const [device,setDevice]=useState<'desktop'|'mobile'>('desktop');
 useEffect(()=>{api<{settings:Visual}>('/api/template-settings').then(r=>{setValue(r.settings);setSaved(r.settings);}).catch(e=>setError(e.message));},[]);
 const dirty=useMemo(()=>!!value&&!!saved&&JSON.stringify(value)!==JSON.stringify(saved),[value,saved]);
 if(!value)return <><div className="section-heading"><div><span className="eyebrow">DISEÑO COMPARTIDO</span><h1>Tu plantilla de landings</h1></div></div><div className="ts-skeleton" aria-busy="true"><span/><span/></div></>;
 const ratio=contrast(value.primaryColor,'#ffffff');const level=ratio>=7?'AAA':ratio>=4.5?'AA':ratio>=3?'Solo texto grande':'Bajo';const ok=ratio>=4.5;
 const set=(patch:Partial<Visual>)=>setValue({...value,...patch});
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);try{await api('/api/template-settings',{method:'PUT',body:JSON.stringify(value)});setSaved(value);setNotice('Plantilla guardada.');setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form className="ts" onSubmit={save}>
  <div className="section-heading"><div><span className="eyebrow">DISEÑO COMPARTIDO</span><h1>Tu plantilla de landings</h1></div></div>
  <p className="muted">Estos ajustes se copian al crear nuevas landings. Puedes personalizar cada página en su editor.</p>
  <div className="ts-layout">
   <div className="ts-controls">
    <section className="panel ts-card"><header><h2>Paletas listas</h2><p>Elige un punto de partida y ajústalo a tu gusto.</p></header>
     <div className="ts-presets" role="group" aria-label="Paletas">{presets.map(p=>{const active=p.primaryColor===value.primaryColor&&p.backgroundColor===value.backgroundColor;return <button type="button" key={p.name} className={'ts-preset'+(active?' is-active':'')} aria-pressed={active} onClick={()=>set({primaryColor:p.primaryColor,backgroundColor:p.backgroundColor})}><span className="ts-swatch" style={{background:p.backgroundColor}}><i style={{background:p.primaryColor}}/></span><span>{p.name}</span></button>;})}</div>
    </section>
    <section className="panel ts-card"><header><h2>Colores</h2><p>El color principal se usa en el botón de compra y en los acentos.</p></header>
     <div className="ts-colors"><ColorField label="Color principal" hint="Botones y acentos" value={value.primaryColor} onChange={v=>set({primaryColor:v})}/><ColorField label="Color de fondo" hint="Fondo de la página" value={value.backgroundColor} onChange={v=>set({backgroundColor:v})}/></div>
     <div className={'ts-contrast '+(ok?'is-ok':'is-warn')} role="status"><Icon name={ok?'check':'close'}/><div><strong>Texto blanco sobre el botón: {ratio.toFixed(1)}:1 · {level}</strong><span>{ok?'Se lee bien para la mayoría de personas.':'Elige un color principal más oscuro para mejorar la lectura del botón.'}</span></div></div>
    </section>
    <section className="panel ts-card"><header><h2>Botón y contacto</h2><p>Textos que verán tus clientes en cada landing.</p></header>
     <label>Texto del botón<input value={value.buttonText} required maxLength={100} onChange={e=>set({buttonText:e.target.value})}/><span className="small muted ts-count">{value.buttonText.length}/100</span></label>
     <label>WhatsApp opcional<input value={value.whatsapp} placeholder="Ej. 573001234567" pattern="[1-9][0-9]{7,14}" inputMode="numeric" onChange={e=>set({whatsapp:e.target.value})}/><span className="small muted">Código de país + número, sin espacios ni +. Vacío oculta el botón.</span></label>
    </section>
   </div>
   <aside className="ts-preview" aria-label="Vista previa">
    <div className="ts-preview-top"><h2>Vista previa</h2><div className="ts-device" role="group" aria-label="Dispositivo"><button type="button" aria-pressed={device==='desktop'} onClick={()=>setDevice('desktop')}>Escritorio</button><button type="button" aria-pressed={device==='mobile'} onClick={()=>setDevice('mobile')}>Móvil</button></div></div>
    <Preview value={value} device={device}/>
    <p className="small muted">Vista aproximada: cada landing usa tus bloques y textos reales.</p>
   </aside>
  </div>
  <div className={'ts-savebar'+(dirty?' is-dirty':' is-clean')} role="region" aria-label="Guardar cambios">
   <span role="status"><i/>{dirty?'Cambios sin guardar':'Todo guardado'}</span>
   <div><button type="button" className="secondary" disabled={!dirty||busy} onClick={()=>setValue(saved)}><Icon name="reset"/>Descartar</button><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar plantilla'}</button></div>
  </div>
 </form>;
}
