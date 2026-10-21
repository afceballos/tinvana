# Migrar a otro PostgreSQL

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

Esto no es una migración automática a MySQL. Cambiar de motor requiere adaptar JSONB, SQL, índices, constraints, PDO y pruebas.

Las imágenes propias también requieren copiar `backend/storage/media` al nuevo servidor, además de la tabla `media_assets` incluida en el dump. Conserva los UUID y permisos. Verifica imágenes privadas, previews y publicadas antes de retirar el servidor anterior. Si cambia el dominio, revisa las URLs propias según [IMAGES.md](IMAGES.md).

Las claves de OpenAI y Claude también se exportan cifradas en `ai_connections`. Conserva exactamente la misma `TOKEN_ENCRYPTION_KEY`, comprueba que cada usuario vea únicamente sus proveedores y prueba las conexiones antes de retirar el servidor anterior. No es necesario volver a introducir las claves si se conservaron la tabla y la clave maestra.
