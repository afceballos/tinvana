import {useEffect,useRef,type ReactNode} from 'react';
import {Icon} from './ui';
import './builder-section.css';

/** Collapsible group of the «Producto y página» panel: icon, title, one-line summary and an optional status. */
export function BuilderSection({title,summary,icon,defaultOpen=false,status,children}:{title:string;summary?:ReactNode;icon:string;defaultOpen?:boolean;status?:ReactNode;children:ReactNode}){
 return <details className="bs" open={defaultOpen||undefined}>
  <summary><span className="bs-icon" aria-hidden="true"><Icon name={icon}/></span><span className="bs-text"><strong>{title}</strong>{summary&&<small>{summary}</small>}</span>{status}<span className="bs-chevron" aria-hidden="true"/></summary>
  <div className="bs-body">{children}</div>
 </details>;
}

/** Large editor popup for options that need room (variants, styles). Escape or the close button closes it. */
export function BuilderDialog({title,subtitle,open,onClose,children,wide=false}:{title:string;subtitle?:string;open:boolean;onClose:()=>void;children:ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open)d.showModal();if(!open&&d.open)d.close();},[open]);
 return <dialog ref={ref} className={'bd'+(wide?' is-wide':'')} aria-labelledby="bd-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}>
  {open&&<><header className="bd-head"><div><h2 id="bd-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="bd-close" aria-label="Cerrar" onClick={onClose}><Icon name="close"/></button></header>
  <div className="bd-body">{children}</div>
  <footer className="bd-foot"><span>Los cambios se aplican al momento. Guarda el borrador para conservarlos.</span><button type="button" className="primary" onClick={onClose}>Listo</button></footer></>}
 </dialog>;
}
