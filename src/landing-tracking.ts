// Store pixels on public landings. The server writes the IDs as JSON (#tb-tracking) and opens only their domains in the
// CSP; this file loads the official Meta and Google scripts and sends the shopping events. Never runs in previews.
type Product={id:string;name:string;price:number|null;currency:string};
type Config={meta:string;ga4:string;ads:string;adsLabel:string;gtm:string;product:Product};
export type PurchaseData={value:number|null;currency:string;quantity:number;orderNumber:string|null;eventId:string};
type Win=Window&{fbq?:((...args:unknown[])=>void)&{callMethod?:(...a:unknown[])=>void;queue:unknown[];loaded:boolean;version:string;push:unknown};_fbq?:unknown;dataLayer?:unknown[];gtag?:(...args:unknown[])=>void};

const w=window as Win;let config:Config|null=null;

function script(src:string){const s=document.createElement('script');s.async=true;s.src=src;document.head.append(s);}
const items=(p:Product,quantity=1,price=p.price)=>[{item_id:p.id,item_name:p.name,price:price??undefined,quantity}];
function layer(event:string,ecommerce:Record<string,unknown>){if(!config?.gtm)return;w.dataLayer!.push({ecommerce:null});w.dataLayer!.push({event,ecommerce});}

export function initTracking(){
 const node=document.getElementById('tb-tracking');if(!node||document.body.dataset.preview==='true')return;
 try{config=JSON.parse(node.textContent||'null') as Config;}catch{return;}
 if(!config)return;const p=config.product;
 if(config.meta){
  // Official Meta base code, written as a module because the page does not allow inline scripts.
  if(!w.fbq){const f=function(...args:unknown[]){f.callMethod?f.callMethod(...args):f.queue.push(args);} as NonNullable<Win['fbq']>;f.push=f;f.loaded=true;f.version='2.0';f.queue=[];w.fbq=f;w._fbq=f;script('https://connect.facebook.net/en_US/fbevents.js');}
  w.fbq!('init',config.meta);w.fbq!('track','PageView');
  w.fbq!('track','ViewContent',{content_ids:[p.id],content_name:p.name,content_type:'product',value:p.price??undefined,currency:p.currency});
 }
 if(config.ga4||config.ads||config.gtm)w.dataLayer=w.dataLayer||[];
 if(config.gtm){w.dataLayer!.push({'gtm.start':Date.now(),event:'gtm.js'});script('https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(config.gtm));}
 if(config.ga4||config.ads){
  // gtag needs the real `arguments` object, so it cannot be an arrow function.
  w.gtag=function(){w.dataLayer!.push(arguments);};w.gtag('js',new Date());
  if(config.ga4)w.gtag('config',config.ga4);if(config.ads)w.gtag('config',config.ads);
  script('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(config.ga4||config.ads));
  w.gtag('event','view_item',{currency:p.currency,value:p.price??undefined,items:items(p)});
 }
 layer('view_item',{currency:p.currency,value:p.price??undefined,items:items(p)});
}

/** The buyer opened the order form. */
export function trackCheckout(quantity:number,unit:number|null){
 if(!config)return;const p=config.product,value=unit===null?undefined:unit*quantity;
 w.fbq?.('track','InitiateCheckout',{content_ids:[p.id],content_type:'product',num_items:quantity,value,currency:p.currency});
 w.gtag?.('event','begin_checkout',{currency:p.currency,value,items:items(p,quantity,unit)});
 layer('begin_checkout',{currency:p.currency,value,items:items(p,quantity,unit)});
}

/** The server saved the order: on cash on delivery that is the sale (Purchase). */
export function trackPurchase(d:PurchaseData){
 if(!config)return;const p=config.product,value=d.value??undefined,unit=d.value===null?null:d.value/d.quantity;
 // eventID lets the Conversions API (phase 2) send the same sale from the server without Meta counting it twice.
 w.fbq?.('track','Purchase',{content_ids:[p.id],content_name:p.name,content_type:'product',num_items:d.quantity,value,currency:d.currency},{eventID:d.eventId});
 const transaction_id=d.orderNumber||d.eventId;
 w.gtag?.('event','purchase',{transaction_id,currency:d.currency,value,items:items(p,d.quantity,unit)});
 if(config.ads&&config.adsLabel)w.gtag?.('event','conversion',{send_to:config.ads+'/'+config.adsLabel,value,currency:d.currency,transaction_id});
 layer('purchase',{transaction_id,currency:d.currency,value,items:items(p,d.quantity,unit)});
}
