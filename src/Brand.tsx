export function BrandLogo({compact=false,decorative=false,className=''}:{compact?:boolean;decorative?:boolean;className?:string}){
 return <span className={'brand-logo '+(compact?'brand-logo-compact':'brand-logo-full')+' '+className} aria-hidden={decorative||undefined}>{!compact&&<img className="brand-full" src="/brand/tinvana-light.svg" width="246" height="59" alt={decorative?'':'Tinbana'}/>}<span className={'brand-symbol '+(!compact?'brand-symbol-collapse':'')}><img src="/brand/tinvana-origami.svg" width="56" height="40" alt={compact&&!decorative?'Tinbana':''}/></span></span>;
}
