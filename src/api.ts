let csrf='';
let pendingRequests=0;
const requestListeners=new Set<()=>void>();
export function getPendingRequests(){return pendingRequests;}
export function subscribeRequests(listener:()=>void){requestListeners.add(listener);return()=>{requestListeners.delete(listener);};}
function pendingChange(delta:number){pendingRequests+=delta;requestListeners.forEach(listener=>listener());}
export function setCsrf(value:string){csrf=value;}
// Read once by the login screen to explain why the user was sent there.
export function markSessionExpired(){try{sessionStorage.setItem('tinvana-session-expired','1');}catch{}}
export function takeSessionExpired(){try{const v=sessionStorage.getItem('tinvana-session-expired')==='1';sessionStorage.removeItem('tinvana-session-expired');return v;}catch{return false;}}
export class ApiError extends Error{constructor(message:string,public status:number){super(message);}}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 pendingChange(1);
 try{
 const response=await fetch(path,{...options,credentials:'same-origin',headers:{...(!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{}),...options.headers}});
 const data=await response.json().catch(()=>({error:'El servidor no devolvió JSON válido.'}));
 if(!response.ok){if(response.status===401&&!path.includes('/auth/')){markSessionExpired();window.dispatchEvent(new Event('session-expired'));}throw new ApiError(data.error||'No se pudo completar la solicitud.',response.status);}return data;
 }finally{pendingChange(-1);}
}
export function post<T>(path:string,body:unknown={}){return api<T>(path,{method:'POST',body:JSON.stringify(body)});}
export function money(n:number|null){return n===null?'No disponible':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);}
