import {useEffect,useMemo,useRef,useState} from 'react';
import {api,post} from '../api';
import {useFeedbackState} from '../Notifications';
import {InlineLoading} from '../Loading';
import {Icon} from '../ui';
import './knowledge.css';

export type Learning={id:string;question:string;answer:string;from_chat:boolean;updated_at:string};
type View={items:Learning[];max:number;message?:string};
type Draft={id:string|null;question:string;answer:string};

/**
 * Approved learnings (question → answer) the WhatsApp agent uses. $list loads them; $base receives POST (new),
 * PUT/DELETE $base/{id}. Used by each store («Agente IA») and by the superadmin for the whole platform.
 */
export function KnowledgeEditor({list,base,scope}:{list:string;base:string;scope:'store'|'platform'}){
 const [view,setView]=useState<View|null>(null);const [draft,setDraft]=useState<Draft|null>(null);const [busy,setBusy]=useState(false);const [q,setQ]=useState('');
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');
 useEffect(()=>{api<View>(list).then(setView).catch(e=>setError((e as Error).message));},[list]);
 const items=useMemo(()=>{const t=q.trim().toLowerCase();return (view?.items||[]).filter(i=>!t||(i.question+' '+i.answer).toLowerCase().includes(t));},[view,q]);
 async function run(task:()=>Promise<View>){setBusy(true);setError('');try{const r=await task();setView({items:r.items,max:r.max});if(r.message)setNotice(r.message);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 if(!view)return <InlineLoading title="Cargando aprendizajes"/>;
 const form=draft&&<form className="kn-form" onSubmit={e=>{e.preventDefault();void run(()=>draft.id?api<View>(base+'/'+draft.id,{method:'PUT',body:JSON.stringify(draft)}):post<View>(base,draft)).then(ok=>{if(ok)setDraft(null);});}}>
  <label>Cuando el cliente pregunta…<textarea required rows={2} maxLength={300} value={draft.question} onChange={e=>setDraft({...draft,question:e.target.value})} placeholder="Ej. ¿Hacen envíos a San Andrés?"/></label>
  <label>…la IA responde<textarea required rows={4} maxLength={1500} value={draft.answer} onChange={e=>setDraft({...draft,answer:e.target.value})} placeholder="Ej. Sí, enviamos a San Andrés con Servientrega; el envío tarda de 5 a 8 días hábiles."/><span className="small muted">{draft.answer.length}/1500 · Escribe solo información real: la IA la repetirá tal cual.</span></label>
  <div className="row"><button className="primary" disabled={busy}>{busy?'Guardando…':draft.id?'Guardar cambios':'Guardar aprendizaje'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>setDraft(null)}>Cancelar</button></div>
 </form>;
 return <div className="kn">
  <div className="kn-head"><p className="muted">{scope==='platform'?'Valen para todas las tiendas. La tienda puede tener los suyos; si responden lo mismo, gana el de la tienda.':'Respuestas que la IA usa como si estuvieran en la ficha. Puedes guardarlas aquí o desde un chat, con «Guardar como aprendizaje» en un mensaje de un asesor.'}</p>
   <span className="kn-count">{view.items.length} de {view.max}</span></div>
  <div className="kn-tools">{view.items.length>3&&<label className="kn-search"><span className="sr-only">Buscar aprendizajes</span><Icon name="search"/><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar"/></label>}
   {!draft&&<button type="button" className="secondary" onClick={()=>setDraft({id:null,question:'',answer:''})}>+ Agregar aprendizaje</button>}</div>
  {draft&&!draft.id&&form}
  {!view.items.length&&!draft?<p className="wa-empty">Aún no hay aprendizajes. Agrega las preguntas que tus clientes hacen seguido y que no están en la ficha.</p>:
  <ul className="kn-list">{items.map(i=><li key={i.id}>{draft?.id===i.id?form:<>
   <div className="kn-text"><strong>{i.question}</strong><p>{i.answer}</p>{i.from_chat&&<span className="kn-tag">Desde un chat</span>}</div>
   <div className="kn-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setDraft({id:i.id,question:i.question,answer:i.answer})}>Editar</button><button type="button" className="secondary danger" disabled={busy} onClick={()=>{if(window.confirm('¿Eliminar este aprendizaje? La IA dejará de usarlo.'))void run(()=>api<View>(base+'/'+i.id,{method:'DELETE'}));}}>Eliminar</button></div>
  </>}</li>)}{q&&!items.length&&<li className="wa-empty">Nada coincide con «{q}».</li>}</ul>}
 </div>;
}

/** «Guardar como aprendizaje» from an advisor's message: the customer's question and the answer, editable first. */
export function LearnDialog({conversationId,initial,onClose}:{conversationId:string;initial:{question:string;answer:string};onClose:()=>void}){
 const [question,setQuestion]=useState(initial.question.slice(0,300));const [answer,setAnswer]=useState(initial.answer.slice(0,1500));const [busy,setBusy]=useState(false);
 const [,setError]=useFeedbackState('error');const [,setNotice]=useFeedbackState('success');const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="tpl-dialog" onClose={onClose} aria-labelledby="learn-title">
  <form onSubmit={e=>{e.preventDefault();setBusy(true);setError('');post<View>('/api/whatsapp/knowledge',{question,answer,conversation_id:conversationId}).then(r=>{setNotice(r.message||'Aprendizaje guardado.');ref.current?.close();}).catch(err=>setError((err as Error).message)).finally(()=>setBusy(false));}}>
   <div className="tpl-dialog-head"><h2 id="learn-title">Guardar como aprendizaje</h2><button type="button" className="tpl-close" aria-label="Cerrar" onClick={()=>ref.current?.close()}>×</button></div>
   <p className="small muted">La próxima vez que un cliente pregunte algo parecido, la IA responderá con esto en vez de pasar a un asesor. Quita datos de este cliente (nombre, dirección, número de pedido) antes de guardar.</p>
   <label>Cuando el cliente pregunta…<textarea required rows={2} maxLength={300} value={question} onChange={e=>setQuestion(e.target.value)}/></label>
   <label>…la IA responde<textarea required rows={5} maxLength={1500} value={answer} onChange={e=>setAnswer(e.target.value)}/></label>
   <div className="row"><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar aprendizaje'}</button><button type="button" className="secondary" onClick={()=>ref.current?.close()}>Cancelar</button></div>
  </form>
 </dialog>;
}
