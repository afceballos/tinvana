# Migrar entre servidores PostgreSQL

El esquema usa SQL PostgreSQL estándar: UUID generados en PHP, JSONB, claves foráneas, índices y timestamps. No requiere APIs de Supabase. Conserva la versión de migraciones aplicada y la clave de cifrado.

1. Prepara el destino PostgreSQL con versión compatible (idealmente igual o superior a la original), TLS y un usuario con permisos. Guarda backups y registra conteos de las tablas de negocio, incluidas `webhook_settings`, `schema_migrations` y `rate_limits`.
2. Para el corte final detén nuevas escrituras y pausa cron. Exporta con un `pg_dump` compatible con la versión del origen. Usa un archivo `.pgpass` privado o una solicitud interactiva; no escribas contraseñas dentro de URLs, argumentos o documentación.

```sh
pg_dump --host=HOST_ORIGEN --port=5432 --username=USUARIO_ORIGEN --dbname=BASE_ORIGEN --format=custom --no-owner --no-acl --file=zenzales.dump
```

Para el Supabase pooler utiliza sus datos reales. También puedes usar conexión directa cuando tu red permita IPv6. Exporta desde una base dedicada a esta aplicación o delimita las tablas de aplicación si hay otras cargas; no migres esquemas internos de Supabase innecesariamente.

3. Restaura en una base vacía del nuevo servidor:

```sh
pg_restore --host=HOST_DESTINO --port=5432 --username=USUARIO_DESTINO --dbname=BASE_DESTINO --no-owner --no-acl --exit-on-error zenzales.dump
```

No uses `--clean` contra una base con otros datos. Si haces una prueba de restauración, utiliza una base nueva y aislada.

4. Cambia `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SSLMODE` y `DB_SSLROOTCERT` en el entorno PHP. Mantén exactamente la misma `TOKEN_ENCRYPTION_KEY`; PostgreSQL no contiene esa clave. Conserva `APP_URL` si el dominio no cambia, y el webhook privado. No regeneres la clave de tokens.
5. Ejecuta `check` y `migrate`; las migraciones ya aplicadas deben conservar checksums. Verifica conteos y relaciones, usuarios, lectura/descifrado de integraciones, prueba Dropi, selección, edición comercial, publicación, sitemap, leads y worker. Confirma en GHL que no se duplicaron oportunidades al retomar entregas pendientes.
6. Solo después de validar, cambia tráfico y reactiva cron en un único entorno. Retén el proveedor anterior y su backup durante un periodo de observación. No dejes dos cron activos enviando la misma cola copiada. Retira el proveedor anterior cuando la verificación y tus políticas de retención lo permitan.

## Usar MySQL en cPanel/GoDaddy

La aplicación cuenta con un driver PDO MySQL y un esquema independiente. PostgreSQL y MySQL no comparten un dump: no importes un `pg_dump` desde phpMyAdmin. El SQL inicial está en `backend/mysql/schema.sql` y requiere MySQL 8.0.16 o superior; antes de desplegar, confirma la versión exacta que ofrece el hosting. Las tablas deben crearse/importarse en la base MySQL del hosting, desde phpMyAdmin, una sola vez y en una base vacía. No ejecutes el esquema inicial sobre tablas que ya contienen información.

1. Haz una copia de seguridad de la base y confirma que contiene las 18 tablas del esquema Tinvana. El usuario de base debe tener acceso solo a esa base. Configura en el `.env` privado del backend `DB_DRIVER=mysql`, `DB_HOST`, `DB_PORT` (normalmente `3306`), `DB_DATABASE`, `DB_USERNAME` y `DB_PASSWORD` usando los valores que muestra cPanel; `localhost` solo es válido desde PHP que corre en ese mismo hosting.
2. Instala dependencias PHP con `composer install --no-dev --optimize-autoloader`; comprueba que la versión de PHP web y CLI tenga `pdo_mysql` habilitado. No subas credenciales a Git ni uses la contraseña de la base en el archivo SQL.
3. Desde el terminal de cPanel, ejecuta `php ~/tinvana/bin/console.php check` y después `php ~/tinvana/bin/console.php migrate`. El segundo comando verifica la existencia de las 18 tablas y registra el checksum del esquema base; no importa, recrea ni elimina tablas. Si detecta diferencias, detente y revisa el respaldo y el esquema antes de hacer cambios.
4. Revisa los conteos de filas y claves foráneas en phpMyAdmin. Comprueba login, aislamiento entre usuarios, catálogo, selección, creación/edición/publicación de landing, carga de archivos, formulario, cola de webhook, pedidos, ofertas y recuperación de cuenta. Usa una cuenta de prueba y datos controlados; no vuelvas a enviar una orden o webhook externo cuando el resultado anterior sea incierto.
5. Mantén intacta `TOKEN_ENCRYPTION_KEY` al conservar datos cifrados. Esta clave no se recupera desde MySQL. Si la base MySQL está vacía, crea el administrador con el comando interactivo `php ~/tinvana/bin/console.php admin:create correo@dominio`; el comando solicita la contraseña sin incluirla en el repositorio.

La conversión está preparada en código, pero requiere comprobar el servidor MySQL/MariaDB concreto y todos los flujos antes de considerarla completa. No es una migración automática entre motores: JSON, fechas, SQL, índices y concurrencia tienen implementaciones específicas y necesitan pruebas en el servidor destino.

Las imágenes propias también requieren copiar `backend/storage/media` al nuevo servidor, además de la tabla `media_assets` incluida en el dump. Conserva los UUID y permisos. Verifica imágenes privadas, previews y publicadas antes de retirar el servidor anterior. Si cambia el dominio, revisa las URLs propias según [IMAGES.md](IMAGES.md).

Las claves de OpenAI y Claude también se exportan cifradas en `ai_connections`. Conserva exactamente la misma `TOKEN_ENCRYPTION_KEY`, comprueba que cada usuario vea únicamente sus proveedores y prueba las conexiones antes de retirar el servidor anterior. No es necesario volver a introducir las claves si se conservaron la tabla y la clave maestra.

## Pruebas con MariaDB local (2026-10-23)

Producción usa MariaDB 10.11.19. Para reproducir sus errores hay un MariaDB 10.11.19 oficial (checksum verificado) en `.tools/mariadb`, con datos en `.tools/mariadb-data`. Escucha solo en `127.0.0.1:33306`, con contraseña aleatoria en `.tools/mariadb-password.txt` y base `tinvana_test`; todo está excluido de Git. El PHP local carga `pdo_mysql` desde `.tools/php/php.ini`. Para usarlo:

1. Arranca `mariadbd` con `--datadir` entre comillas, porque la ruta tiene espacios.
2. Copia `.tools/test-env.json` a `test-env.pgsql.json` y escribe en `test-env.json` la versión MySQL (`DB_DRIVER=mysql`, puerto 33306).
3. Importa `backend/mysql/schema.sql` y ejecuta `migrate`.
4. Al terminar, restaura la copia de PostgreSQL.

`fixtures.php cleanup` depende del orden de borrado de PostgreSQL: en MariaDB es más simple recrear la base. La suite general `tests/http.mjs` se detiene en `backend/tests/cache.php`, escrito para PostgreSQL.

Errores encontrados y corregidos con esta base:

- **Cotizar, aceptar, corregir, reabrir, cancelar y enviar a Dropi fallaban con «MySQL no está disponible» (`HY093`).** La emulación de `UPDATE … RETURNING` releía la fila pasando todos los parámetros del UPDATE. Ahora pasa solo los del `WHERE` (`MySqlDialect::returning`).
- **Cotizar con una oferta con fecha de fin fallaba (`22007`).** MariaDB no acepta fechas ISO con `Z`. `Database::timestamp()` formatea según el motor.
- **Todas las fechas se mostraban 5 horas corridas en el panel.** `DATETIME` se devolvía sin zona y el navegador lo leía como hora local. `Database` ahora devuelve en MySQL/MariaDB las columnas `DATETIME`/`TIMESTAMP` en ISO UTC (`…Z`), como PostgreSQL.

Verificado en MariaDB: `order-editing.mjs` 52, `dropi-orders.mjs` 36, `compact.mjs` 27, `modern.mjs` 17 y `lead-success.mjs` 12. Las migraciones 013, 014 y 015 se aplicaron sobre el esquema importado.
