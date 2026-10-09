<?php
declare(strict_types=1);
namespace App;
use PDO;
final class Database {
 private static ?PDO $pdo=null;
 public static function connection(): PDO {
  if(self::$pdo) return self::$pdo;
  $parts=['host'=>Support::env('DB_HOST'),'port'=>Support::env('DB_PORT','5432'),'dbname'=>Support::env('DB_DATABASE','postgres'),'sslmode'=>Support::env('DB_SSLMODE','verify-full'),'connect_timeout'=>'10'];
  if(Support::env('DB_SSLROOTCERT')!=='') $parts['sslrootcert']=Support::env('DB_SSLROOTCERT');
  foreach($parts as $v) if(str_contains($v,';')) throw new \RuntimeException('Configuración de PostgreSQL inválida.');
  // PDO forwards these values to libpq; quote paths/values containing spaces.
  $dsn='pgsql:'.implode(';',array_map(fn($k,$v)=>$k."='".str_replace(['\\',"'"],['\\\\',"\\'"],$v)."'",array_keys($parts),$parts));
  self::$pdo=new PDO($dsn,Support::env('DB_USERNAME'),Support::env('DB_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
  self::$pdo->exec("SET timezone='UTC'; SET statement_timeout='15000'; SET search_path=public");
  return self::$pdo;
 }
 public static function query(string $sql,array $args=[]): \PDOStatement { $s=self::connection()->prepare($sql);$s->execute($args);return $s; }
 public static function one(string $sql,array $args=[]): ?array { return self::query($sql,$args)->fetch()?:null; }
 public static function all(string $sql,array $args=[]): array { return self::query($sql,$args)->fetchAll(); }
}
