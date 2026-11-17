import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from './api';
import {useAllowed} from './access';
import type {Commerce} from './types';

// «Pago» in the landing editor (Wompi phase 2): cash on delivery, online or both, and the online discount.
// Online payment only reaches buyers while the store's Wompi account is connected; the server enforces it too.
type Mode='cod'|'online'|'both';
const modes:[Mode,string,string][]=[['cod','Solo contraentrega','El cliente paga al recibir, como hasta ahora.'],['both','Contraentrega o en línea','El cliente elige. El pago en línea aparece primero.'],['online','Solo pago en línea','El pedido se reserva y el cliente paga con Wompi antes del envío.']];

export function BuilderPayment({commerce,ownProduct,onChange}:{commerce:Commerce;ownProduct:boolean;onChange:(c:Commerce)=>void}){
 const allowed=useAllowed('payments');const [wompi,setWompi]=useState<'loading'|'connected'|'missing'>('loading');
 useEffect(()=>{if(!allowed){setWompi('missing');return;}api<{account:{status:string}|null}>('/api/wompi/account').then(r=>setWompi(r.account?.status==='connected'?'connected':'missing')).catch(()=>setWompi('missing'));},[allowed]);
 const mode:Mode=commerce.paymentMode??'cod';const discount=commerce.onlineDiscount??0;
 if(!allowed)return <p className="builder-hint">Tu plan no incluye pagos en línea. Esta landing cobra contraentrega.</p>;
 return <div className="builder-payment">
  <div className="builder-pay-modes" role="radiogroup" aria-label="Cómo paga el cliente">{modes.map(([value,label,hint])=><label key={value} className={'builder-pay-mode'+(mode===value?' is-on':'')}><input type="radio" name="payment-mode" value={value} checked={mode===value} onChange={()=>onChange({...commerce,paymentMode:value})}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}</div>
  {mode!=='cod'&&<>
   <label>Descuento por pagar en línea (%)<input type="number" min={0} max={50} step={1} value={discount} onChange={e=>onChange({...commerce,onlineDiscount:Math.max(0,Math.min(50,Math.round(Number(e.target.value)||0)))})}/></label>
   <p className="builder-hint">{ownProduct?'En línea se cobra el producto con el descuento; el envío de tus productos propios lo cobras tú.':commerce.dropiShipping?'En línea se cobra el producto con el descuento más el envío de Dropi con pago anticipado, que es más barato que contraentrega.':'En línea se cobra el producto con el descuento. Activa «Calcular el envío con Dropi» en Envío para cobrar también el flete.'}</p>
   {wompi==='missing'&&<p className="builder-hint builder-warn" role="note">Conecta tu cuenta en <Link to="/panel/wompi">Integraciones → Wompi</Link> para que el pago en línea aparezca en la landing. Mientras tanto, se cobra contraentrega.</p>}
  </>}
 </div>;
}
