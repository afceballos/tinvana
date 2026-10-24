import definitions from '../backend/blocks.json';
import type {BlockData,BlockItem,BlockType,LandingBlock} from './types';
export const blockRegistry=definitions as Record<BlockType,{name:string;description:string;icon:string;variants:string[];fields:string[];items:boolean}>;
export const dropiFieldLabels:Record<string,string>={id:'ID del producto',sku:'SKU',categories:'Categoría',stock:'Stock total por bodegas',supplier:'Proveedor',supplierStatus:'Estado del proveedor',type:'Tipo',warehouses:'Bodegas y unidades'};
export const variantLabels:Record<string,string>={'image-left':'Imagen a la izquierda','image-right':'Imagen a la derecha',centered:'Centrado','full-image':'Imagen grande',minimal:'Minimalista',cards:'Tarjetas',grid:'Cuadrícula',icons:'Con íconos',checks:'Con checks',horizontal:'Horizontal',numbered:'Numerado',standard:'Clásico',highlight:'Destacado',narrow:'Columna de lectura',bullets:'Viñetas',steps:'Pasos',list:'Lista','image-text':'Imagen con texto',stepper:'Secuencia vertical',timeline:'Línea de tiempo',compact:'Compacto',carousel:'Carrusel',thumbnails:'Imagen + miniaturas',editorial:'Editorial','image-top':'Imagen superior',table:'Tabla',accordion:'Acordeón',bar:'Barra informativa',expanded:'Expandido',columns:'Dos columnas',text:'Texto',band:'Banda',card:'Tarjeta',image:'Con imagen',space:'Espacio',line:'Línea',surface:'Cambio de fondo'};
export function newBlock(type:BlockType):LandingBlock{const definition=blockRegistry[type];const data:BlockData={};for(const field of definition.fields){if(field==='dropiFields')Object.assign(data,{dropiFields:Object.keys(dropiFieldLabels)});else if(field==='images'||field==='relatedIds'||field==='selectedProductIds')Object.assign(data,{[field]:[]});else Object.assign(data,{[field]:field==='title'&&type!=='hero'?definition.name:''});}if(definition.items)data.items=[];return {id:crypto.randomUUID(),type,visible:true,variant:definition.variants[0],style:{tone:'paper',space:'normal',align:type==='cta'?'center':'left',ratio:'landscape'},data};}
export function newItem():BlockItem{return {id:crypto.randomUUID(),title:'',description:'',value:'',quantity:'',image:'',icon:'check',rating:null,date:'',visible:true};}
export const presets:Record<string,{name:string;description:string;types:BlockType[];create?:()=>LandingBlock[]}>= {
 minimal:{name:'Minimalista',description:'Una presentación directa, beneficios y respuestas.',types:['hero','benefits','cta','faq']},
 complete:{name:'Venta completa',description:'Toda la información para conocer tu producto.',types:['hero','benefits','usage','gallery','specs','shipping','faq','cta']},
 kit:{name:'Para kits',description:'Presenta cada componente y su forma de uso.',types:['hero','includes','benefits','usage','gallery','faq','cta']},
 technical:{name:'Producto técnico',description:'Características, especificaciones y cuidados.',types:['hero','list','specs','gallery','precautions','cta']},
 blank:{name:'En blanco',description:'Comienza con un lienzo vacío y agrega secciones.',types:[]},
 lorem:{name:'Lorem ipsum · Todos los módulos',description:'19 secciones con texto de ejemplo listo para reemplazar. Usa las imágenes y datos de tu producto.',types:['hero','benefits','includes','usage','gallery','imageText','richText','list','specs','dropiData','shipping','payment','faq','precautions','testimonials','related','policies','divider','cta'],create:createLoremBlocks}
};
export function createLoremBlocks():LandingBlock[]{
 const paragraph='Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
 const rich='<p>'+paragraph+'</p><p><strong>Lorem ipsum dolor sit amet.</strong> Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>';
 return presets.lorem.types.map(type=>{
  const block=newBlock(type);const data=block.data;
  if('title' in data)data.title=type==='hero'?'Lorem ipsum dolor sit amet':blockRegistry[type].name+' · Lorem ipsum';
  if('subtitle' in data)data.subtitle='Contenido de ejemplo para reemplazar. '+paragraph.slice(0,123);
  if('label' in data)data.label='Lorem ipsum · Ejemplo';
  if('text' in data)data.text=type==='hero'?Array.from({length:6},()=>'<p>'+paragraph+'</p>').join(''):rich;
  if('ctaText' in data)data.ctaText='Lorem ipsum · Pedir ahora';
  if(blockRegistry[type].items){
   data.items=Array.from({length:type==='hero'?2:3},(_,index)=>({...newItem(),title:type==='faq'?'¿Lorem ipsum dolor sit amet '+(index+1)+'?':type==='testimonials'?'Lorem ipsum · Ejemplo '+(index+1):'Lorem ipsum '+(index+1),description:['faq','policies'].includes(type)?rich:paragraph,value:type==='specs'?'Lorem ipsum dolor sit amet':'',quantity:type==='includes'?'Lorem ipsum':''}));
  }
  if(type==='shipping'){data.coverage='Lorem ipsum dolor sit amet';data.cost='Lorem ipsum · Reemplazar por el costo real';data.delivery='Lorem ipsum · Reemplazar por el plazo real';data.carrier='Lorem ipsum';data.conditions=paragraph;}
  if(type==='related')data.subtitle='Selecciona tus productos relacionados en las propiedades de esta sección para mostrar sus tarjetas.';
  if(type==='dropiData')data.subtitle='Estos valores se toman del producto real de Dropi. Elige los campos que quieres mostrar.';
  if(type==='gallery')block.variant='editorial';
  if(type==='imageText')block.variant='image-right';
  if(type==='usage')block.variant='stepper';
  if(type==='list')block.variant='checks';
  if(type==='richText')block.variant='highlight';
  if(type==='divider')block.variant='line';
  if(['benefits','gallery','shipping','precautions','cta'].includes(type))block.style.tone='soft';
  return block;
 });
}
export function cloneBlocks(blocks:LandingBlock[]):LandingBlock[]{return blocks.map(block=>({...structuredClone(block),id:crypto.randomUUID(),data:{...structuredClone(block.data),...(block.data.items?{items:block.data.items.map(item=>({...item,id:crypto.randomUUID()}))}:{})}}));}
