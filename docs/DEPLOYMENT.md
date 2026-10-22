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

```cron
* * * * * cd /srv/zenzales && /usr/bin/php backend/bin/console.php webhooks:work 20 >> /var/log/zenzales-webhooks.log 2>&1
17 3 * * * cd /srv/zenzales && /usr/bin/php backend/bin/console.php maintenance >> /var/log/zenzales-maintenance.log 2>&1
```

El worker no imprime payloads ni URLs secretas. No se envían leads al webhook durante el request público: la respuesta informa «guardada, envío pendiente». Cron debe usar el mismo entorno/claves que PHP web. Monitoriza envíos fallidos en el panel. Configura copias de seguridad de MySQL/MariaDB y una copia segura de `TOKEN_ENCRYPTION_KEY`.

## cPanel (Git Version Control)

Estructura: `~/public_html` = contenido de `backend/public`; `~/tinvana` = backend privado (`src`, `vendor`, `.env`, `storage`, etc.). `index.php` detecta `../tinvana` automáticamente.

1. En cPanel → *Select PHP Version*: PHP 8.2+ y extensiones `pdo_mysql`, `curl`, `mbstring`, `dom`, `gd` con WebP y `openssl`. Para seguir usando PostgreSQL, habilita `pdo_pgsql`. Activa SSL.
2. En el PC: `powershell -File scripts/package-vendor.ps1`. Sube `output/deploy/tinvana-vendor.zip` a `~/tinvana` y descomprímelo (queda `~/tinvana/vendor`). Repite solo si cambia `composer.lock`.
3. Crea `~/tinvana/.env` (permisos 600), elige `DB_DRIVER=mysql`, y configura `DB_HOST=localhost`, `DB_PORT=3306`, `DB_DATABASE`, `DB_USERNAME` y `DB_PASSWORD` con los datos de cPanel. Conserva la clave `TOKEN_ENCRYPTION_KEY` vigente y la configuración de correo; no copies secretos a Git.
4. cPanel → *Git™ Version Control* → Create: clonar `https://github.com/afceballos/tinvana.git` (rama `master`) → *Manage* → *Deploy HEAD Commit*. Ejecuta las tareas de `.cpanel.yml`. El árbol del servidor debe estar limpio.
5. Terminal/SSH: ejecuta `php ~/tinvana/bin/console.php check` y `php ~/tinvana/bin/console.php migrate`. En MySQL, `migrate` exige las tablas importadas y no vuelve a importar ni vaciar el esquema.
6. Cron (cPanel → *Cron Jobs*): `php ~/tinvana/bin/console.php webhooks:work 20` y `mail:work` cada minuto; `maintenance` diario.
7. Tras cambios de React: `npm run build`, commit de `backend/public/app` y *Deploy HEAD Commit* de nuevo.
