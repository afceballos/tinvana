<?php
require dirname(__DIR__).'/bootstrap.php';
use App\{Blocks,LandingRenderer,Support,HttpError};
$passed=0;function checkList($name,$ok){global $passed;if(!$ok)throw new RuntimeException($name);$passed++;echo "PASS $name\n";}
function rejectList($name,$fn){try{$fn();}catch(HttpError){checkList($name,true);return;}throw new RuntimeException($name);}
$id=Support::uuid();$block=Blocks::make('productList',['selectedProductIds'=>[$id,$id]]);$clean=Blocks::validate([$block]);
checkList('selected references deduplicated',$clean[0]['data']['selectedProductIds']===[$id]);
$block['data']['selectedProductIds']=['invalid'];rejectList('invalid product reference rejected',fn()=>Blocks::validate([$block]));
$block['data']['selectedProductIds']=array_map(fn()=>Support::uuid(),range(1,21));rejectList('twenty product limit',fn()=>Blocks::validate([$block]));
$block['data']['selectedProductIds']=[];rejectList('empty visible product list cannot publish',fn()=>Blocks::publishable(['blocks'=>Blocks::validate([$block])]));
checkList('HTML excerpt has spaces and decoded entities',LandingRenderer::excerpt('<p>Uno &amp; dos</p><p>Tres</p>')==='Uno & dos Tres');
checkList('scripts excluded from excerpt',LandingRenderer::excerpt('<script>alert(1)</script>Texto')==='Texto');
checkList('Unicode excerpt limited',mb_strlen(LandingRenderer::excerpt(str_repeat('Á',220)))===180);
checkList('no database query for empty list',LandingRenderer::selectedCards([],'')===[]);
echo "$passed product-list checks passed.\n";
