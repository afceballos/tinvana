<?php
declare(strict_types=1);
require dirname(__DIR__).'/bootstrap.php';
use App\{DeliveryAddress,HttpError};
$passed=0;
function check(string $name,bool $condition): void {global $passed;if(!$condition)throw new RuntimeException('FAIL: '.$name);$passed++;echo 'PASS '.$name."\n";}
function phone(string $n,string $region='CO'): ?string {try{return DeliveryAddress::phone($n,$region)['phone'];}catch(HttpError){return null;}}
// Formats people type when the flag picker already shows +57.
foreach(['3001234567','300 123 4567','(300) 123-4567','+57 300 123 4567','573001234567','+57 57 300 123 4567','+5757 3001234567','03001234567'] as $typed)
 check('accepted: '.$typed,phone($typed)==='+573001234567');
check('landline accepted',phone('601 234 5678')==='+576012345678');
check('foreign number keeps its country',phone('2025550123','US')==='+12025550123');
check('international number with another flag',phone('+1 202 555 0123')==='+12025550123');
foreach(['1234567890','300123456','30012345678','3999999999'] as $bad)check('rejected: '.$bad,phone($bad)===null);
try{DeliveryAddress::phone('1234567890','CO');}catch(HttpError $e){check('message names the dial code and asks for no prefix',str_contains($e->getMessage(),'+57')&&str_contains($e->getMessage(),'sin el prefijo'));}
echo "Phone checks: $passed\n";
