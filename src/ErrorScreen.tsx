import './error-screen.css';

type Copy={eyebrow:string;title:string;text:string};
// Friendly copy per status; the server message, when there is one, is shown under it.
function copy(status:number):Copy{
 if(status===404)return {eyebrow:'Error 404',title:'Esta página tomó otro vuelo',text:'La dirección no existe, se movió o ya no está disponible.'};
 if(status===419)return {eyebrow:'Sesión del formulario',title:'El formulario se quedó sin tiempo',text:'Recarga la página e inténtalo de nuevo.'};
 if(status===429)return {eyebrow:'Un momento',title:'Vamos más despacio',text:'Hubo demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.'};
 if(status>=500)return {eyebrow:'Error '+status,title:'Estamos ajustando las alas',text:'El servicio no respondió como esperábamos. Inténtalo de nuevo en unos minutos.'};
 return {eyebrow:'Error '+status,title:'No pudimos completar esto',text:'Revisa la dirección o vuelve atrás para intentarlo de nuevo.'};
}

/** Branded error page, shared by the panel (unknown routes) and the PHP server (pages it refuses). */
export function ErrorScreen({status=404,message,home='/'}:{status?:number;message?:string;home?:string}){
 const c=copy(status);const digits=String(status).padStart(3,'0').slice(0,3).split('');
 const back=()=>{if(window.history.length>1)window.history.back();else window.location.assign(home);};
 return <main className="err-screen" aria-labelledby="err-title">
  <div className="err-sky" aria-hidden="true"><span className="err-blob a"/><span className="err-blob b"/><span className="err-blob c"/>{Array.from({length:9},(_,i)=><i key={i} className={'err-paper p'+i}/>)}</div>
  <header className="err-top"><a href={home} aria-label="Tinvana, ir al inicio"><img className="err-logo on-light" src="/brand/tinvana-dark.svg" width="170" height="41" alt="Tinvana"/><img className="err-logo on-dark" src="/brand/tinvana-light.svg" width="170" height="41" alt=""/></a></header>
  <section className="err-center">
   <div className="err-code" aria-hidden="true">
    <span className="err-digit">{digits[0]}</span>
    {digits[1]==='0'?<span className="err-orbit"><span className="err-ring"/><span className="err-ring r2"/><span className="err-bird"><img src="/brand/tinvana-origami.svg" alt=""/></span></span>:<span className="err-digit">{digits[1]}</span>}
    <span className="err-digit">{digits[2]}</span>
   </div>
   <svg className="err-trail" viewBox="0 0 600 120" aria-hidden="true"><path d="M10 95 C 140 10, 260 120, 380 50 S 560 30, 590 70" pathLength={1}/></svg>
   <span className="eyebrow err-eyebrow">{c.eyebrow}</span>
   <h1 id="err-title">{c.title}</h1>
   <p className="err-text">{c.text}</p>
   {message&&message!==c.text&&!/^página no encontrada\.?$/i.test(message.trim())&&<p className="err-detail">{message}</p>}
   <div className="err-actions"><button type="button" className="primary" onClick={back}>Volver atrás</button><a className="secondary err-home" href={home}>Ir al inicio</a></div>
  </section>
  <p className="err-foot">Tinvana · Ideas que toman vuelo.</p>
 </main>;
}

/** Error details the PHP server embeds when it answers a page with an error status. */
export function serverError():{status:number;message:string;home:string}|null{
 const raw=document.querySelector<HTMLMetaElement>('meta[name="tinvana-error"]')?.content;if(!raw)return null;
 try{const v=JSON.parse(raw);return {status:Number(v.status)||404,message:String(v.message||''),home:typeof v.home==='string'&&/^(\/|https:\/\/)/.test(v.home)?v.home:'/'};}catch{return {status:404,message:'',home:'/'};}
}
