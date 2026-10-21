type Snapshot={customer?:Record<string,string>;delivery_address?:Record<string,string>;confirmation?:{evidence?:string};quote_id?:string};
function SnapshotView({value}:{value:Snapshot}){const c=value.customer,a=value.delivery_address;return <>{c&&<p>{c.first_name} {c.last_name}<br/>{c.email}<br/>{c.phone}</p>}{a&&<p>{a.address}<br/>{[a.city,a.state,a.country].filter(Boolean).join(', ')}{a.address_details&&<><br/>{a.address_details}</>}{a.postal_code&&<><br/>Código postal: {a.postal_code}</>}</p>}{value.confirmation?.evidence&&<p className="order-evidence"><strong>Aceptación anterior (histórica)</strong><br/>{value.confirmation.evidence}</p>}</>;}
export function OrderAudit({type,data}:{type:string;data:Record<string,unknown>}){
 if(type==='customer_updated')return <details><summary>Ver datos anteriores y nuevos</summary><h4>Antes</h4><SnapshotView value={data.before as Snapshot}/><h4>Después</h4><SnapshotView value={data.after as Snapshot}/><p>La cotización anterior quedó invalidada.{data.shipping_invalidated?' El flete requiere revisión.':''}</p></details>;
 if(type==='reopened')return <details><summary>Ver aceptación invalidada</summary><SnapshotView value={data.previous as Snapshot}/><p>Esta aceptación no autoriza la compra corregida.</p></details>;
 if(type==='quoted')return <details><summary>Ver resumen cotizado</summary><SnapshotView value={data as Snapshot}/><p>Cantidad: {String(data.quantity)}<br/>Precio unitario: {String(data.unit_price)} COP<br/>Envío: {String(data.shipping_price)} COP</p></details>;
 return null;
}
