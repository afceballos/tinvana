import {useState} from 'react';
import {api} from './api';
export function ImageUpload({landingId,images,onChange}:{landingId:string;images:string[];onChange:(images:string[])=>void}){
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 return <div className="image-upload"><label>Subir imágenes<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={async e=>{
  const input=e.currentTarget;const files=Array.from(input.files??[]);if(!files.length)return;
  setBusy(true);setError('');setNotice('');const urls=images.filter(i=>i.trim());let uploaded=0;
  try{if(urls.length+files.length>30)throw new Error('La galería admite máximo 30 imágenes.');
   for(const file of files){if(file.size>8*1024*1024)throw new Error(`${file.name}: máximo 8 MB por imagen.`);const body=new FormData();body.append('image',file);const r=await api<{image:{url:string;bytes:number}}>('/api/landings/'+landingId+'/images',{method:'POST',body});urls.push(r.image.url);uploaded++;onChange([...urls]);}
   setNotice(`${uploaded} imagen(es) convertidas a WebP. Guarda la landing para conservar el orden de la galería.`);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);input.value='';}
 }}/><span className="small muted">JPEG, PNG o WebP · Entrada hasta 8 MB y 16 megapíxeles · WebP final hasta 400 KB y 1600 px por lado.</span></label>
 {busy&&<p role="status">Subiendo y optimizando…</p>}{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
 <div className="thumbnails">{images.filter(i=>i.trim()).map((url,i)=><div key={url+'-'+i}><img style={{width:80,height:80,objectFit:'cover'}} src={url} alt={'Imagen '+(i+1)}/><button type="button" disabled={busy} onClick={()=>onChange(images.filter((_,n)=>n!==i))} aria-label={'Quitar imagen '+(i+1)}>Quitar</button></div>)}</div>
 </div>;
}
