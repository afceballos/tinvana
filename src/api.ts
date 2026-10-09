let csrf='';
export function setCsrf(value:string){csrf=value;}
export class ApiError extends Error{constructor(message:string,public status:number){super(message);}}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(path,{...options,credentials:'same-origin',headers:{...(!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{}),...options.headers}});
 const data=await response.json().catch(()=>({error:'El servidor no devolvió JSON válido.'}));
 if(!response.ok){if(response.status===401&&!path.includes('/auth/'))window.dispatchEvent(new Event('session-expired'));throw new ApiError(data.error||'No se pudo completar la solicitud.',response.status);}return data;
}
export function post<T>(path:string,body:unknown={}){return api<T>(path,{method:'POST',body:JSON.stringify(body)});}
export function money(n:number|null){return n===null?'No disponible':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);}
