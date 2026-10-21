# Tinvana

**Para retomar el proyecto:** leer [el documento maestro de contexto y checklist](docs/CONTEXTO-PROYECTO.md). Incluye funcionalidades, arquitectura, estado de pruebas, dependencias y la fase independiente de pedidos/WhatsApp. Las instrucciones para mantenerlo actualizado están en [AGENTS.md](AGENTS.md).



Proyecto separado del catálogo de referencia. React + TypeScript + Vite + Tailwind CSS + React Router en el panel; PHP 8.2+ en la API, autenticación y HTML público; PostgreSQL estándar mediante PDO. No usa Supabase JS, Auth, Storage ni Edge Functions. No contiene productos de demostración ni login simulado. Los fixtures existen exclusivamente en las pruebas aisladas.



## Primeros pasos



El editor permite subir imágenes con conversión WebP en PHP. Límites, permisos y requisitos GD: [Imágenes](docs/IMAGES.md).



1. Instala Node.js 22+, PHP 8.2+ con `curl`, `pdo`, `pdo_pgsql`, `openssl`, `mbstring`, y Composer.

2. Ejecuta `npm ci` en la raíz y `composer install --working-dir=backend`.

3. Copia `backend/.env.example` a `backend/.env`. Guarda ahí la conexión PostgreSQL y `APP_URL`. Configura el webhook privado en `/panel/webhooks` después del login; queda cifrado por usuario. No uses variables `VITE_` para secretos.

4. Ejecuta `php backend/bin/console.php key:generate` y guarda la salida en `TOKEN_ENCRYPTION_KEY`. Guarda una copia de la clave fuera de la base de datos. Este comando imprime una clave nueva: ejecútalo en una terminal privada.

5. Ejecuta `php backend/bin/console.php check` y después `php backend/bin/console.php migrate`.

6. En una instalación nueva, crea el administrador con `php backend/bin/console.php admin:create andrescebvil@gmail.com`. La contraseña se solicita de forma oculta en la terminal; no se acepta en argumentos ni existe contraseña predeterminada. En el Supabase configurado para este proyecto, el administrador ya está creado y su login PHP fue verificado.

7. Ejecuta `npm run build`.

8. Inicia `php -S 127.0.0.1:8080 -t backend/public backend/router.php` y abre `http://127.0.0.1:8080`. El servidor de PHP integrado es solo para desarrollo.



Para trabajar con recarga automática, deja PHP en 8080 y ejecuta `npm run dev`. Vite redirige API, landings, previsualización y recursos públicos a PHP. El despliegue final usa el build y un solo dominio.



En este equipo hay PHP 8.4 portátil en `.tools/php/php.exe` y Composer en `.tools/composer.phar`, ambos descargados de fuentes oficiales. Puedes sustituir `php` por `& .tools/php/php.exe` en PowerShell y ejecutar `& .tools/php/php.exe .tools/composer.phar install --working-dir=backend`. `.tools/` está excluido del repositorio y del despliegue. XAMPP instalado usa PHP 7.4: no sirve para este backend.



## Guías



- [Instalación, Supabase y secretos](docs/INSTALLATION.md).

- [Apache, Nginx y comprobaciones de hosting](docs/DEPLOYMENT.md).

- [Workflow y entregas a GoHighLevel](docs/GHL.md).

- [Migración a otro PostgreSQL](docs/MIGRATION.md).

- [API y decisiones de seguridad](docs/ARCHITECTURE.md).

- [Pruebas y estado real de verificación](docs/VERIFICATION.md).

- [Generación y regeneración de landings con IA](docs/AI-LANDINGS.md).

- [Formulario, teléfono y dirección de entrega](docs/LEAD-FORM.md).



## Flujo de trabajo



Guarda la integración en el panel y prueba su conexión. Busca y selecciona productos del catálogo. En «Mis productos», crea la landing, edita el contenido comercial y su precio público, guarda y abre la vista privada. Publica cuando esté lista. La misma plantilla PHP sirve todas las rutas `/p/{slug}`. Los borradores devuelven 404 públicamente y no se incluyen en el sitemap.



Las consultas se guardan de forma transaccional junto con su entrega pendiente. Un cron procesa el webhook. «Webhook aceptado» significa que GHL devolvió HTTP 2xx; confirma en GHL la creación de contactos y oportunidades. No se promete entrega exactamente una vez a un servicio externo: configura deduplicación con `lead_id` en el workflow.

# Perfil de cuenta



Consulta [Perfil y seguridad](docs/PROFILE.md) para el menú de cuenta, los datos privados del perfil, las fotos y el cambio de contraseña.



Consulta [Registro y correos de cuenta](docs/ACCOUNT-EMAIL.md) para configurar verificaci?n y recuperaci?n mediante SMTP o Resend.


[Selectores de ubicación y fuentes geográficas](docs/GEOGRAPHY.md): perfil mundial, landings de Colombia, búsqueda y licencias.

## Pedidos y condiciones comerciales

- [Pedidos, correcciones y revisión](docs/ORDERS.md).
- [Ofertas por cantidad y variantes](docs/PRODUCT-OFFERS.md).
- [Preparación de órdenes Dropi y dependencias](docs/DROPI-ORDERS.md).
