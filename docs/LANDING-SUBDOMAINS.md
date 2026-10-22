# Enlace de cada landing: normal o subdominio propio

Cada landing se publica en uno de estos dos tipos de enlace, a elección del usuario en el constructor (*Producto y página → Enlace público de la landing*):

- **Enlace normal:** `https://tinbana.com/p/<slug>` (comportamiento anterior, sigue siendo el predeterminado).
- **Subdominio propio:** `https://<nombre>.tinbana.com`, con el nombre que elija el usuario.

El enlace normal sigue respondiendo aunque la landing tenga subdominio; el subdominio es una dirección adicional y es la que la app muestra y envía como canónica, en consultas (`landing_url`), mapa del sitio y enlaces de «Mis productos».

## Reglas del nombre

- De 3 a 40 caracteres: minúsculas `a-z`, números y guiones; sin espacios, acentos ni otros símbolos; sin empezar ni terminar en guion y sin guiones dobles (`--`, reservado por los nombres internacionalizados `xn--`).
- La interfaz limpia lo que se escribe (minúsculas, sin acentos, espacios a guion). El servidor valida otra vez (`Landing::subdomain`), y la base lo exige con una restricción `CHECK`.
- Nombres reservados (no se pueden elegir): `www`, `mail`, `smtp`, `imap`, `pop`, `ftp`, `cpanel`, `webmail`, `webdisk`, `whm`, `api`, `app`, `admin`, `panel`, `login`, `media`, `p`, entre otros (lista en `Landing::RESERVED_SUBDOMAINS`).
- Único en todo el sistema. Un subdominio publicado queda reservado para su landing hasta que se publique otro nombre; el conflicto responde HTTP 409.

## Datos y flujo

- Migración `013_landing_subdomain.sql` (PostgreSQL) y `backend/mysql/migrations/013_landing_subdomain.sql` (MySQL): columnas `subdomain` (borrador) y `published_subdomain` (publicado), índices únicos y restricción de formato. Sigue el mismo modelo que `slug` y `published_slug`: guardar el borrador no mueve la dirección en vivo; **publicar** copia `subdomain` a `published_subdomain`.
- API: `PUT /api/landings/{id}` acepta `subdomain` (cadena o `null`/vacía para volver al enlace normal). `GET` devuelve además `subdomain_base` (dominio base) para la interfaz. `GET /api/products` incluye `public_url` cuando la landing publicada tiene subdominio.
- Router (`backend/public/index.php`): si `HTTP_HOST` es `<nombre>.<host de APP_URL>`, la ruta `/` (GET/HEAD) sirve la landing publicada con ese `published_subdomain`; si no existe, 404. Los nombres reservados (por ejemplo `www`) siguen a la app. Una landing despublicada deja de responder en su subdominio.
- `Landing::subdomainBase()` devuelve `null` si `APP_URL` es una IP o `localhost`; en ese caso la interfaz deshabilita la opción y todas las direcciones usan `/p/<slug>`.

## Infraestructura necesaria (GoDaddy/cPanel)

1. DNS: registro `A` con nombre `*` hacia la IP del hosting.
2. cPanel → *Domains*: dominio `*.tinbana.com` con raíz del documento `public_html`.
3. Certificado comodín (`tinbana.com` y `*.tinbana.com`) emitido con `acme.sh --dns dns_acmedns` y desplegado con `cpanel_uapi`; detalle en [DEPLOYMENT.md](DEPLOYMENT.md#certificado-comodín-para-los-subdominios-de-landings).
4. Aplicar las migraciones nuevas: `php bin/console.php migrate` (en cPanel, con el cron o script de un solo uso).

## Verificación

- `backend/tests/landing-subdomain.php` (46 comprobaciones): validación, reservados, dominio base, unicidad (aplicación y base de datos), publicación, URL pública y de consultas. Solo PostgreSQL local aislado.
- `tests/subdomain-router.mjs` (12 comprobaciones): servidor PHP local con `APP_URL` de prueba y cabecera `Host`; subdominio, HEAD, subdominio inexistente, `/p/` intacto, `www`, reservados, mapa del sitio y despublicación.
- `tests/landing-address.mjs` (18 comprobaciones, API simulada): opciones, limpieza de lo escrito, avisos, envío en el guardado, opción deshabilitada sin dominio público y tema oscuro.
- **No comprobado:** la migración MySQL (no hay MySQL local; es una sola sentencia `ALTER TABLE` que el ejecutor de migraciones MySQL acepta), el comodín DNS/SSL en el servidor real y la entrega por subdominios en tinbana.com.
