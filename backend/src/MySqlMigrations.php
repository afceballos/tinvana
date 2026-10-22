<?php
declare(strict_types=1);
namespace App;

use PDO;

final class MySqlMigrations
{
    private const TABLES=[
        'schema_migrations','users','integrations','selected_products','template_settings','landing_pages','leads',
        'webhook_settings','webhook_deliveries','rate_limits','media_assets','ai_connections','account_tokens',
        'account_mail','orders','order_events','product_offers','product_offer_versions',
    ];

    public static function run():void
    {
        $db=Database::connection();$lock=Database::one("SELECT GET_LOCK('tinvana_schema_migrations',10) AS acquired");
        if((int)($lock['acquired']??0)!==1)throw new \RuntimeException('No se pudo obtener el bloqueo de migraciones MySQL.');
        try{
            $found=array_column(Database::all("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()"),'table_name');
            $missing=array_values(array_diff(self::TABLES,$found));
            if($missing)throw new \RuntimeException('Faltan tablas MySQL: '.implode(', ',$missing).'. Importa backend/mysql/schema.sql en una base vacía y vuelve a ejecutar.');
            $schema=dirname(__DIR__).'/mysql/schema.sql';$checksum=hash_file('sha256',$schema);
            $baseline=Database::one("SELECT checksum FROM schema_migrations WHERE version='mysql-schema-v1'");
            if($baseline&& !hash_equals((string)$baseline['checksum'],$checksum))throw new \RuntimeException('El esquema MySQL inicial cambió desde que se registró. Usa una migración versionada, no vuelvas a importar el SQL base.');
            if(!$baseline)Database::query("INSERT INTO schema_migrations(version,checksum) VALUES('mysql-schema-v1',?)",[$checksum]);
            foreach(glob(dirname(__DIR__).'/mysql/migrations/*.sql')?:[] as $file){
                $version=basename($file);$hash=hash_file('sha256',$file);$row=Database::one('SELECT checksum FROM schema_migrations WHERE version=?',[$version]);
                if($row){if(!hash_equals((string)$row['checksum'],$hash))throw new \RuntimeException('Migración MySQL aplicada y modificada: '.$version);continue;}
                $sql=trim((string)file_get_contents($file));if($sql==='')throw new \RuntimeException('Migración MySQL vacía: '.$version);
                if(substr_count(rtrim($sql,';'),';')>0)throw new \RuntimeException('Cada archivo de migración MySQL debe contener una sola sentencia DDL/DML.');
                $db->exec($sql);Database::query('INSERT INTO schema_migrations(version,checksum) VALUES(?,?)',[$version,$hash]);echo "Aplicada: {$version}\n";
            }
            echo 'Esquema MySQL verificado ('.count(self::TABLES).' tablas); versión del servidor '.(Database::one('SELECT VERSION() AS version')['version']??'desconocida').".\n";
        }finally{Database::one("SELECT RELEASE_LOCK('tinvana_schema_migrations') AS released");}
    }
}
