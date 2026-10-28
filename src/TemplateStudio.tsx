import {useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {Icon} from './ui';
import {useFeedbackState} from './Notifications';
import type {Visual,LandingTheme,LandingFont,ShareChannel} from './types';
import './template-studio.css';

const presets:{name:string;primaryColor:string;backgroundColor:string}[]=[
 {name:'Naranja Tinbana',primaryColor:'#ff6a00',backgroundColor:'#fff8f1'},
 {name:'Naranja intenso',primaryColor:'#c24e00',backgroundColor:'#fff8f1'},
 {name:'Océano',primaryColor:'#0b62c4',backgroundColor:'#f1f7ff'},
 {name:'Bosque',primaryColor:'#1b7a50',backgroundColor:'#f3fbf6'},
 {name:'Violeta',primaryColor:'#5b3fe0',backgroundColor:'#f6f4ff'},
 {name:'Rosa',primaryColor:'#c72a5f',backgroundColor:'#fff4f7'},
 {name:'Turquesa',primaryColor:'#087f7c',backgroundColor:'#f0fbfb'},
 {name:'Ámbar',primaryColor:'#a85f00',backgroundColor:'#fffaf0'},
 {name:'Grafito',primaryColor:'#1e1e1e',backgroundColor:'#f5f5f4'}
];
export const themes:{value:LandingTheme;name:string;text:string;font:LandingFont}[]=[
 {value:'modern',name:'Comercio moderno',text:'Limpio y claro: el producto es el protagonista y la compra está siempre a la vista.',font:'rubik'},
 {value:'warm',name:'Cálido',text:'Papel crema, titulares editoriales y tarjetas con esquina doblada. Cercano y artesanal.',font:'fraunces'},
 {value:'bold',name:'Audaz',text:'Presentación a todo color, bordes gruesos y sombras sólidas. Llama mucho la atención.',font:'grotesk'}
];
export const fonts:{value:LandingFont;name:string;text:string}[]=[
 {value:'rubik',name:'Rubik',text:'Redondeada y comercial'},
 {value:'montserrat',name:'Montserrat',text:'Geométrica, la de Tinbana'},
 {value:'fraunces',name:'Fraunces',text:'Editorial con serifa'},
 {value:'grotesk',name:'Space Grotesk',text:'Técnica y con carácter'}
];
export const shareChannels:{value:ShareChannel;name:string;text:string}[]=[
 {value:'native',name:'Compartir del celular',text:'En el teléfono abre su menú de compartir (WhatsApp, Instagram…).'},
 {value:'whatsapp',name:'WhatsApp',text:'Enviar el enlace del producto por WhatsApp.'},
 {value:'facebook',name:'Facebook',text:'Publicarlo en Facebook.'},
 {value:'copy',name:'Copiar enlace',text:'Copia la dirección con el aviso «Enlace copiado».'}
];
const hex=/^#[0-9a-f]{6}$/i;

function channel(v:number){const c=v/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4);}
function luminance(color:string){const n=parseInt(color.slice(1),16);return .2126*channel(n>>16&255)+.7152*channel(n>>8&255)+.0722*channel(n&255);}
export function contrast(a:string,b:string){const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);}
// Same rule as the landing renderer: white text when it reaches 4.5:1, otherwise near-black.
export const onColor=(color:string)=>contrast(color,'#ffffff')>=4.5?'#ffffff':'#151311';

function ColorField({label,hint,value,onChange}:{label:string;hint:string;value:string;onChange:(v:string)=>void}){
 const [text,setText]=useState(value);
 useEffect(()=>setText(value),[value]);
 return <div className="ts-color"><label><span>{label}</span><small>{hint}</small></label><div className="ts-color-row"><input type="color" aria-label={label} value={value} onChange={e=>onChange(e.target.value)}/><input className="ts-hex" aria-label={label+' en hexadecimal'} value={text} maxLength={7} spellCheck={false} onChange={e=>{const next=e.target.value.startsWith('#')?e.target.value:'#'+e.target.value;setText(next);if(hex.test(next))onChange(next.toLowerCase());}} onBlur={()=>setText(value)}/></div></div>;
}

/** Style, typography and share choices; shared by the template page and the landing editor. */
export function DesignChoices({value,onChange,compact=false}:{value:Visual;onChange:(patch:Partial<Visual>)=>void;compact?:boolean}){
 return <>
  <fieldset className="ts-choice-group"><legend>Estilo</legend>
   <div className={'ts-themes'+(compact?' is-compact':'')}>{themes.map(t=><label key={t.value} className={'ts-theme ts-theme-'+t.value+(value.theme===t.value?' is-active':'')}><input type="radio" name={compact?'landing-theme':'template-theme'} checked={value.theme===t.value} onChange={()=>onChange({theme:t.value,font:t.font})}/><span className="ts-theme-art" aria-hidden="true" style={{['--ts-primary' as string]:value.primaryColor,['--ts-bg' as string]:value.backgroundColor}}><i/><b/><em/></span><strong>{t.name}</strong>{!compact&&<small>{t.text}</small>}</label>)}</div>
  </fieldset>
  <fieldset className="ts-choice-group"><legend>Tipografía</legend>
   <div className="ts-fonts">{fonts.map(f=><label key={f.value} className={'ts-font'+(value.font===f.value?' is-active':'')}><input type="radio" name={compact?'landing-font':'template-font'} checked={value.font===f.value} onChange={()=>onChange({font:f.value})}/><span className={'ts-font-sample lp-font-'+f.value} aria-hidden="true">Aa</span><span><strong>{f.name}</strong><small>{f.text}</small></span></label>)}</div>
  </fieldset>
  <fieldset className="ts-choice-group"><legend>Botones para compartir</legend>
   {!compact&&<p className="small muted">Opcional. Aparecen en un botón flotante abajo a la derecha, encima del de WhatsApp.</p>}
   <div className="ts-share">{shareChannels.map(c=><label key={c.value} className="ts-share-option"><input type="checkbox" checked={value.share[c.value]} onChange={e=>onChange({share:{...value.share,[c.value]:e.target.checked}})}/><span><strong>{c.name}</strong>{!compact&&<small>{c.text}</small>}</span></label>)}</div>
  </fieldset>
 </>;
}

function Preview({value,device}:{value:Visual;device:'desktop'|'mobile'}){
 const phone=/^[1-9][0-9]{7,14}$/.test(value.whatsapp);const sharing=Object.values(value.share).some(Boolean);
 return <div className={'ts-frame ts-'+device+' ts-look-'+value.theme} style={{['--ts-primary' as string]:value.primaryColor,['--ts-on-primary' as string]:onColor(value.primaryColor),['--ts-bg' as string]:value.backgroundColor}} aria-label="Vista previa aproximada de una landing">
  <div className="ts-chrome"><i/><i/><i/><span>tu-marca.com/p/producto</span></div>
  <div className={'ts-page lp-font-'+value.font}>
   <div className="ts-nav"><b>Tu marca</b><span/><span/><span/></div>
   <div className="ts-hero"><div className="ts-copy"><small>Nuevo</small><h3>Un producto pensado para ti</h3><p>Descripción breve que explica el beneficio principal en una frase clara.</p><div className="ts-price"><strong>$ 89.900</strong><s>$ 119.900</s><em>Ahorras 25%</em></div><button type="button" tabIndex={-1} className="ts-cta">{value.buttonText||'Pedir ahora'}</button><div className="ts-trust"><span><Icon name="truck"/>Envío a todo el país</span><span><Icon name="check"/>Pago contraentrega</span></div></div><div className="ts-art"><img src="/brand/tinvana-origami.svg" alt=""/></div></div>
   <div className="ts-benefits"><span/><span/><span/></div>
   {(phone||sharing)&&<div className="ts-floats">{sharing&&<span className="ts-share-float" title="Compartir"><Icon name="link"/></span>}{phone&&<span className="ts-wa" title="Botón de WhatsApp"><Icon name="whatsapp"/></span>}</div>}
  </div>
 </div>;
}

export function TemplateStudio(){
 const [value,setValue]=useState<Visual|null>(null);const [saved,setSaved]=useState<Visual|null>(null);
 const [error,setError]=useFeedbackState('error');const [notice,setNotice]=useFeedbackState('success');const [busy,setBusy]=useState(false);const [device,setDevice]=useState<'desktop'|'mobile'>('desktop');
 useEffect(()=>{api<{settings:Visual}>('/api/template-settings').then(r=>{setValue(r.settings);setSaved(r.settings);}).catch(e=>setError(e.message));},[]);
 const dirty=useMemo(()=>!!value&&!!saved&&JSON.stringify(value)!==JSON.stringify(saved),[value,saved]);
 if(!value)return <><div className="section-heading"><div><span className="eyebrow">DISEÑO COMPARTIDO</span><h1>Tu plantilla de landings</h1></div></div><div className="ts-skeleton" aria-busy="true"><span/><span/></div></>;
 const text=onColor(value.primaryColor);const ratio=contrast(value.primaryColor,text);const level=ratio>=7?'AAA':ratio>=4.5?'AA':'Bajo';
 const set=(patch:Partial<Visual>)=>setValue({...value,...patch});
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);try{const r=await api<{settings:Visual}>('/api/template-settings',{method:'PUT',body:JSON.stringify({primaryColor:value!.primaryColor,backgroundColor:value!.backgroundColor,buttonText:value!.buttonText,whatsapp:value!.whatsapp,theme:value!.theme,font:value!.font,share:value!.share})});setSaved(r.settings&&r.settings.theme?{...value!,...r.settings}:value);setNotice('Plantilla guardada.');setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form className="ts" onSubmit={save}>
  <div className="section-heading"><div><span className="eyebrow">DISEÑO COMPARTIDO</span><h1>Tu plantilla de landings</h1></div></div>
  <p className="muted">Estos ajustes se copian al crear nuevas landings. Puedes personalizar cada página en su editor.</p>
  <div className="ts-layout">
   <div className="ts-controls">
    <section className="panel ts-card"><header><h2>Estilo y tipografía</h2><p>Cómo se ven tus landings. Todos los estilos usan tu color de marca y cargan rápido.</p></header>
     <DesignChoices value={value} onChange={set}/>
    </section>
    <section className="panel ts-card"><header><h2>Paletas listas</h2><p>Elige un punto de partida y ajústalo a tu gusto.</p></header>
     <div className="ts-presets" role="group" aria-label="Paletas">{presets.map(p=>{const active=p.primaryColor===value.primaryColor&&p.backgroundColor===value.backgroundColor;return <button type="button" key={p.name} className={'ts-preset'+(active?' is-active':'')} aria-pressed={active} onClick={()=>set({primaryColor:p.primaryColor,backgroundColor:p.backgroundColor})}><span className="ts-swatch" style={{background:p.backgroundColor}}><i style={{background:p.primaryColor}}/></span><span>{p.name}</span></button>;})}</div>
    </section>
    <section className="panel ts-card"><header><h2>Colores</h2><p>El color principal se usa en el botón de compra y en los acentos.</p></header>
     <div className="ts-colors"><ColorField label="Color principal" hint="Botones y acentos" value={value.primaryColor} onChange={v=>set({primaryColor:v})}/><ColorField label="Color de fondo" hint="Fondo de la página" value={value.backgroundColor} onChange={v=>set({backgroundColor:v})}/></div>
     <div className="ts-contrast is-ok" role="status"><Icon name="check"/><div><strong>Texto {text==='#ffffff'?'blanco':'oscuro'} sobre el botón: {ratio.toFixed(1)}:1 · {level}</strong><span>El color del texto del botón se elige solo para que siempre se lea bien.</span></div></div>
    </section>
    <section className="panel ts-card"><header><h2>Botón y contacto</h2><p>Textos que verán tus clientes en cada landing.</p></header>
     <label>Texto del botón<input value={value.buttonText} required maxLength={100} onChange={e=>set({buttonText:e.target.value})}/><span className="small muted ts-count">{value.buttonText.length}/100</span></label>
     <label>WhatsApp opcional<input value={value.whatsapp} placeholder="Ej. 573001234567" pattern="[1-9][0-9]{7,14}" inputMode="numeric" onChange={e=>set({whatsapp:e.target.value})}/><span className="small muted">Código de país + número, sin espacios ni +. Aparece como botón flotante abajo a la derecha. Vacío lo oculta.</span></label>
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
