# Arquitectura y API

## Componentes

`src/`: panel React y cliente HTTP con cookies. `backend/src/`: autenticación, cifrado, cliente Dropi, API, plantilla SSR y outbox de leads. `backend/public/`: única raíz pública. `backend/bin/console.php`: instalación y cron. `backend/migrations/`: versiones SQL. PostgreSQL es accedido únicamente por PHP mediante PDO.

Las tablas de negocio son `users`, `integrations`, `selected_products`, `landing_pages`, `template_settings`, `leads`, `webhook_deliveries` y `webhook_settings`. Esta última guarda el receptor HTTPS cifrado por propietario, proveedor y estado activo. `rate_limits` protege login/formularios y `schema_migrations` controla la instalación. Productos seleccionados son únicos por integración + Dropi ID; los slugs son globalmente únicos. Claves foráneas compuestas impiden asociar integración, selección o landing a otro propietario.

## Endpoints

| Método/ruta | Función |
|---|---|
| GET `/api/auth/session` | Usuario actual o null y CSRF de sesión |
| POST `/api/auth/login`, `/logout` | Sesión real PHP; logout está bajo `/api/auth/logout` |
| GET/POST `/api/integrations` | Listar estado o guardar token cifrado |
| PATCH `/api/integrations/{id}` | Reemplazar token |
| POST `/api/integrations/{id}/test` | Probar Dropi desde este servidor |
| GET `/api/integrations/{id}/products` | Búsqueda, orden y página |
| GET `/api/integrations/{id}/categories` | Categorías; no hay filtro de categorías en el panel |
| GET/POST `/api/products` | Selección del propietario o añadir producto consultado |
| DELETE `/api/products/{id}` | Quitar selección sin landing |
| POST `/api/products/{id}/landing` | Crear borrador o abrir landing existente |
| POST `/api/products/{id}/refresh` | Actualizar explícitamente original/copia sin modificar contenido comercial |
| GET/PUT `/api/template-settings` | Defaults para nuevas landings |
| GET/PUT `/api/landings/{id}` | Obtener o editar contenido/slug propio |
| POST `/api/landings/{id}/publish`, `/unpublish`, `/preview-link` | Cambio de estado o enlace HMAC de 15 minutos |
| GET `/api/leads?page=1` | Consultas e historial de entrega del propietario, 25 por página |
| POST `/api/leads/{id}/retry` | Reprogramar una entrega fallida |
| GET `/p/{slug}` | HTML público únicamente si está publicada |
| POST `/p/{slug}/lead` | Validar y guardar consulta; JSON o HTML |
| GET `/preview/{id}` | Sesión del propietario o firma temporal válida; noindex |
| GET `/sitemap.xml` | Solo landings publicadas |

Todos los métodos que modifican datos requieren `X-CSRF-Token`; formulario HTML usa `csrf`. API privada requiere sesión y propietario; conocer un UUID de otro usuario produce 404. Los tokens Dropi, clave de cifrado, contraseña PostgreSQL y webhook no se devuelven en API.

Login: límites de 8 intentos por email y 30 por IP en 15 minutos. Se contabilizan intentos exitosos y fallidos. Formularios públicos: 15 solicitudes por IP/hora, validación, honeypot y CSRF. `maintenance` limpia límites vencidos. Las sesiones quedan en disco privado; para varios nodos necesitarías un almacén compartido o afinidad de sesión.

## Catálogo

La URL conserva `integration`, `search`, `sort`, `page`. Debounce de 350 ms y AbortController cancelan solicitudes obsoletas. Se consulta `pageSize=50` y se muestran 32: `startData=(page-1)*32`; no se usa `count:0` como total. `hasNext` se basa en recibir más de 32 objetos. Solo hay ID asc/desc y nombre asc/desc. El cuerpo reproduce el proxy aportado: `active=true`, `no_count=true`, `integration=true`, `get_stock=false`. No se envía el filtro de favoritos ni se añade a la interfaz. Tampoco hay filtro de categorías, orden por precio ni tamaño de página en UI.

Se prioriza imagen main; `urlS3` con fallback a `url`; rutas relativas usan CloudFront. Stock solo se suma si todas las bodegas tienen dato. Descripción HTML se transforma a texto y se escapa al renderizar, tanto en React como PHP. Costos no se infieren. Datos del proveedor y variaciones pueden verse únicamente en detalles privados; no se copian automáticamente al HTML comercial público.

La selección no acepta un JSON de producto del cliente. PHP conserva las últimas tres páginas consultadas por integración en sesión durante 15 minutos y guarda solo el producto seleccionado. Si falta esa ventana o al actualizar explícitamente, se hace una búsqueda acotada por ID y se exige coincidencia exacta. Si Dropi no devuelve el ID en esa búsqueda, se informa el fallo; su semántica no se asume ni se recorre todo el catálogo.

Original Dropi, mapeo y contenido comercial están separados. Crear una landing copia el producto. Refrescar actualiza original + snapshot, nunca título, precio público, descripción, imágenes o SEO editados. El precio público comienza vacío para evitar confundir precio Dropi y venta. Imágenes son URLs, no descargas masivas. No se generan reseñas, garantías, descuentos ni beneficios ficticios.

## Límites del MVP

No incluye registro público, recuperación de contraseña por email, gestión de usuarios desde panel, borrado de landings con historial de leads ni editor visual de arrastrar bloques. Puedes quitar productos seleccionados que aún no tengan landing; los que tienen landing se conservan para preservar relaciones e historial. No hay seguimiento automático de cambios en Dropi. Cambiar slug no crea redirección automática desde el slug anterior.

Los errores internos registran únicamente clase/código, nunca mensajes de PDO, tokens o payloads. Dropi usa cURL TLS, timeout de conexión de 8s y total de 20s, HTTP/1.1, compresión y el User-Agent `WordPress/6.5; https://zenzales.com` del proxy aportado, con destinos HTTPS fijos y sin redirecciones. Antes de mapear o guardar respuestas, se eliminan campos de token y se redacta su contenido de forma recursiva. CSP, frame restrictions, escaping y cookies reducen exposición. La preview firmada es un bearer link: quien lo tenga puede verla hasta que expire; usa `Referrer-Policy: no-referrer` y no se indexa.

Un único cliente PHP compartido sirve a todas las integraciones. La API recupera cada registro por ID y propietario antes de descifrarlo. No se generan archivos por usuario ni se usa un token fijo del código, del proxy antiguo o del entorno como fallback de las solicitudes del panel. Reemplazar el token en el panel actualiza solo el ciphertext de esa integración.
