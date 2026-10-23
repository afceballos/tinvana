<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
use App\Orders;
$passed=0;
function check(string $name,bool $condition): void {global $passed;if(!$condition)throw new RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
$a=fn(string $t)=>Orders::parseShipping($t)['amount']??null;
check('free shipping is zero',$a('Envío gratis a todo Colombia')==='0.00'&&$a('GRATIS')==='0.00'&&$a('Incluido en el precio')==='0.00'&&$a('Sin costo')==='0.00');
check('thousands with dot',$a('$12.000')==='12000.00');
check('thousands with comma',$a('$ 15,000 COP')==='15000.00');
check('plain number',$a('9900')==='9900.00');
check('cents kept',$a('12.000,50')==='12000.50');
check('delivery days are not a price',$a('Llega en 2 a 5 días hábiles')===null);
check('days then price picks the price',$a('2 a 5 días, $10.000')==='10000.00');
check('empty text has no hint',$a('   ')===null);
check('original text is returned',Orders::parseShipping('Envío $8.500')['text']==='Envío $8.500');
echo "Shipping hint checks: $passed\n";
