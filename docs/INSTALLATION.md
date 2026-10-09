# Instalación y Supabase PostgreSQL

## PostgreSQL

Supabase se usa únicamente como proveedor de PostgreSQL. En el proyecto abre **Connect → Session pooler** y copia sus datos al archivo privado `backend/.env`. El pooler en modo sesión permite conexiones desde hosting con IPv4. Usa el host y el usuario completos que muestra Supabase; el usuario del pooler puede contener el identificador de proyecto. No inventes esos valores ni uses la URL HTTP de Supabase como host PostgreSQL.

Referencia oficial: [Conexión PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

```dotenv
APP_ENV=production
APP_URL=https://tu-dominio.example
DB_HOST=host-indicado-en-connect
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=usuario-indicado-en-connect
DB_PASSWORD=contraseña-privada
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/ruta/privada/certificado-ca.pem
TOKEN_ENCRYPTION_KEY=clave-generada-por-el-comando
SESSION_SECURE=true
SESSION_SAMESITE=Lax
GHL_WEBHOOK_URL=
```

Los valores de este ejemplo son marcadores, no credenciales funcionales. Descarga el certificado CA de tu proveedor cuando corresponda; libpq debe poder verificar su cadena y el nombre del host. Si tu hosting no permite conexión saliente PostgreSQL, detén el despliegue y repórtalo. No cambies a MySQL ni conectes React directamente a la base de datos. `HTTP_CA_BUNDLE` permite indicar un bundle CA para cURL si el PHP del hosting no tiene uno configurado; es distinto del certificado de PostgreSQL. La verificación TLS permanece activa.

La clave publicable y la URL HTTP proporcionadas durante la conversación no son usuario/contraseña PostgreSQL. No se incorporaron al código. No es necesario instalar `@supabase/supabase-js` ni componentes de Supabase Auth.

Configura el webhook desde `/panel/webhooks` después de iniciar sesión. La URL se cifra en PostgreSQL para ese usuario. `GHL_WEBHOOK_URL` es solo una fuente opcional para importar con `php backend/bin/console.php webhook:import email@dominio.com`; no hay destino global compartido.

En PostgreSQL local sin TLS puedes usar `DB_SSLMODE=disable` exclusivamente para desarrollo en localhost. Producción requiere TLS. Para el hosting usa un rol de aplicación con permisos sobre las tablas requeridas; un rol de instalación puede ejecutar las migraciones. Las migraciones 002/003 revocan los permisos de PUBLIC y de `anon`, `authenticated` y `service_role` cuando esos roles existen. No concedas acceso a estas tablas a roles HTTP de Supabase; la API del producto es PHP. Si habilitas APIs de Supabase para otros proyectos, revisa sus grants y defaults antes de agregar futuras tablas.

## Migraciones y administrador

```sh
composer install --working-dir=backend
php backend/bin/console.php check
php backend/bin/console.php migrate
php backend/bin/console.php admin:create andrescebvil@gmail.com
```

Las migraciones se ejecutan en orden, cada archivo dentro de una transacción. `schema_migrations` registra nombre y checksum; un advisory lock evita dos instalaciones simultáneas. No edites una migración ya aplicada: agrega una nueva versión. El comando de administrador solicita email si no lo pasas y pide contraseña oculta de 12 a 72 bytes, para evitar truncamiento de bcrypt. Solo genera usuarios reales con `password_hash`; no contiene semillas ni contraseñas de acceso.

## Importar un token existente

Opcionalmente define `LEGACY_CONFIG_PATH` con una ruta privada fuera de `backend/public` y ejecuta:

```sh
php backend/bin/console.php integration:import andrescebvil@gmail.com
```

El importador reconoce un token literal de JavaScript con clave `dropiToken`, `dropiIntegrationKey`, `integrationKey` o `token`, o un array PHP con clave `DROPI_INTEGRATION_KEY`/`dropi_token`. Lee el archivo sin ejecutarlo y guarda el token cifrado; no lo imprime. En este equipo se encontró la configuración privada en `C:/Users/andre/Desktop/Proyectos/Dropi - GHL/php-catalogo/private/config.local.php`; puedes usarla en `LEGACY_CONFIG_PATH` una vez creado el administrador. Si el archivo actual solo apunta al proxy o no contiene un token reconocido, el comando lo informa y no inventa uno. En ese caso guarda el token desde el panel. No copies la configuración antigua al directorio público.

## Verificar Dropi

Usa «Probar conexión» de la integración. PHP descifra el token perteneciente al usuario y llama directamente a los destinos fijos de Dropi. Una respuesta del proxy antiguo no acredita esta conexión: puede usar otro token o IP.

Si Dropi devuelve 401, el panel muestra `Dropi devolvió HTTP 401` y el mensaje JSON de Dropi cuando existe, sin el token. La API devuelve 502 con `upstream_status: 401`, para distinguir el fallo externo de una sesión PHP vencida. No hay fallback de productos inventados. Revisa la vigencia y permisos del token, las restricciones de IP y el acceso desde el hosting.

## Secretos

Tokens: AES-256-GCM con nonce aleatorio de 12 bytes, tag de autenticación de 16 bytes y contexto ligado al ID de integración y usuario. La clave tiene 32 bytes codificados en base64 y permanece fuera de PostgreSQL. Conservarla es indispensable para migrar. Cambiarla sin recifrar los tokens rompe la lectura; no la regeneres después de instalar.

Contraseñas: `password_hash`/`password_verify`. Cookies: HttpOnly, SameSite Lax por defecto, Secure en producción y sesiones con strict mode. La sesión se regenera al login y caduca por inactividad. Mantén frontend y API en el mismo origen para usar esta configuración sin CORS.

El archivo `.env`, certificados privados y `storage/` están fuera de la raíz pública. No imprimas secretos en registros, diagnósticos o comandos compartidos.
