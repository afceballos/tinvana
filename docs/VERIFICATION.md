# Verificación real

## Cierre de la etapa de pedidos (2026-10-19)

- `npm run build`: aprobado tras las funciones de edición, reapertura, ofertas y variantes.
- `npm test`: 107 comprobaciones aprobadas; `node tests/orders.mjs`: 38 aprobadas; `node tests/order-editing.mjs`: 52 aprobadas. Ejecutadas contra el PostgreSQL local aislado, no contra pedidos externos.
- PHP: sintaxis comprobada para Orders, ProductOffers, DropiOrders, Api y el enrutador público.
- Capturas de ofertas en escritorio y móvil revisadas. La demo temporal cargó `/panel/pedidos`, respondió `200` en la API autenticada y el dominio público devolvió `200` por HTTPS. La verificación fue solo de lectura y no creó ni modificó pedidos.
- Al terminar, se eliminaron los fixtures locales y se detuvieron el servidor de pruebas en 8081 y PostgreSQL local. La demo temporal en 8082 quedó activa.
- La integración de órdenes Dropi sigue en preparación: no se probó ni envió ninguna orden real.

## Carga y conversión de imágenes

Se encontró una URL de Dropi con espacios en el nombre del archivo que bloqueaba la creación de la landing. Se corrige al mapear nuevas imágenes y al generar la landing desde selecciones ya guardadas. El build pasó; 61 pruebas PHP y 82 comprobaciones HTTP aprobaron conversión WebP real y carga multipart con permisos, CSRF, preview firmada e imágenes públicas solo al publicar. Configuración y límites en [IMAGES.md](IMAGES.md).

## Webhooks por usuario y ambos precios

Actualización de presentación: build completado y 71 comprobaciones HTTP aprobadas tras incorporar tarjeta resaltada del webhook actual, identificación sin revelar su secreto, eliminación con CSRF y aislamiento del webhook de otro propietario. Cada usuario conserva una sola fila de configuración por su clave primaria.

Se aplicó `003_user_webhooks.sql` en Supabase y en PostgreSQL local. El build TypeScript/Vite pasó con la nueva sección `/panel/webhooks`. Pasaron 55 pruebas PHP y 68 comprobaciones HTTP aisladas: configuración por propietario, CSRF, rechazo de destinos privados, secretos ausentes de respuestas, pausa sin consumir intentos, precios obtenidos de las copias del backend pese a valores manipulados por el navegador, y reintentos 503/200 con identificador estable. El receptor TLS local utiliza un transporte de pruebas inyectado; no demuestra una entrega al webhook externo ni la resolución DNS del destino real. El precio inflado es el precio público del editor, confirmado por el usuario. No se configuró ni se envió a GHL real.

## Actualización de la conexión Supabase

Se guardaron los parámetros del Session pooler y la contraseña aportada en `backend/.env`, fuera de la raíz pública y excluido del repositorio. También se generó la clave local de cifrado sin imprimirla. Después de descargar la CA del panel de Supabase a `backend/storage/prod-ca-2021.crt` y configurar `DB_SSLROOTCERT`, la conexión PHP autenticó correctamente con `sslmode=verify-full`, manteniendo la verificación del certificado y del host. El comando `check` confirmó extensiones, conexión PostgreSQL y cifrado.

La revisión previa confirmó que no había tablas con los nombres de la plataforma. Se aplicaron `001_initial.sql` y `002_restrict_http_roles.sql` al PostgreSQL real de Supabase; la revisión posterior confirmó las siete tablas de negocio, `rate_limits`, `schema_migrations` y las dos versiones registradas. Se creó el administrador `andrescebvil@gmail.com` con la contraseña elegida por el usuario, guardando únicamente `password_hash` en PostgreSQL. Se verificaron su rol, `password_verify`, login PHP real, lectura del usuario autenticado y logout contra Supabase. La contraseña de login no se guardó en archivos del proyecto; los helpers temporales de instalación se retiraron.

`pg_stat_ssl` consultado a través del pooler informa sobre la conexión del pooler al servidor PostgreSQL, no sobre la conexión PHP al pooler. La verificación de esta última se basa en el éxito de PDO con `sslmode=verify-full` y la CA configurada.

Durante esta comprobación se corrigió el DSN PDO para delimitar los valores de libpq, incluidas rutas de certificados con espacios. La comprobación posterior superó el error de formato y alcanzó la negociación TLS con Supabase.

## Ejecutado en este equipo

- Frontend: TypeScript y build de Vite completados. Build entregado en `backend/public/app`, recursos bajo `/app/assets/`.
- Backend: PHP 8.4.26 portátil con cURL, PDO, pdo_pgsql, OpenSSL y mbstring. Todos los PHP propios pasaron `php -l`.
- PostgreSQL 17.11 local aislado, escuchando solo en `127.0.0.1:55432`, con credenciales aleatorias y base `zenzales_test`. Migraciones 001/002 aplicadas; repetir `migrate` no reaplica cambios.
- 33 pruebas PHP de mapeo, precios, stock conocido/desconocido, sanitización, parámetros de catálogo, cifrado autenticado, nonce, manipulación, contexto de propietario, validaciones y HTML específico de la landing.
- 57 comprobaciones HTTP contra sesiones PHP y PostgreSQL reales: login/logout, cookies HttpOnly/SameSite, regeneración, CSRF, límites de login, selección y unicidad, persistencia entre sesiones, permisos de usuarios, edición, preview firmada, publicación, sitemap, borradores 404, formularios, idempotencia e historial.
- Receptor HTTPS local con certificado efímero confiado explícitamente y verificación TLS activa: error HTTP 503, reintento 200, mismo lead/header de idempotencia, agotamiento de intentos y reintento manual. No se transmitieron leads a GHL.
- Constraints PostgreSQL: selección duplicada por integración/Dropi ID rechazada y asociación de producto a otro propietario rechazada por FK.
- Consulta de seguridad npm y Composer: sin vulnerabilidades conocidas en las dependencias finales al momento de comprobar.

Los fixtures están únicamente en `backend/tests` y `.tools`, no son fallback de la aplicación. Usuarios y productos de pruebas se retiran al finalizar. No se creó un administrador de producción ni una contraseña de acceso predefinida.

## Dropi: resultado real

**Actualización tras incorporar el proxy aportado:** el cliente compartido se ajustó a sus flags, HTTP/1.1, compresión, User-Agent y timeout. Se probó usando la integración ya guardada y cifrada del administrador, recuperada por propietario desde Supabase. Dropi devolvió `isSuccess:true` y 40 objetos en la consulta `pageSize=50`; la API mostró los primeros 32. No se sustituyó ni se imprimió el token existente.

Se verificaron mediante login HTTP real del administrador: listado de integraciones sin token, prueba de conexión, consultas del catálogo con los cuatro órdenes de la interfaz, segunda página y categorías (30 categorías). Las consultas del panel devolvieron 32 productos por página y no incluyeron campos secretos. La sesión de verificación se cerró al finalizar. Estos checks acreditan respuestas reales de esos endpoints; no equivalen a una validación exhaustiva de la semántica de búsqueda u orden de todos los productos.

Las pruebas PHP actuales son 42, incluyendo los flags de compatibilidad, validación del payload y eliminación recursiva de secretos. Las 57 pruebas aisladas de permisos/publicación/leads se ejecutaron en la etapa anterior, no sobre datos reales de Supabase.

### Prueba inicial antes de los ajustes

Se leyó el token desde el archivo privado existente, sin imprimirlo ni copiarlo al frontend. Se cifró/descifró en memoria y se usó el cliente PHP de la nueva plataforma para llamar a `https://api.dropi.co/integrations/products/index` con `pageSize=50`, desplazamiento 0, orden ID ascendente y verificación TLS. **Resultado desde este equipo: HTTP 401, “Access denied”.** La ejecución dentro del sandbox fue bloqueada por red; el 401 se recibió después de permitir la conexión externa.

La prueba inicial no confirmó una respuesta exitosa. Con los ajustes aportados, la prueba local actual sí devolvió productos y categorías reales desde la integración guardada. No se usó el proxy antiguo como intermediario. Los cambios se verificaron en conjunto; no se aisló experimentalmente cuál de ellos resolvió el 401. Repite la prueba desde el hosting final, porque su red/IP y configuración pueden cambiar el resultado.

La revisión del catálogo reutilizó su mapeo y diseño. El README antiguo describe configuraciones anteriores; durante la revisión también se encontró el archivo PHP privado con `DROPI_INTEGRATION_KEY`. Ese archivo y todo el catálogo de referencia permanecen sin modificaciones.

## Pendiente de acceso/configuración

- Supabase real: conexión PostgreSQL, certificado y migraciones ya comprobados. Quedan pruebas funcionales con el administrador y sus datos reales; los fixtures no se insertan en Supabase. La URL/clave publicable del SDK no se usa como credencial PostgreSQL.
- Administrador `andrescebvil@gmail.com`: creado; login y logout PHP verificados contra Supabase. Queda la comprobación interactiva en navegador.
- GHL externo: webhook privado, mapping del workflow, deduplicación y creación de contactos/oportunidades.
- Hosting: versión/extensiones PHP web, salida PostgreSQL, DNS/HTTPS, raíz pública, permisos, Apache/Nginx y cron.
- Revisión visual en navegador y dispositivos: no había navegador conectado disponible en esta sesión. Se verificó el build y la entrega HTTP de SPA/recursos; no se afirma una prueba visual interactiva.
- Prueba de exportación/restauración del proyecto Supabase: instrucciones incluidas, no ejecutada sin conexión de origen/destino.

No se publicó ningún dominio ni se desplegó encima del catálogo existente.

## Repetir pruebas

### Ejecutor de suites (Windows, 2026-10-27)

`tests/run-suites.ps1` corre suites de `tests/*.mjs` una por una contra la base local `zenzales_test`: antes de cada suite limpia y crea fixtures y ejecuta `npm test` (que siembra productos y pedidos de la cuenta secundaria). Apunta Dropi (8443–8445), Meta Graph (8446) y OpenAI (8447) a simuladores locales y levanta PHP en 8081.

```powershell
& .	estsun-suites.ps1 -Label prueba -Only whatsapp-templates,whatsapp-inbox,orders
& .	estsun-suites.ps1 -Label ia -Only ai-http -Ai   # -Ai levanta el router de IA en 8083
```

- Requisitos: PostgreSQL local en 127.0.0.1:55432 (`.tools/pg/pgsql/bin/pg_ctl.exe -D .tools/pg-data -o "-p 55432 -h 127.0.0.1" start`), `.tools/test-env.json` y `npm run build`.
- `ai-ui.mjs` necesita la clave de IA que deja `ai-http.mjs`: ejecútalas seguidas sobre los mismos fixtures (sin recrearlos entre ambas) y con `backend/tests/ai-reset.php all` entre ellas.
- `errors-session.mjs` necesita `SESSION_LIFETIME=8` y `account-access` el router de cuentas en 8084.
- Si hay una demo local usando 8081/8446 o el mismo número de prueba de WhatsApp, deténla y borra sus filas de WhatsApp antes; si no, las pruebas de WhatsApp fallan al conectar el número.
- `modern.mjs` y `ai-ui.mjs` en el ejecutor (fixtures nuevos) ya fallaban antes de los cambios de octubre; no son regresiones.
- MariaDB local (MySQL de producción): servidor en 127.0.0.1:33307, base `tinvana_test`, con `DB_DRIVER=mysql` y `php -d extension=pdo_mysql backend/bin/console.php migrate`. Detenerlo con `mariadb-admin -P 33307 -u root shutdown` y dejar 0 usuarios de prueba.

Pruebas puras:

```sh
php backend/tests/run.php
```

Para pruebas HTTP usa exclusivamente un PostgreSQL local dedicado llamado `zenzales_test`, nunca producción. Crea `.tools/test-env.json` con configuración de prueba, por ejemplo:

```json
{
  "APP_ENV": "local",
  "APP_URL": "http://127.0.0.1:8080",
  "DB_HOST": "127.0.0.1",
  "DB_PORT": "55432",
  "DB_DATABASE": "zenzales_test",
  "DB_USERNAME": "postgres",
  "DB_PASSWORD": "contraseña-aleatoria-local",
  "DB_SSLMODE": "disable",
  "TOKEN_ENCRYPTION_KEY": "clave-base64-generada-para-pruebas",
  "SESSION_SECURE": "false",
  "SESSION_SAMESITE": "Lax",
  "GHL_WEBHOOK_URL": ""
}
```

Es un ejemplo con marcadores; no es una cuenta instalada. Genera los secretos localmente. La contraseña y clave no se imprimen en las pruebas. Ejecuta migraciones y servidor PHP con esas mismas variables en su entorno. `backend/tests/fixtures.php` y el worker de pruebas cargan el JSON explícitamente y rechazan bases no locales/de prueba. No apuntes `backend/.env` a la base de producción mientras pruebas.

```sh
# Con el entorno de pruebas exportado a este proceso:
php backend/bin/console.php migrate
npm run build
php backend/tests/fixtures.php
# En otra terminal, con las mismas variables:
php -S 127.0.0.1:8080 -t backend/public backend/router.php
# Con el servidor en marcha:
npm test
php backend/tests/fixtures.php cleanup
```

`npm test` usa Node y ejecuta procesos PHP. Define `PHP_BINARY` si PHP no está en PATH; en este equipo detecta el PHP portátil. Los puertos 8080 y 9443 deben estar libres; 9443 sirve solamente el receptor HTTPS de pruebas y se cierra al terminar. El cache de página Dropi se introduce exclusivamente desde un helper CLI de pruebas para verificar el guardado desde la copia del servidor sin depender de Dropi externo. El comportamiento exitoso de la API externa no queda probado por esos fixtures.

Al repetir una suite que usa los mismos fixtures, ejecuta primero `fixtures.php cleanup` y vuelve a crear fixtures, para limpiar los límites de intentos y el historial. El cleanup solo actúa en la base local de prueba verificada. Detén el servidor PHP y PostgreSQL al terminar si no los necesitas.
