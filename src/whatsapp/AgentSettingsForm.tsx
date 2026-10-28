// Agent settings form, shared by each store («Agente IA») and the superadmin defaults («Valores globales»).
export type AgentSettings={enabled:boolean;handoff_notice:boolean;chat_orders:boolean;tone:string;instructions:string;length:string;
 handoff:{customer_asks:boolean;complaint:boolean;unknown:boolean;no_sheet:boolean;custom:string};
 schedule:{days:number[];start:string;end:string;off_hours:'reply'|'handoff'};
 messages:{off_hours:string;fallback:string;unsupported:string;handoff:string}};
export type AgentCatalog={tones:Record<string,string>;lengths:Record<string,string>;built_in:AgentSettings};

const DAYS:[number,string][]=[[1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[7,'Dom']];
const TONE_HINT:Record<string,string>={cercano:'Cálido y amable, tutea al cliente.',profesional:'Cortés y formal, trata de «usted».',entusiasta:'Positivo y con energía, sin exagerar.'};
const LENGTH_HINT:Record<string,string>={breve:'1 o 2 frases al punto. Gasta menos tokens (recomendado).',normal:'Hasta 4 frases, para productos que necesitan más explicación.'};
const MOTIVES:[keyof AgentSettings['handoff'],string][]=[['customer_asks','El cliente pide hablar con una persona'],['complaint','Reclamos, quejas o problemas con un pedido'],['unknown','Preguntas que no están en la ficha del producto'],['no_sheet','Productos sin ficha aprobada']];

export function AgentSettingsForm({value,catalog,onChange,idPrefix='agent'}:{value:AgentSettings;catalog:AgentCatalog;onChange:(v:AgentSettings)=>void;idPrefix?:string}){
 const set=(patch:Partial<AgentSettings>)=>onChange({...value,...patch});
 const day=(d:number)=>set({schedule:{...value.schedule,days:value.schedule.days.includes(d)?value.schedule.days.filter(x=>x!==d):[...value.schedule.days,d].sort()}});
 return <div className="wa-agent-form">
  <label className="wa-switch"><input type="checkbox" checked={value.enabled} onChange={e=>set({enabled:e.target.checked})}/><span><strong>Agente de IA activo</strong><small>Si lo apagas, los chats nuevos llegan directo a un asesor.</small></span></label>
  <label className="wa-switch"><input type="checkbox" checked={value.chat_orders} onChange={e=>set({chat_orders:e.target.checked})}/><span><strong>Vender por WhatsApp</strong><small>La IA toma los datos del cliente y Tinbana arma el pedido con el precio de la oferta o de la landing publicada y el envío de Dropi (o incluido). El cliente lo confirma con «1 SÍ». Si lo apagas, cuando alguien quiera comprar pasa a un asesor.</small></span></label>
  <fieldset><legend>Tono</legend><div className="wa-choices">{Object.entries(catalog.tones).map(([k,label])=><label key={k} className={'wa-choice'+(value.tone===k?' is-on':'')}><input type="radio" name={idPrefix+'-tone'} checked={value.tone===k} onChange={()=>set({tone:k})}/><strong>{label}</strong><small>{TONE_HINT[k]}</small></label>)}</div></fieldset>
  <fieldset><legend>Largo de las respuestas</legend><div className="wa-choices">{Object.entries(catalog.lengths).map(([k,label])=><label key={k} className={'wa-choice'+(value.length===k?' is-on':'')}><input type="radio" name={idPrefix+'-length'} checked={value.length===k} onChange={()=>set({length:k})}/><strong>{label}</strong><small>{LENGTH_HINT[k]}</small></label>)}</div></fieldset>
  <label>Instrucciones adicionales <span className="muted">(opcional)</span><textarea rows={2} maxLength={600} value={value.instructions} onChange={e=>set({instructions:e.target.value})} placeholder="Ej. Despedirse siempre con «¡Gracias por comprar en Tienda X!»"/></label>
  <fieldset><legend>Pasar a un asesor cuando…</legend>
   <div className="wa-checklist">{MOTIVES.map(([k,label])=><label key={k} className="wa-check"><input type="checkbox" checked={value.handoff[k] as boolean} onChange={e=>set({handoff:{...value.handoff,[k]:e.target.checked}})}/>{label}</label>)}</div>
   <label className="wa-check"><input type="checkbox" checked={value.handoff_notice} onChange={e=>set({handoff_notice:e.target.checked})}/>Avisar al cliente que lo pasas a un asesor</label>
   {value.handoff_notice&&<label>Mensaje al pasar a un asesor<textarea rows={2} maxLength={300} value={value.messages.handoff} onChange={e=>set({messages:{...value.messages,handoff:e.target.value}})}/><span className="small muted">Es lo único que recibe el cliente en ese momento; la IA no escribe nada más. A ti te llega un aviso en Tinbana.</span></label>}
   <label>Otros motivos <span className="muted">(opcional)</span><textarea rows={2} maxLength={400} value={value.handoff.custom} onChange={e=>set({handoff:{...value.handoff,custom:e.target.value}})} placeholder="Ej. Pedidos de más de 5 unidades o clientes de otros países"/></label>
  </fieldset>
  <fieldset><legend>Horario de atención</legend>
   <div className="wa-days" role="group" aria-label="Días de atención">{DAYS.map(([d,label])=><button type="button" key={d} className={value.schedule.days.includes(d)?'is-on':''} aria-pressed={value.schedule.days.includes(d)} onClick={()=>day(d)}>{label}</button>)}</div>
   <div className="wa-hours"><label>Desde<input type="time" value={value.schedule.start} onChange={e=>set({schedule:{...value.schedule,start:e.target.value}})}/></label><label>Hasta<input type="time" value={value.schedule.end} onChange={e=>set({schedule:{...value.schedule,end:e.target.value}})}/></label></div>
   <div className="wa-choices">
    <label className={'wa-choice'+(value.schedule.off_hours==='reply'?' is-on':'')}><input type="radio" name={idPrefix+'-off'} checked={value.schedule.off_hours==='reply'} onChange={()=>set({schedule:{...value.schedule,off_hours:'reply'}})}/><strong>La IA responde igual</strong><small>Atiende a cualquier hora. El horario se usa para los recordatorios.</small></label>
    <label className={'wa-choice'+(value.schedule.off_hours==='handoff'?' is-on':'')}><input type="radio" name={idPrefix+'-off'} checked={value.schedule.off_hours==='handoff'} onChange={()=>set({schedule:{...value.schedule,off_hours:'handoff'}})}/><strong>Avisar y pasar a un asesor</strong><small>Fuera de horario envía el mensaje de abajo y deja el chat para un asesor.</small></label>
   </div>
  </fieldset>
  <fieldset><legend>Mensajes automáticos</legend>
   <label>Fuera de horario<textarea rows={2} maxLength={300} value={value.messages.off_hours} onChange={e=>set({messages:{...value.messages,off_hours:e.target.value}})}/></label>
   <label>Si la IA no puede responder<textarea rows={2} maxLength={300} value={value.messages.fallback} onChange={e=>set({messages:{...value.messages,fallback:e.target.value}})}/></label>
   <label>Si el cliente envía fotos, audios u otros archivos<textarea rows={2} maxLength={300} value={value.messages.unsupported} onChange={e=>set({messages:{...value.messages,unsupported:e.target.value}})}/></label>
  </fieldset>
 </div>;
}
