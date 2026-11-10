import {useEffect,useState} from 'react';
import {api} from './api';
import {useFeedbackState} from './Notifications';
import './store-tracking.css';

// Store-wide pixels (Meta, Google Analytics 4, Google Ads, Tag Manager) and domain verification. Saved apart from the
// landing draft because they apply to every published landing of the store.
type Tracking={metaPixel:string;ga4:string;googleAds:string;googleAdsLabel:string;gtm:string;metaVerify:string;googleVerify:string};
const empty:Tracking={metaPixel:'',ga4:'',googleAds:'',googleAdsLabel:'',gtm:'',metaVerify:'',googleVerify:''};
const fields:[keyof Tracking,string,string,string][]=[
 ['metaPixel','Píxel de Meta','123456789012345','Facebook e Instagram. Lo encuentras en el Administrador de eventos.'],
 ['ga4','Google Analytics 4','G-XXXXXXXXXX','ID de medición del flujo web.'],
 ['googleAds','Google Ads','AW-123456789','ID de la etiqueta de Google Ads.'],
 ['googleAdsLabel','Etiqueta de conversión de Google Ads','AbCdEfGh123','Lo que va después de la barra en AW-123456789/…'],
 ['gtm','Google Tag Manager','GTM-XXXXXXX','Solo si ya manejas tus etiquetas desde GTM.'],
 ['metaVerify','Verificación de dominio de Meta','Código o etiqueta completa','Puedes pegar la etiqueta meta entera; guardamos solo el código.'],
 ['googleVerify','Verificación de Google Search Console','Código o etiqueta completa','Método «Etiqueta HTML».'],
];

export function StoreTrackingFields(){
 const [value,setValue]=useState<Tracking|null>(null);const [saved,setSaved]=useState<Tracking>(empty);const [busy,setBusy]=useState(false);
 const [error,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{api<{tracking:Tracking}>('/api/store/tracking').then(r=>{setValue(r.tracking);setSaved(r.tracking);}).catch(e=>setError(e.message));},[setError]);
 if(!value)return <p className="small muted">{error||'Cargando píxeles…'}</p>;
 const dirty=fields.some(([k])=>value[k]!==saved[k]);
 async function save(){if(!value)return;setBusy(true);setError('');try{const r=await api<{tracking:Tracking;message:string}>('/api/store/tracking',{method:'PUT',body:JSON.stringify(value)});setValue(r.tracking);setSaved(r.tracking);setNotice(r.message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="st-tracking" role="group" aria-labelledby="st-tracking-title">
  <div className="st-head"><strong id="st-tracking-title">Píxeles y medición</strong><span className="st-badge">Toda la tienda</span></div>
  <p className="small muted">Se aplican a todas tus landings publicadas. Enviamos solos la visita, la apertura del formulario y la compra (Purchase) cuando el pedido queda guardado. La vista previa no cuenta.</p>
  <div className="st-grid">{fields.map(([key,label,placeholder,help])=><div className="st-field" key={key}><label>{label}<input value={value[key]} placeholder={placeholder} spellCheck={false} autoComplete="off" aria-describedby={'st-help-'+key} onChange={e=>setValue({...value,[key]:e.target.value})}/></label><span id={'st-help-'+key} className="small muted">{help}</span></div>)}</div>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="st-actions"><button type="button" className="secondary" disabled={busy||!dirty} onClick={save}>{busy?'Guardando…':'Guardar píxeles'}</button>{!dirty&&<span className="small muted">Sin cambios por guardar</span>}</div>
 </div>;
}
