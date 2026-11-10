# Píxeles y medición de la tienda

Desde el 2026-11-10, cada tienda puede conectar el píxel de Meta y las etiquetas de Google a todas sus landings publicadas. Los campos están en el editor de la landing, en «Producto y página → SEO y píxeles», pero los valores son **de la tienda**: se guardan aparte del borrador con «Guardar píxeles» y se aplican al momento a todas las landings publicadas.

## Campos

| Campo | Formato | Uso |
|---|---|---|
| Píxel de Meta | Solo números, de 10 a 20 dígitos | Facebook e Instagram |
| Google Analytics 4 | `G-…` | Visitas y comercio electrónico |
| Google Ads | `AW-…` | Etiqueta de Google Ads |
| Etiqueta de conversión de Google Ads | Letras, números, `-` y `_` | Conversión de compra (requiere el ID `AW-…`) |
| Google Tag Manager | `GTM-…` | Para quien ya maneja sus etiquetas en GTM |
| Verificación de dominio de Meta | Código (o la etiqueta `<meta>` completa) | `facebook-domain-verification` |
| Verificación de Google Search Console | Código (o la etiqueta `<meta>` completa) | `google-site-verification` |

- Los IDs de Google se guardan en mayúsculas. Si se pega la etiqueta `<meta>` completa, solo se guarda el valor de `content`.
- No hay campo de código libre. Un campo desconocido o con otro formato responde 422.

## Eventos enviados

| Momento | Meta | Google (gtag y `dataLayer` si hay GTM) |
|---|---|---|
| Carga de la landing | `PageView` y `ViewContent` (producto y precio) | `view_item` |
| Apertura del formulario de pedido | `InitiateCheckout` (cantidad y valor) | `begin_checkout` |
| Pedido guardado por el servidor | `Purchase` con `eventID` | `purchase` (con `transaction_id`) y `conversion` de Ads si hay etiqueta |

- Purchase se envía solo cuando el servidor responde que guardó el pedido (respuesta 202 de `/p/<slug>/lead`), nunca con el simple clic.
- El valor es el de la mercancía (`unit_price × quantity` del pedido creado), en COP. El flete no se incluye.
- El `eventID` de Meta es la `idempotency_key` del pedido. La fase 2 (API de Conversiones) debe usar ese mismo valor para que Meta no cuente la venta dos veces.
- `transaction_id` de Google es el número de pedido (`TB-…`), o la `idempotency_key` si no hay número.
- Con GTM se envían eventos de comercio electrónico GA4 (`view_item`, `begin_checkout`, `purchase`) al `dataLayer` para configurar las etiquetas desde el contenedor.
- En la vista previa no se carga nada, para que las revisiones de la tienda no cuenten como visitas ni como ventas.

## Cómo funciona

- **Tabla:** `store_tracking` (`user_id`, `settings` JSON). Migraciones PostgreSQL `039_store_tracking.sql` y MySQL `061_store_tracking.sql`.
- **API (sesión, CSRF, plan `landings` para escribir):** `GET /api/store/tracking` y `PUT /api/store/tracking`, con límite de 30 cambios cada 10 minutos.
- **Servidor:** `backend/src/StoreTracking.php` valida y guarda. En la landing, `LandingRenderer` escribe las etiquetas de verificación y un `<script type="application/json" id="tb-tracking">` con los IDs y el producto. Ese JSON no se ejecuta.
- **CSP:** la página sigue sin scripts en línea (`script-src 'self'`). Solo cuando hay IDs, se agregan los dominios oficiales de Meta (`connect.facebook.net`, `www.facebook.com`) o de Google (`googletagmanager.com`, `google-analytics.com`, `doubleclick.net`, `googleadservices.com`, `google.com`) a `script-src`, `connect-src` y `frame-src`. Sin IDs, la cabecera queda igual que antes.
- **Navegador:** `src/landing-tracking.ts` (parte de `landing-runtime.js`) crea `fbq`/`gtag`, carga los scripts oficiales y envía los eventos. `src/StoreTracking.tsx` es el formulario del panel.
- **Respuesta del pedido:** `/p/<slug>/lead` devuelve además `purchase: {value, currency, quantity}`.

## Limitaciones

- GTM funciona con las etiquetas estándar de Google. Las etiquetas «HTML personalizado» del contenedor no se ejecutan, porque la página no permite scripts en línea.
- Solo navegador: los bloqueadores de anuncios y las restricciones de iOS pueden impedir algunos eventos. La API de Conversiones de Meta (servidor) queda para la fase 2.
- No hay banner de consentimiento de cookies.
- Los IDs se aplican a toda la tienda. No hay IDs distintos por landing.

## Pruebas

- `tests/store-tracking.mjs` (16 comprobaciones): CSRF, formatos, normalización, aislamiento entre tiendas, JSON y verificaciones en la landing, CSP por herramienta, valor de Purchase y página sin cambios cuando no hay IDs.
- La revisión en navegador se hizo interceptando las peticiones a Meta y Google, sin enviar nada a esos servicios. No se ha comprobado con un píxel real (Pixel Helper o Tag Assistant).
