> **Estado MySQL:** el backend ya incluye selección PDO, adaptación de consultas, rutas específicas para operaciones condicionales y un esquema MySQL versionado. Las pruebas locales de dialecto y las pruebas funcionales sin base real pasan; aún falta validar en un servidor MySQL/MariaDB y desde GoDaddy. La compatibilidad integral no se considera confirmada hasta esa prueba.

# Despliegue en hosting PHP

Para subir imágenes instala GD con soporte WebP y configura `upload_max_filesize=8M`, `post_max_size=9M` y `memory_limit=256M`. En Nginx usa `client_max_body_size 9m;`. Mantén `backend/storage/media` escribible y fuera de la raíz pública; `/media/` debe pasar por PHP. Consulta [IMAGES.md](IMAGES.md) para permisos y copias de seguridad.

No se publicó la plataforma ni se modificó el catálogo de referencia. Despliega este proyecto en un directorio y dominio propios. El frontend compilado ya está en `backend/public/app`; recompílalo cuando cambies React.

## Comprobaciones antes de publicar

1. `php -v` debe mostrar 8.2 o superior. Confirma `curl`, `PDO`, `pdo_mysql` (si `DB_DRIVER=mysql`; `pdo_pgsql` si `pgsql`), `openssl`, `mbstring`, `dom` y GD/WebP en CLI y PHP web.
2. Configura `DB_DRIVER` y las variables `DB_*` para el motor elegido. Ejecuta `php backend/bin/console.php check`; para MySQL, `php backend/bin/console.php migrate` verifica que estén las 18 tablas y registra el esquema base sin recrear tablas.
3. Configura DNS y HTTPS para el dominio nuevo. Define el `APP_URL` canónico y `SESSION_SECURE=true` con `APP_ENV=production`.
4. La raíz web debe ser exactamente `backend/public`. `.env`, `vendor`, `src`, migraciones, comandos y pruebas permanecen fuera. Si tu hosting solo ofrece `public_html`, coloca el resto en su directorio padre y ajusta la ruta de bootstrap en `index.php`; no expongas todo `backend`.
5. Dale al proceso PHP lectura sobre configuración y código, y escritura únicamente sobre `backend/storage/sessions`. Usa permisos mínimos (ej. directorios 750, configuración 600/640 según usuario/grupo); evita 777. `storage/sessions` se crea con 0700 si es necesario.
6. Ejecuta migraciones y crea el administrador en terminal privada. Configura el webhook y cron. Mantén `display_errors=Off` en producción.
7. Prueba login/logout, permisos, conexión Dropi real, selección, borrador 404, publicación, formulario, cron y workflow GHL desde este hosting. No basta que haya pasado localmente.

### Diagnóstico de base de datos en cPanel

Si la web muestra un error de conexión, confirma primero que desplegaste el HEAD del repositorio y que el `.env` privado está en `~/tinvana/.env` (junto a `bootstrap.php`), con `DB_DRIVER=mysql` explícito. No coloques ese archivo en `public_html` ni en el repositorio.

Desde Terminal/SSH de GoDaddy, ejecuta `php ~/tinvana/bin/console.php check`. El resultado debe indicar `MYSQL: conexión OK`; si dice `pgsql`, el proceso no está leyendo el driver MySQL esperado. Si indica que falta `pdo_mysql`, actívalo en la selección de extensiones PHP del cPanel. Si falla con MySQL, revisa host, puerto, nombre de base y usuario del cPanel en el `.env` privado. Después ejecuta `php ~/tinvana/bin/console.php migrate` para verificar el esquema, sin importar ni borrar datos.

El API registra únicamente el motor y el SQLSTATE en el log PHP; no expone detalles de conexión ni secretos. Tras desplegar la corrección, el error visible también nombra el motor que la aplicación intentó usar. Un `MYSQL: conexión OK` desde CLI aún debe contrastarse con la versión/extensiones del PHP web de cPanel.

## Build

```sh
npm ci
npm run build
composer install --working-dir=backend --no-dev --optimize-autoloader
```

Publica los recursos compilados `backend/public/app`, `index.php`, `.htaccess`, `landing.css` y `landing.js`, junto con el backend privado. No subas `node_modules`, `.tools` ni fixtures. Node no es necesario en el servidor si subes el build. PHP sí lo es; no uses hosting exclusivamente estático.

## Apache

Habilita `mod_rewrite` y permite la `.htaccess` incluida:

```apache
<VirtualHost *:443>
    ServerName plataforma.tu-dominio.example
    DocumentRoot /srv/zenzales/backend/public
    # Configura aquí certificados HTTPS y handler PHP 8.2+ de tu hosting.
    <Directory /srv/zenzales/backend/public>
        Require all granted
        AllowOverride FileInfo Options AuthConfig
        Options -Indexes
    </Directory>
</VirtualHost>
```

Las rutas desconocidas pasan al front controller. Este entrega la SPA para `/login` y `/panel/*`; las rutas protegidas React validan sesión y todos los endpoints privados vuelven a validar en PHP. `/p/{slug}` y `/preview/{id}` se resuelven antes del fallback React. Refrescar `/panel/productos` funciona sin 404 del hosting. No reescribas `/p/*` a `app/index.html`.

## Nginx + PHP-FPM

```nginx
server {
    listen 443 ssl;
    server_name plataforma.tu-dominio.example;
    root /srv/zenzales/backend/public;
    index index.php;
    # ssl_certificate y ssl_certificate_key según tu hosting.
    client_max_body_size 1m;

    location / { try_files $uri $uri/ /index.php?$query_string; }
    location = /index.php {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root/index.php;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
    }
    location ~ \.php$ { return 404; }
    location ~ /\. { deny all; }
}
```

Ajusta la versión/socket de PHP-FPM. Agrega redirección HTTP a HTTPS en un bloque de puerto 80. Si hay proxy TLS delante, configura Secure explícitamente: no confíes en headers arbitrarios para decidir la seguridad de la cookie. No se confía en `X-Forwarded-For`; los límites usan `REMOTE_ADDR`. Si el balanceador agrupa todas las IP, configura su IP real en el servidor web para que esos límites sean útiles.

## Cron

> **cPanel de GoDaddy:** `/usr/bin/php` es PHP CGI/FastCGI y no entrega los argumentos de la línea de comandos. Cada tarea debe llamarse `/usr/bin/php -q -d register_argc_argv=1 /home/USUARIO/tinvana/bin/console.php <comando>`; sin ese ajuste `console.php` solo imprime «Comandos: …» y no hace nada. `/opt/cpanel/ea-php83/…` no existe dentro del entorno de cron. Se comprobó con `mail:work`, que respondió `{"sent":1,"failed":0}`.

```cron
* * * * * cd /srv/zenzales && /usr/bin/php backend/bin/console.php webhooks:work 20 >> /var/log/zenzales-webhooks.log 2>&1
17 3 * * * cd /srv/zenzales && /usr/bin/php backend/bin/console.php maintenance >> /var/log/zenzales-maintenance.log 2>&1
```

El worker no imprime payloads ni URLs secretas. No se envían leads al webhook durante el request público: la respuesta informa «guardada, envío pendiente». Cron debe usar el mismo entorno/claves que PHP web. Monitoriza envíos fallidos en el panel. Configura copias de seguridad de MySQL/MariaDB (en GoDaddy el servidor es MariaDB 10.11; las migraciones de `backend/mysql/migrations` deben funcionar en ambos) y una copia segura de `TOKEN_ENCRYPTION_KEY`.

## cPanel (Git Version Control)

Estructura: `~/public_html` = contenido de `backend/public`; `~/tinvana` = backend privado (`src`, `vendor`, `.env`, `storage`, etc.). `index.php` detecta `../tinvana` automáticamente.

1. En cPanel → *Select PHP Version*: PHP 8.2+ y extensiones `pdo_mysql`, `curl`, `mbstring`, `dom`, `gd` con WebP y `openssl`. Para seguir usando PostgreSQL, habilita `pdo_pgsql`. Activa SSL.
2. En el PC: `powershell -File scripts/package-vendor.ps1`. Sube `output/deploy/tinvana-vendor.zip` a `~/tinvana` y descomprímelo (queda `~/tinvana/vendor`). Repite solo si cambia `composer.lock`.
3. Crea `~/tinvana/.env` (permisos 600), elige `DB_DRIVER=mysql`, y configura `DB_HOST=localhost`, `DB_PORT=3306`, `DB_DATABASE`, `DB_USERNAME` y `DB_PASSWORD` con los datos de cPanel. Conserva la clave `TOKEN_ENCRYPTION_KEY` vigente y la configuración de correo; no copies secretos a Git.
4. cPanel → *Git™ Version Control* → Create: clonar `https://github.com/afceballos/tinvana.git` (rama `master`) → *Manage* → *Deploy HEAD Commit*. Ejecuta las tareas de `.cpanel.yml`. El árbol del servidor debe estar limpio.
5. Terminal/SSH: ejecuta `php ~/tinvana/bin/console.php check` y `php ~/tinvana/bin/console.php migrate`. En MySQL, `migrate` exige las tablas importadas y no vuelve a importar ni vaciar el esquema.
   **Sin Terminal, por cron.** El 2026-10-23 se probó ejecutar `migrate` dentro de `.cpanel.yml` y el despliegue se quedó cargando; se retiró ese paso. Causa probable, no confirmada: PHP CGI hereda el entorno de la petición web que lanza el despliegue y espera datos de entrada. No vuelvas a llamar a PHP desde `.cpanel.yml`. Usa una tarea de cron permanente cada minuto con `migrate:auto`. Compara los archivos de migración con la huella `~/tinvana/storage/migrations.stamp` y, si no cambiaron, termina sin conectarse a la base ni escribir nada. Cuando un despliegue trae una migración nueva, la aplica en el minuto siguiente y anota fecha y resultado en el log. Si falla, no guarda la huella y lo reintenta cada minuto, dejando el error en el log hasta que se corrija.

   ```cron
   * * * * * /usr/bin/php -q -d register_argc_argv=1 /home/USUARIO/tinvana/bin/console.php migrate:auto >> /home/USUARIO/migrate.log 2>&1
   ```

   `migrate` es seguro de repetir: usa un bloqueo, aplica solo los archivos nuevos de `backend/mysql/migrations` y se niega a continuar si un archivo ya aplicado cambió. No borra ni importa datos. Revisa `~/migrate.log`: solo tiene líneas cuando hubo cambios, y cada aplicación termina en «Esquema MySQL verificado». Para forzar una revisión, borra `migrations.stamp`.
6. Cron (cPanel → *Cron Jobs*): `php ~/tinvana/bin/console.php webhooks:work 20`, `whatsapp:work 50` y `mail:work` cada minuto; `maintenance` diario. `whatsapp:work` es el respaldo del procesamiento de mensajes de WhatsApp (el webhook ya procesa al recibir); usa la misma forma que `migrate:auto`: `/usr/bin/php -q -d register_argc_argv=1 /home/USUARIO/tinvana/bin/console.php whatsapp:work 50`.
7. Tras cambios de React: `npm run build`, commit de `backend/public/app` y *Deploy HEAD Commit* de nuevo.

## HTTPS en GoDaddy sin AutoSSL (Let's Encrypt con acme.sh por cron)

El hosting no ofrece AutoSSL ni Terminal. Se resolvió con tareas de cPanel → *Cron Jobs* que ejecutan `acme.sh` (validación HTTP por `public_html/.well-known/acme-challenge`, que el `.htaccess` deja pasar porque sirve los archivos existentes):

1. Tarea temporal: instalar `acme.sh`, `--issue -d tinbana.com -d www.tinbana.com -w ~/public_html --server letsencrypt --keylength 2048` y `--deploy --deploy-hook cpanel_uapi`, con la salida en un archivo de registro. Se borra tras ejecutarse; una segunda ejecución es inofensiva («Domains not changed»).
2. Si el despliegue automático falla, los archivos están en `~/.acme.sh/tinbana.com/` y se pegan en *SSL/TLS → Manage SSL sites* (CRT `tinbana.com.cer`, KEY `tinbana.com.key`, CABUNDLE `ca.cer`); en ese caso la renovación no se instalaría sola.
3. Renovación: `acme.sh` la programa y reinstala con el mismo `deploy-hook`. Comprueba que en *Current Cron Jobs* exista una línea `.acme.sh/acme.sh --cron`; si falta, créala una vez al día.
4. Después: *Domains → Force HTTPS Redirect*, `APP_URL=https://…` y `SESSION_SECURE=true`.

Let's Encrypt acorta la vida de sus certificados (de 90 a 64 días desde el 10 de febrero de 2027 y a 45 días en 2028); la renovación automática es imprescindible. Tras cada renovación, comprueba en *SSL/TLS Status* que cambió la fecha de vencimiento. Fuente: https://letsencrypt.org/2025/12/02/from-90-to-45.html

## Certificado comodín para los subdominios de tiendas

Cada usuario puede tener su tienda en `<nombre>.tinbana.com` y publicar allí sus landings (ver [STORE-SUBDOMAIN.md](STORE-SUBDOMAIN.md)). Sin migrar el DNS a otro proveedor, el comodín se valida por DNS delegando solo el desafío con un CNAME a `acme-dns`:

1. DNS: `A` `*` hacia la IP del hosting y, tras la primera ejecución, `CNAME` `_acme-challenge` hacia el nombre `<id>.auth.acme-dns.io` que escribe `acme.sh` en su registro. El servidor público de acme-dns solo puede responder ese desafío.
2. cPanel → *Domains*: crear `*.tinbana.com` con raíz `public_html`.
3. Cron de un solo uso: `acme.sh --issue --force --dnssleep 60 -d tinbana.com -d '*.tinbana.com' --dns dns_acmedns --server letsencrypt --keylength 2048 --home ~/.acme.sh`, con la salida en un archivo. Programarlo **una vez por hora** (no cada minuto: la validación dura más de un minuto y las ejecuciones se pisan) y borrarlo al terminar. Las ejecuciones con `--force` consumen el límite semanal de Let's Encrypt.
4. Instalación: otro cron de un solo uso con `acme.sh --deploy -d tinbana.com --deploy-hook cpanel_uapi --home ~/.acme.sh`. La renovación diaria (`acme.sh --cron`) reutiliza esos ajustes.
5. Resultado comprobado desde fuera: `tinbana.com`, `www` y subdominios arbitrarios (`prueba`, `otra`) sirven el certificado de Let's Encrypt que cubre `tinbana.com` y `*.tinbana.com`, con vencimiento el 20 de enero de 2027.
