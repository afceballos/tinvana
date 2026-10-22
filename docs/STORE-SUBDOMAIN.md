# Tienda con subdominio propio (un subdominio por usuario)

Cada usuario es una tienda. Puede elegir, de forma **opcional**, un nombre de tienda; sus landings publicadas quedan entonces en `https://<tienda>.tinbana.com/p/<slug>`. Sin nombre, siguen en `https://tinbana.com/p/<slug>`. El ajuste está en **Perfil → Tu tienda** (primer bloque de la página, con su propio botón de guardado, independiente de los datos personales).

El enlace `tinbana.com/p/<slug>` sigue funcionando aunque la tienda tenga subdominio. La dirección de la tienda es la canónica: se usa en la propia página, en el `landing_url` de las consultas, en el mapa del sitio, en «Mis productos» y en el enlace «La página publicada» del constructor.

## Reglas del nombre

- De 3 a 40 caracteres: minúsculas `a-z`, números y guiones; sin espacios, acentos ni otros símbolos; sin empezar ni terminar en guion y sin guiones dobles (`--`, reservado por los nombres internacionalizados `xn--`).
- La interfaz limpia lo que se escribe (minúsculas, sin acentos, espacios a guion). El servidor valida otra vez (`Store::validate`) y la base lo exige con una restricción `CHECK`.
- Nombres reservados que no se pueden elegir: `www`, `mail`, `smtp`, `imap`, `pop`, `ftp`, `cpanel`, `webmail`, `webdisk`, `whm`, `api`, `app`, `admin`, `panel`, `login`, `media`, `p`, `tinvana`, `tinbana`, entre otros (`Store::RESERVED`).
- Único en todo el sistema: se comprueba al guardar (HTTP 409 «Ese subdominio ya está en uso») y lo garantiza un índice único en `users.store_subdomain`.
- **Cambiar el nombre cierra el anterior de inmediato** (la tienda se resuelve por consulta, no por copia publicada), y su nombre queda libre para otros. La pantalla lo advierte. Dejarlo vacío devuelve las landings al enlace normal. Es un enlace público: avisa antes a quien lo tenga compartido.

## Datos, API y router

- Migración `014_store_subdomain.sql` (PostgreSQL) y `backend/mysql/migrations/014_store_subdomain.sql` (MySQL): columna `users.store_subdomain`, índice único y restricción de formato.
- `GET /api/profile` incluye `store: {subdomain, base, url}`; `PUT /api/profile/store` acepta solo `{subdomain}` (cadena, o `null`/vacío para quitarlo). `GET /api/products` y `GET/PUT /api/landings/{id}` devuelven `public_url`.
- Router (`backend/public/index.php`): si `HTTP_HOST` es `<nombre>.<host de APP_URL>`: el nombre debe ser una tienda existente (si no, 404 en cualquier ruta, incluidos `/` y los subdominios anidados); `/p/<slug>` y `/p/<slug>/lead` solo sirven landings **publicadas de esa tienda** (la de otro usuario, o sin publicar, da 404); la raíz `/` de una tienda responde 404 porque aún no hay página de inicio de tienda; el resto de rutas (medios, geografía, recursos) sigue igual. Los nombres reservados (`www`, `mail`…) siguen a la app.
- `Store::base()` devuelve `null` si `APP_URL` es una IP o `localhost`: la tarjeta lo explica, no permite fijar nombre y todas las direcciones usan `/p/<slug>`.
- Las columnas `landing_pages.subdomain` y `published_subdomain` (migración 013) quedaron sin uso tras decidir que el subdominio es del usuario y no del producto. Siguen en el esquema para no modificar una migración ya publicada; se pueden retirar con una migración posterior.

## Infraestructura necesaria (GoDaddy/cPanel)

1. DNS: registro `A` con nombre `*` hacia la IP del hosting.
2. cPanel → *Domains*: dominio `*.tinbana.com` con raíz del documento `public_html`.
3. Certificado comodín (`tinbana.com` y `*.tinbana.com`) emitido con `acme.sh --dns dns_acmedns` y desplegado con `cpanel_uapi`; ver [DEPLOYMENT.md](DEPLOYMENT.md#certificado-comodín-para-los-subdominios-de-tiendas).
4. Aplicar las migraciones: `php bin/console.php migrate` (en el hosting, con un cron de un solo uso: ver [DEPLOYMENT.md](DEPLOYMENT.md#cron)).

## Verificación

- `backend/tests/store-subdomain.php` (50 comprobaciones): validación, reservados, dominio base, URLs, unicidad en aplicación y base, guardado y borrado, rechazo de otros campos, URL de landings y de consultas, sin dominio público. Solo PostgreSQL local aislado.
- `tests/store-router.mjs` (20 comprobaciones): servidor PHP local con `APP_URL` de prueba y cabecera `Host`; aislamiento entre tiendas, tienda inexistente, subdominios anidados, ruta `/lead`, dominio principal, `www` y reservados, mapa del sitio, despublicar y quitar el nombre.
- `tests/store-address.mjs` (20 comprobaciones, API simulada): tarjeta del perfil, limpieza de lo escrito, avisos, guardado, nombre ocupado, quitar el subdominio, sin dominio público, tema oscuro y móvil.
- **No comprobado:** la migración MySQL (no hay MySQL local; es una sola sentencia `ALTER TABLE`), el comodín DNS/SSL con una tienda real y la entrega por subdominio en tinbana.com.
