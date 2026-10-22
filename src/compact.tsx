import type {ReactNode} from 'react';
import {Icon} from './ui';
import './compact.css';

// Small presentational pieces shared by the compact lists (products, leads, orders).
export function initials(name:string){const parts=name.trim().split(/\s+/).filter(Boolean);return ((parts[0]?.[0]??'?')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase();}
function hue(name:string){let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))%360;return h;}

export function Avatar({name,size=40}:{name:string;size?:number}){
 return <span className="cx-avatar" aria-hidden="true" style={{width:size,height:size,['--hue' as string]:hue(name)}}>{initials(name)}</span>;
}

export function Stat({icon,label,value,hint,tone='neutral'}:{icon:string;label:string;value:ReactNode;hint?:string;tone?:'neutral'|'good'|'warn'|'bad'}){
 return <div className={'cx-stat cx-'+tone}><span className="cx-stat-icon"><Icon name={icon}/></span><div><span className="cx-stat-label">{label}</span><strong className="cx-stat-value">{value}</strong>{hint&&<small>{hint}</small>}</div></div>;
}

export function Chips<T extends string>({value,onChange,items,label}:{value:T;onChange:(v:T)=>void;items:{value:T;label:string;count?:number}[];label:string}){
 return <div className="cx-chips" role="group" aria-label={label}>{items.map(i=><button type="button" key={i.value} className="cx-chip" aria-pressed={value===i.value} onClick={()=>onChange(i.value)}>{i.label}{i.count!==undefined&&<span>{i.count}</span>}</button>)}</div>;
}
