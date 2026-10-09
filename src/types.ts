export type User={id:string;email:string;role:string};
export type Integration={id:string;name:string;configured:boolean};
export type Product={id:string;name:string;description:string;price:number|null;suggestedPrice:number|null;sku:string|null;images:string[];categories:{id:string|null;name:string|null}[];stock:number|null;warehouses:{name:string|null;city:string|null;stock:number|null}[];supplier:string|null;attributes:unknown[];variations:unknown[];selectedId?:string|null};
export type Visual={primaryColor:string;backgroundColor:string;buttonText:string;whatsapp:string};
export type Content={title:string;description:string;publicPrice:number|null;images:string[];features:string[];seoTitle:string;seoDescription:string;visual:Visual};
export type Landing={id:string;slug:string;status:'draft'|'published';selected_product_id:string;content:Content;product_snapshot:Product};
export type Selected={id:string;integration_id:string;dropi_id:string;product:Product;landing_id:string|null;slug:string|null;publication_status:string|null};
export type Lead={id:string;first_name:string;last_name:string;email:string;phone:string;status:string;attempts:number;last_http_status:number|null;last_error:string|null;created_at:string;product_data:{product_name:string;landing_url:string;dropi_price?:number|null;public_price:number|null;inflated_price?:number|null};history:{attempt:number;at:string;http_status:number;error:string|null;result:string}[]};
