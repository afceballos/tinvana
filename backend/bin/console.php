<?php
declare(strict_types=1);
use App\{Support,Database,Crypto,Leads,Webhooks};
require dirname(__DIR__).'/bootstrap.php';
// cPanel cron runs PHP CGI, which has no STDERR constant: send errors to the output captured by the cron log.
if(!defined('STDERR'))define('STDERR',fopen('php://output','w'));
function hiddenPassword(): string {
 if(PHP_OS_FAMILY==='Windows'){
  // PowerShell reads from the user's terminal. Nothing sensitive appears in argv or command history.
  $script='$pw = Read-Host "Contraseña del administrador (12 a 72 bytes)" -AsSecureString; $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw); try { [Console]::WriteLine("__ZENZALES_SECRET__" + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)))) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }';
  $encoded=base64_encode(iconv('UTF-8','UTF-16LE',$script));$value=shell_exec('powershell.exe -NoProfile -EncodedCommand '.$encoded);if($value===null||!preg_match('/__ZENZALES_SECRET__([A-Za-z0-9+\/=]+)/',$value,$match))throw new RuntimeException('No fue posible leer la contraseña en una terminal interactiva.');return (string)base64_decode($match[1],true);
 }
 if(!function_exists('shell_exec')||!stream_isatty(STDIN))throw new RuntimeException('Ejecuta este comando en una terminal interactiva.');
 fwrite(STDOUT,'Contraseña (12 a 72 bytes): ');shell_exec('stty -echo');try{$p=rtrim((string)fgets(STDIN),"\r\n");}finally{shell_exec('stty echo');fwrite(STDOUT,"\n");}return $p;
}
function runMigrations(): void {
  if(Database::driver()==='mysql'){App\MySqlMigrations::run();return;}
  $db=Database::connection();$db->exec('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  $db->query('SELECT pg_advisory_lock(804202601)');try{foreach(glob(dirname(__DIR__).'/migrations/*.sql') as $file){$name=basename($file);$hash=hash_file('sha256',$file);$row=Database::one('SELECT checksum FROM schema_migrations WHERE version=?',[$name]);if($row){if($row['checksum']!==$hash)throw new RuntimeException('Migración aplicada modificada: '.$name);continue;}$db->beginTransaction();try{$db->exec(file_get_contents($file));Database::query('INSERT INTO schema_migrations(version,checksum) VALUES(?,?)',[$name,$hash]);$db->commit();echo "Aplicada: $name\n";}catch(Throwable $e){$db->rollBack();throw $e;}}}finally{$db->query('SELECT pg_advisory_unlock(804202601)');}
}
try {
 $command=$argv[1]??'help';
 if($command==='key:generate'){echo base64_encode(random_bytes(32))."\n";exit;}
 if($command==='check'){
  $driver=Database::driver();$databaseExtension=$driver==='mysql'?'pdo_mysql':'pdo_pgsql';
  echo 'PHP '.PHP_VERSION."\n";foreach(['curl','pdo',$databaseExtension,'openssl','mbstring','gd','dom'] as $ext){echo $ext.': '.(extension_loaded($ext)?'OK':'FALTA')."\n";if(!extension_loaded($ext))exit(1);}if(!function_exists('imagewebp'))throw new RuntimeException('GD necesita soporte WebP.');
  if(Support::env('DB_HOST')===''){echo strtoupper($driver).": pendiente de configurar DB_HOST\n";exit(1);}
  Database::one('SELECT 1');echo strtoupper($driver).": conexión OK\n";Crypto::decrypt(Crypto::encrypt('check','check'),'check');echo "Cifrado: OK\n";exit;
 }
 if($command==='migrate'){runMigrations();exit;}
 if($command==='migrate:auto'){
  // Cron guard: no database connection unless the migration files changed since the last successful run.
  $root=dirname(__DIR__);$files=Database::driver()==='mysql'?array_merge([$root.'/mysql/schema.sql'],glob($root.'/mysql/migrations/*.sql')?:[]):(glob($root.'/migrations/*.sql')?:[]);
  $print=hash('sha256',implode("\n",array_map(fn($file)=>basename($file).':'.hash_file('sha256',$file),$files)));$stamp=$root.'/storage/migrations.stamp';
  if(is_file($stamp)&&trim((string)file_get_contents($stamp))===$print)exit;
  echo '['.gmdate('c')."] Cambios en las migraciones; aplicando.\n";runMigrations();file_put_contents($stamp,$print."\n");exit;
 }
 if($command==='admin:create'){
  $email=$argv[2]??'';if($email===''){$email=readline('Email del administrador: ');}if(!filter_var($email,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Email inválido.');
  if(Database::one('SELECT id FROM users WHERE email=?',[strtolower($email)]))throw new RuntimeException('Ese usuario ya existe.');
  $password=hiddenPassword();if(strlen($password)<12||strlen($password)>72)throw new RuntimeException('La contraseña debe tener entre 12 y 72 bytes.');
  Database::query("INSERT INTO users(id,email,password_hash,role,email_verified_at) VALUES(?,?,?,'admin',now())",[Support::uuid(),strtolower($email),password_hash($password,PASSWORD_DEFAULT)]);echo "Administrador creado.\n";exit;
 }
 if($command==='ai:import'){
  $email=strtolower($argv[2]??'');$user=Database::one('SELECT id FROM users WHERE email=?',[$email]);if(!$user)throw new RuntimeException('Usuario no encontrado.');
  if(Database::one('SELECT provider FROM ai_connections WHERE user_id=? AND provider=?',[$user['id'],'openai']))throw new RuntimeException('Esa cuenta ya tiene una conexión OpenAI. Reemplázala desde el panel.');
  App\AiConnections::save($user['id'],'openai',['key'=>Support::env('OPENAI_API_KEY')]);echo "Clave OpenAI importada y cifrada únicamente para la cuenta indicada. No hay fallback global.\n";exit;
 }
 if($command==='integration:import'){
  $email=strtolower($argv[2]??'');$u=Database::one('SELECT id FROM users WHERE email=?',[$email]);if(!$u)throw new RuntimeException('Usuario no encontrado.');
  $path=realpath(Support::env('LEGACY_CONFIG_PATH'));$public=realpath(dirname(__DIR__).'/public');if(!$path||str_starts_with($path,$public.DIRECTORY_SEPARATOR))throw new RuntimeException('Configura una ruta privada fuera de public/.');
  // Parse literal JS config without executing the file and without printing secrets.
  $source=file_get_contents($path);$found=preg_match('/(?:dropiToken|dropiIntegrationKey|integrationKey|token)["\x27]?\s*:\s*["\x27]([^"\x27\r\n]+)["\x27]/i',$source,$m);
  if(!$found)$found=preg_match('/["\x27](?:DROPI_INTEGRATION_KEY|dropi_token)["\x27]\s*=>\s*["\x27]([^"\x27\r\n]+)["\x27]/',$source,$m);
  if(!$found)throw new RuntimeException('No se encontró un token literal reconocido. Usa el panel para guardarlo.');
  $id=Support::uuid();Database::query('INSERT INTO integrations(id,user_id,name,token_ciphertext) VALUES(?,?,?,?)',[$id,$u['id'],'Dropi importada',Crypto::encrypt($m[1],$id.':'.$u['id'])]);echo "Integración importada y cifrada. Conexión aún no probada.\n";exit;
 }
 if($command==='webhook:import'){
  $email=strtolower($argv[2]??'');$user=Database::one('SELECT id FROM users WHERE email=?',[$email]);
  if(!$user)throw new RuntimeException('Usuario no encontrado.');
  if(Webhooks::view($user['id'])['configured'])throw new RuntimeException('Ese usuario ya tiene un webhook. Reemplázalo desde el panel.');
  Webhooks::save($user['id'],['provider'=>'ghl','enabled'=>true,'url'=>Support::env('GHL_WEBHOOK_URL')]);
  echo "Webhook del entorno importado y cifrado para el usuario indicado.\n";exit;
 }
 if($command==='mail:test'){$to=(string)($argv[2]??'');if(!filter_var($to,FILTER_VALIDATE_EMAIL)){fwrite(STDERR,"Uso: php bin/console.php mail:test correo@dominio\n");exit(1);}$r=App\AccountMail::diagnose($to);echo implode(PHP_EOL,$r['lines']).PHP_EOL;exit($r['ok']?0:1);}
 if($command==='dropi:shipping-probe'){echo App\DropiProbe::run((string)($argv[2]??''),(string)($argv[3]??'11001'));exit;}
 if($command==='mail:work'){echo Support::json(App\AccountMail::work(min(100,max(1,(int)($argv[2]??20))))).PHP_EOL;exit;}
 if($command==='webhooks:work'){echo Support::json(Leads::deliver(min(100,max(1,(int)($argv[2]??20)))))."\n";exit;}
 if($command==='maintenance'){Database::query("UPDATE account_mail SET status='cancelled',payload_ciphertext=null,updated_at=now() WHERE status IN ('pending','failed') AND token_id IN (SELECT id FROM account_tokens WHERE expires_at<now() OR used_at IS NOT NULL)");Database::query("DELETE FROM account_tokens WHERE expires_at<now()-interval '7 days'");Database::query('DELETE FROM rate_limits WHERE expires_at<now()-interval \'1 day\'');echo "Límites vencidos eliminados.\n";exit;}
 echo "Comandos: check, key:generate, migrate, migrate:auto, admin:create [email], integration:import email, ai:import email, webhook:import email, webhooks:work [20], mail:work [20], mail:test correo@dominio, dropi:shipping-probe [email] [dane_destino], maintenance\n";
}catch(Throwable $e){$driver=Support::env('DB_DRIVER','pgsql');fwrite(STDERR,'Error: '.($e instanceof PDOException?strtoupper($driver).' no disponible o consulta inválida (SQLSTATE '.$e->getCode().'). Comprueba la conexión y las migraciones.':$e->getMessage())."\n");exit(1);}
