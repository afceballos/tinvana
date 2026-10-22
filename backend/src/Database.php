<?php
declare(strict_types=1);
namespace App;
use PDO;

final class Database {
 private static ?PDO $pdo=null;

 public static function driver(): string {
  $driver=strtolower(Support::env('DB_DRIVER','pgsql'));
  if(!in_array($driver,['pgsql','mysql'],true)) throw new \RuntimeException('DB_DRIVER debe ser pgsql o mysql.');
  return $driver;
 }

 public static function connection(): PDO {
  if(self::$pdo) return self::$pdo;
  $driver=self::driver();$host=Support::env('DB_HOST');$database=Support::env('DB_DATABASE');$username=Support::env('DB_USERNAME');
  if($host===''||$database===''||$username==='') throw new \RuntimeException('Faltan DB_HOST, DB_DATABASE o DB_USERNAME.');
  $options=[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false];
  if($driver==='mysql') {
   if(str_contains($host,';')||str_contains($database,';')) throw new \RuntimeException('Invalid MySQL connection configuration.');
   $dsn='mysql:host='.$host.';port='.(int)Support::env('DB_PORT','3306').';dbname='.$database.';charset=utf8mb4';
   $options[PDO::ATTR_TIMEOUT]=10;
   self::$pdo=new PDO($dsn,$username,Support::env('DB_PASSWORD'),$options);
   self::$pdo->exec("SET time_zone = '+00:00'");
   return self::$pdo;
  }
  $parts=['host'=>$host,'port'=>Support::env('DB_PORT','5432'),'dbname'=>$database,'sslmode'=>Support::env('DB_SSLMODE','verify-full'),'connect_timeout'=>'10'];
  if(Support::env('DB_SSLROOTCERT')!=='') $parts['sslrootcert']=Support::env('DB_SSLROOTCERT');
  foreach($parts as $value) if(str_contains($value,';')) throw new \RuntimeException('Invalid PostgreSQL connection configuration.');
  $dsn='pgsql:'.implode(';',array_map(fn($key,$value)=>$key."='".str_replace(['\\',"'"],['\\\\',"\\'"],$value)."'",array_keys($parts),$parts));
  self::$pdo=new PDO($dsn,$username,Support::env('DB_PASSWORD'),$options);
  self::$pdo->exec("SET timezone='UTC'; SET statement_timeout='15000'; SET search_path=public");
  return self::$pdo;
 }

 public static function query(string $sql,array $args=[]): \PDOStatement {
  if(self::driver()==='mysql')$sql=MySqlDialect::sql($sql);
  $s=self::connection()->prepare($sql);$s->execute($args);return $s;
 }
 public static function one(string $sql,array $args=[]): ?array {
  if(self::driver()==='mysql'&&($plan=MySqlDialect::returning($sql,$args))!==null){
   $write=self::query($plan['sql'],$args);
   if($plan['do_nothing']&&$write->rowCount()===0)return null;
   return self::query($plan['select'],$plan['args'])->fetch()?:null;
  }
  return self::query($sql,$args)->fetch()?:null;
 }
 public static function all(string $sql,array $args=[]): array { return self::query($sql,$args)->fetchAll(); }
}
