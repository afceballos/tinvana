import {MediaPickerButton} from './MediaLibrary';
import {useFeedbackState} from './Notifications';
import {useRef,useState} from 'react';
import type {DragEvent} from 'react';
import {api} from './api';
import {Icon} from './ui';

type Target='main'|'gallery';
function ImageSymbol({plus=false}:{plus?:boolean}){
 return <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{plus?<path d="M12 5v14M5 12h14"/>:<><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>}</svg>;
}
function Photo({url,alt}:{url:string;alt:string}){
 const [failed,setFailed]=useState(false);
 return failed?<div className="media-fallback"><ImageSymbol/><span>Imagen no disponible</span></div>:<img src={url} alt={alt} onError={()=>setFailed(true)}/>;
}
export function ImageUpload({landingId,images,onChange,onBusyChange}:{landingId:string;images:string[];onChange:(images:string[])=>void;onBusyChange?:(busy:boolean)=>void}){
 const mainInput=useRef<HTMLInputElement>(null);const galleryInput=useRef<HTMLInputElement>(null);const inFlight=useRef(false);
 const [busy,setBusy]=useState(false);const [dragTarget,setDragTarget]=useState<Target|null>(null);
 const [error,setError]=useFeedbackState('error');const [notice,setNotice]=useFeedbackState('success');const [progress,setProgress]=useState({done:0,total:0});
 const urls=images.filter(url=>url.trim());const gallery=urls.slice(1);
 async function upload(files:File[],target:Target){
  if(inFlight.current||!files.length)return;
  setError('');setNotice('');setDragTarget(null);
  if(target==='main'&&files.length>1){setError('Elige una sola imagen principal. Puedes añadir varias a la galería.');return;}
  if(urls.length+files.length>30){setError('Puedes tener hasta 30 imágenes en total. Quita una antes de añadir más.');return;}
  for(const file of files){
   if(!/\.(jpe?g|png|webp)$/i.test(file.name)&&!['image/jpeg','image/png','image/webp'].includes(file.type)){setError(`${file.name}: elige una imagen JPEG, PNG o WebP.`);return;}
   if(file.size>8*1024*1024){setError(`${file.name}: la imagen debe pesar 8 MB o menos.`);return;}
  }
  inFlight.current=true;setBusy(true);onBusyChange?.(true);setProgress({done:0,total:files.length});let next=[...urls];let done=0;
  try{
   for(const file of files){
    const body=new FormData();body.append('image',file);
    const result=await api<{image:{url:string;bytes:number}}>('/api/landings/'+landingId+'/images',{method:'POST',body});
    next=target==='main'?[result.image.url,...next]:[...next,result.image.url];done++;onChange(next);setProgress({done,total:files.length});
   }
   setNotice(target==='main'?'Imagen principal añadida. Guarda los cambios para actualizar tu landing.':`${done===1?'Imagen añadida':done+' imágenes añadidas'}. Guarda los cambios para actualizar tu galería.`);
  }catch(e){setError((e as Error).message);if(done)setNotice(`${done} imagen(es) ya se añadieron. Guarda los cambios para conservarlas.`);}
  finally{inFlight.current=false;setBusy(false);onBusyChange?.(false);if(mainInput.current)mainInput.current.value='';if(galleryInput.current)galleryInput.current.value='';}
 }
 function remove(index:number){onChange(urls.filter((_,i)=>i!==index));setNotice(index===0?'Imagen principal quitada. La siguiente imagen será la portada.':'Imagen quitada de la galería. Guarda los cambios.');setError('');}
 function promote(index:number){onChange([urls[index],...urls.filter((_,i)=>i!==index)]);setNotice('Imagen principal actualizada. La anterior permanece en la galería. Guarda los cambios.');}
 function move(index:number,direction:number){const next=[...urls];[next[index],next[index+direction]]=[next[index+direction],next[index]];onChange(next);setNotice('Orden de la galería actualizado. Guarda los cambios.');}
 function dragProps(target:Target){return {
  onDragOver:(e:DragEvent)=>{e.preventDefault();e.dataTransfer.dropEffect=busy?'none':'copy';if(!busy)setDragTarget(target);},
  onDragLeave:(e:DragEvent)=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDragTarget(null);},
  onDrop:(e:DragEvent)=>{e.preventDefault();setDragTarget(null);void upload(Array.from(e.dataTransfer.files),target);}
 };}
 return <section className="media-manager" aria-labelledby="landing-images-title" aria-busy={busy}>
  <div className="media-heading"><div><h3 id="landing-images-title">Imágenes de tu landing</h3><p>Una portada que destaque. Una galería para ver cada detalle.</p></div><span className="media-count">{urls.length} / 30</span></div>
  <input className="media-file-input" ref={mainInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label="Archivo de imagen principal" tabIndex={-1} onChange={e=>void upload(Array.from(e.currentTarget.files??[]),'main')}/>
  <input className="media-file-input" ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} aria-label="Archivos de galería" tabIndex={-1} onChange={e=>void upload(Array.from(e.currentTarget.files??[]),'gallery')}/>
  <div className="media-primary-section"><div className="media-section-title"><h4>Imagen principal</h4><span>Portada de la página</span></div>
   {urls[0]?<div className={'media-cover '+(dragTarget==='main'?'is-dragging':'')} {...dragProps('main')}><div className="media-cover-image"><Photo key={urls[0]} url={urls[0]} alt="Imagen principal de la landing"/><span className="media-cover-badge"><Icon name="check"/>Principal</span></div><div className="media-cover-footer"><p>La primera impresión de tu producto.</p><div><button type="button" className="secondary" disabled={busy||urls.length>=30} onClick={()=>mainInput.current?.click()}>Cambiar imagen</button><button type="button" className="media-remove" disabled={busy} onClick={()=>remove(0)} aria-label="Quitar imagen principal"><Icon name="close"/></button></div></div><p className="media-cover-hint">Al cambiarla, la imagen anterior permanece en la galería.</p></div>:<button type="button" disabled={busy} className={'media-dropzone media-dropzone-main '+(dragTarget==='main'?'is-dragging':'')} onClick={()=>mainInput.current?.click()} {...dragProps('main')}><span className="media-plus"><ImageSymbol plus/></span><strong>Agregar imagen principal</strong><span>Elige una imagen o arrástrala aquí</span></button>}
  </div>
  <div className="media-gallery-section"><div className="media-section-title"><h4>Galería de imágenes</h4><span>{gallery.length===1?'1 imagen adicional':gallery.length+' imágenes adicionales'}</span></div><p className="media-gallery-help">Muestra otros ángulos y detalles. Puedes elegir cualquier imagen como principal.</p>
   <div className="media-gallery-grid">{gallery.map((url,i)=>{const index=i+1;return <div className="media-tile" key={url+'-'+index}><div className="media-tile-image"><Photo key={url} url={url} alt={'Imagen '+(i+1)+' de la galería'}/><span className="media-order">{i+1}</span><button type="button" className="media-tile-remove" disabled={busy} onClick={()=>remove(index)} aria-label={'Quitar imagen '+(i+1)+' de la galería'}><Icon name="close"/></button></div><button type="button" className="media-promote" disabled={busy} onClick={()=>promote(index)}>Usar como principal</button><div className="media-order-controls"><button type="button" disabled={busy||i===0} onClick={()=>move(index,-1)} aria-label={'Mover imagen '+(i+1)+' antes'}><Icon name="chevron" className="media-back"/></button><span>Orden {i+1}</span><button type="button" disabled={busy||i===gallery.length-1} onClick={()=>move(index,1)} aria-label={'Mover imagen '+(i+1)+' después'}><Icon name="chevron"/></button></div></div>;})}
    <button type="button" disabled={busy||urls.length>=30} className={'media-dropzone media-add-tile '+(dragTarget==='gallery'?'is-dragging':'')} onClick={()=>galleryInput.current?.click()} {...dragProps('gallery')}><span className="media-plus"><ImageSymbol plus/></span><strong>Agregar imágenes</strong><span>Selecciona varias<br/>o arrástralas aquí</span></button>
   </div>
  </div>
  <MediaPickerButton selected={urls} maxSelected={30} onRemove={url=>onChange(urls.filter(value=>value!==url))} disabled={busy} onChoose={url=>{if(!urls.includes(url))onChange([...urls,url]);}}/>
  <p className="media-formats">JPEG, PNG o WebP · Hasta 8 MB por imagen · 30 imágenes en total.<br/>Optimizamos tus archivos automáticamente para que la página cargue rápido.</p>
  {busy&&<div className="media-upload-progress" role="status"><span className="media-spinner" aria-hidden="true"/><div><strong>Subiendo y optimizando imágenes…</strong><span>{progress.done} de {progress.total} completadas</span></div><progress value={progress.done} max={progress.total} aria-label="Imágenes completadas"/></div>}
  
  <details className="media-advanced"><summary>Editar enlaces de imágenes</summary><label>URLs en orden (una por línea)<textarea rows={4} value={images.join('\n')} disabled={busy} onChange={e=>onChange(e.target.value.split('\n'))}/><span className="small muted">La primera URL corresponde a la imagen principal. También puedes conservar imágenes externas.</span></label></details>
 </section>;
}
