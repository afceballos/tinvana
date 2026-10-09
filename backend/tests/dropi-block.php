<?php
require dirname(__DIR__).'/bootstrap.php';
use App\{Blocks,Product,LandingRenderer,HttpError};
$passed=0;function check($name,$ok){global $passed;if(!$ok)throw new RuntimeException($name);echo "PASS $name\n";$passed++;}
$raw=['id'=>2295775,'sku'=>'FGRHYOL','type'=>'SIMPLE','categories'=>[['name'=>'Tecnologia']],'user'=>['store_name'=>'IMPONOVEDADES','verified'=>true],'warehouse_product'=>[['stock'=>100,'warehouse'=>['name'=>'BODEGA OF','city'=>['name'=>'MEDELLIN']]]]];$p=Product::map($raw);
$b=Blocks::validate([Blocks::make('dropiData')])[0];check('default field choices validated',count($b['data']['dropiFields'])===8);
$html=LandingRenderer::dropiData($b['data']['dropiFields'],$p);foreach(['2295775','FGRHYOL','Tecnologia','100 unidades','IMPONOVEDADES','VERIFICADO','SIMPLE','BODEGA OF · MEDELLIN'] as $value)check('upstream value '.$value,str_contains($html,$value));
$hidden=LandingRenderer::dropiData(['id','stock'],$p);check('hidden provider SKU and warehouses omitted',!str_contains($hidden,'IMPONOVEDADES')&&!str_contains($hidden,'FGRHYOL')&&!str_contains($hidden,'MEDELLIN'));check('empty selection renders nothing',LandingRenderer::dropiData([],$p)==='');
$p['stock']=0;check('zero stock remains visible',str_contains(LandingRenderer::dropiData(['stock'],$p),'<dd>0</dd>'));
check('premium does not imply verification',Product::supplierStatus(['plan'=>['name'=>'SUPPLIER PREMIUM']])===null);check('explicit false does not become verified',Product::supplierStatus(['verified'=>false])==='NO VERIFICADO');check('absent data omitted',LandingRenderer::dropiData(['sku','supplierStatus'],['id'=>'1'])==='');
$b['data']['dropiFields']=['cost'];try{Blocks::validate([$b]);throw new RuntimeException('arbitrary field accepted');}catch(HttpError){check('unapproved private fields refused',true);}
$b=Blocks::make('dropiData',['dropiFields'=>['id'],'stock'=>999,'supplier'=>'Forged']);$clean=Blocks::validate([$b])[0];check('editor cannot forge upstream values',!isset($clean['data']['stock'])&&!isset($clean['data']['supplier']));
$p['supplier']='<script>bad()</script>';check('upstream values escaped',!str_contains(LandingRenderer::dropiData(['supplier'],$p),'<script>'));
echo "$passed Dropi block checks passed. Fixtures only; no external calls.\n";
