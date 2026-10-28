# Ventas por WhatsApp

Módulo propio de Tinbana para vender por WhatsApp con la **API oficial de WhatsApp Cloud (Meta)**, sin GHL ni n8n. Requisitos completos en [PROMPT-MODULO-WHATSAPP.md](PROMPT-MODULO-WHATSAPP.md). Se construye por etapas; cada etapa se entrega con pruebas locales aprobadas.

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Datos, conexión del número (credenciales del piloto) y webhook firmado con eventos guardados y deduplicados | Implementada y probada en local |
| 2 | Bandeja: recibir y responder a mano, estados de entrega, ventana de 24 h, tomar y devolver el chat | Implementada y probada en local |
| 3 | Agente de IA, fichas de producto aprobadas y ajustes | Implementada y probada en local |
| 4 | Anuncios → oferta y códigos de oferta (incluido el botón de WhatsApp de la landing) | Implementada y probada en local |
| 5 | Cotización, confirmación, pedido con origen WhatsApp y envío a Dropi con revisión | Pendiente |
| 6 | Plantillas, recordatorios, avisos de estado Dropi, consentimiento y bandeja de operación | Plantillas, nuevo chat y consentimiento al enviar: implementados (2026-10-27). Resto pendiente |
| 7 | Copia opcional a GHL, documentación y regresión completa | Pendiente |

**Ampliaciones pedidas por el propietario (2026-10-26), para después de la etapa 4:**
- **Nuevo chat**: escribir a un número que no ha escrito, solo con plantilla aprobada por Meta. **Implementado (2026-10-27).**
- **Confirmación de pedidos de landings por WhatsApp**: resumen cotizado con Dropi, botones «Confirmar pedido» y «Cambiar algo»; la confirmación queda registrada con evidencia del mensaje. Por defecto el pedido queda para **revisión manual**; cada tienda puede activar «Enviar a Dropi automáticamente al confirmar». **Implementado (2026-10-27).**
- **Plantillas creadas por Tinbana** y enviadas a Meta para aprobación desde el panel. **Implementado (2026-10-27).**
- **Aviso visible** en el formulario de las landings: «Te enviaremos la confirmación de tu pedido por WhatsApp». **Implementado (2026-10-27).**

Fuera de alcance: Embedded Signup (registro guiado con Facebook) y registro como proveedor tecnológico de Meta. El botón «Conectar con Meta» aparece deshabilitado como «Próximamente».

## Contrato con Meta (documentación oficial consultada el 2026-10-26)

- Graph API `v26.0` (la vigente en esa fecha). Base `https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/`.
- Prueba de conexión (solo lectura): `GET /{phone_number_id}?fields=verified_name,display_phone_number,quality_rating` con `Authorization: Bearer`.
- Verificación del webhook: `GET` con `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge`; se responde 200 con el `challenge` solo si el token coincide.
- Entregas: `POST` firmado con `X-Hub-Signature-256: sha256=<HMAC-SHA256 del cuerpo crudo con el secreto de la app>`. Meta reintenta hasta 7 días y puede repetir eventos; cargas de hasta 3 MB.
- Lo que no esté en la documentación oficial no se programa por suposición.

## Etapa 1

### Datos (PostgreSQL `020_whatsapp_core.sql`; MySQL `026`–`030`)

- `whatsapp_accounts`: un número por usuario y un usuario por `phone_number_id`; `waba_id`, nombre verificado, número visible, calidad, token cifrado, estado `pending/connected/error`, último error y última prueba, origen `manual/embedded_signup`.
- `whatsapp_events`: cada mensaje o estado entrante, una sola vez (`dedupe_key` única: `msg:<wamid>` o `st:<wamid>:<estado>`), con estado `pending/processing/done/ignored/failed`, intentos y bloqueo para el procesamiento de la etapa 2.
- `whatsapp_contacts`, `whatsapp_conversations` y `whatsapp_messages`: creadas ya con aislamiento por propietario (claves compuestas `id,user_id`); se llenan desde la etapa 2.
- PostgreSQL: RLS activado y permisos revocados a roles HTTP del proveedor, como en las demás tablas.

### Servidor

- `WhatsAppGraph`: cliente HTTPS de Meta (TLS verificado, sin redirecciones, tiempo límite). Solo fuera de producción admite `WHATSAPP_GRAPH_URL=https://127.0.0.1:<puerto>/` para el simulador de pruebas.
- `WhatsAppAccount`: guardar, probar y eliminar el número. El token se cifra con `Crypto` (contexto `id:usuario`) y nunca se devuelve. Al cambiar credenciales el estado vuelve a «Sin probar». Eliminar el número borra sus conversaciones y mensajes en Tinbana (no en Meta).
- `WhatsAppWebhook` en `GET|POST /whatsapp/webhook` (público, sin sesión, antes de `Auth::start`):
  - firma inválida o ausente → 401 y no se guarda nada; más de 3 MB → 413;
  - el dueño se identifica por `phone_number_id` **y** el `waba_id` de la entrada;
  - eventos de números no conectados se guardan solo como marca de duplicado (`ignored`, sin contenido);
  - responde `200 EVENT_RECEIVED` y luego libera la conexión (`fastcgi_finish_request`/`litespeed_finish_request`) antes de procesar. El procesamiento llega en la etapa 2; hasta entonces los eventos quedan `pending`.
- API del panel (requiere el permiso `whatsapp` del plan; CSRF en escrituras; límites por usuario): `GET|PUT|DELETE /api/whatsapp/account`, `POST /api/whatsapp/account/test`.

### Números en la app de Meta de otra persona (021 / MySQL 031)

Cada tienda puede conectar un número que esté en **su propia app de Meta**:

- En Conexión pega, además de sus credenciales, la **clave secreta de su app** (opcional; cifrada y nunca devuelta).
- Tinbana le genera un **token de verificación propio** (`tv…`), que solo ve esa cuenta, para configurar el webhook de su app con la misma URL `/whatsapp/webhook`.
- Al recibir una entrega, la firma se valida con la clave de la plataforma o con la de las cuentas nombradas en la entrega. La app de la plataforma puede hablar por cualquier número conectado; la app de una tienda, solo por el número de esa tienda. Si una entrega mezcla números, se guardan solo los del firmante; si ninguno es suyo, se responde 401.
- «Dejar de usar mi propia app» borra la clave y desactiva su token de verificación.

Los números dentro de la app de la plataforma no necesitan nada de esto.

### Variables de entorno (sin valores en el repositorio)

| Variable | Uso |
|---|---|
| `WHATSAPP_APP_SECRET` | Secreto de la app de Meta de la plataforma; valida las firmas del webhook. |
| `WHATSAPP_VERIFY_TOKEN` | Texto elegido por la plataforma que también se pega en Meta al configurar el webhook. |
| `WHATSAPP_GRAPH_VERSION` | Versión de Graph API, por defecto `v26.0`. |

### Panel

Menú «Ventas WhatsApp» → `/panel/whatsapp/conexion` (con el mismo sistema de tarjetas que Integraciones Dropi y Conexión GHL): estado del número, identificadores, calidad, prueba de conexión, reemplazo de credenciales, eliminación con confirmación, URL del webhook con botón para copiar y estado de la configuración del servidor. El permiso «Ventas por WhatsApp con IA» se activa o desactiva por plan o por cuenta en Administración.

## Etapa 2: bandeja

### Procesamiento (`WhatsAppInbox`)

- El webhook guarda y responde; después (`fastcgi_finish_request`/`litespeed_finish_request`) procesa hasta 20 eventos. El cron `whatsapp:work [50]` es el respaldo, cada minuto.
- Reclamo seguro entre procesos (`FOR UPDATE SKIP LOCKED`, también en MariaDB). Un evento en `processing` más de 3 minutos se vuelve a tomar.
- Mensaje entrante → contacto (`user_id`,`phone`), conversación (número + contacto) y mensaje con `wamid` único: repetirlo no crea nada. La hora es la de Meta. Actualiza la ventana (`last_customer_at`) y los no leídos.
- Tipos: texto, botón de plantilla e interactivos (`button_reply`/`list_reply`) muestran su texto; reacciones, su emoji. Imagen, audio, video, documento, sticker, ubicación y contactos se guardan como referencia y se ven como «Archivo recibido (no compatible todavía)», con el pie de foto si lo hay.
- El primer anuncio o publicación (`referral`) se guarda en el contacto para la etapa de anuncios y no se sobrescribe.
- Estados `sent → delivered → read/played`: solo avanzan. `failed` guarda una explicación en español del código de Meta (por ejemplo 131047, ventana de 24 h), sin el texto del mensaje. Si un estado llega antes que su mensaje, espera 30 segundos y reintenta durante 15 minutos sin bloquear a los demás eventos.
- Errores de procesamiento: se reintentan hasta 5 veces y quedan `failed` con el tipo de error, nunca con datos personales.

### Responder, tomar y devolver

- Un solo emisor por conversación: el asesor solo puede escribir tras **Tomar conversación**; **Devolver a la IA** es explícito y ningún temporizador lo hace. Ambas acciones exigen la versión vista (si cambió, 409 y se recarga).
- Antes de cada envío el servidor comprueba la ventana de 24 h desde el último mensaje del cliente; cerrada → 409 y no se envía texto libre (las plantillas llegan en la etapa 6).
- Envío: `POST /{phone_number_id}/messages` con `type:"text"` (máximo 4096 caracteres). Cada envío lleva un `client_id`: repetir la solicitud nunca envía dos veces. Con error 5xx o sin respuesta, el mensaje queda «No se confirmó el envío», **sin reintento automático**; el panel ofrece reintentar con el mismo id.
- API: `GET /api/whatsapp/conversations?filter=all|ai|human|unread&q=&stamp=`, `GET /api/whatsapp/conversations/{id}?stamp=`, `POST .../{id}/read`, `POST .../{id}/take|release {version}`, `POST .../{id}/messages {client_id, body}`.

### Panel

- `/panel/whatsapp` (bandeja) y `/panel/whatsapp/{id}` (conversación): contadores, lista con búsqueda y filtros (Todas, IA, Asesor, No leídas), burbujas con día, emisor y estados (reloj, ✓, ✓✓, ✓✓ azul, «!» con motivo) y contexto (cliente, origen, responsable con motivo, ventana con cuenta regresiva). En móvil se ve la lista o el chat, con botón para volver.
- Actualización por consulta periódica cada 4 s con la pestaña visible y 20 s en segundo plano; el servidor responde «sin cambios» si el sello no cambió. Esas consultas envían `X-Session-Probe: 1`, no renuevan la sesión ni encienden la barra de carga.
- El agente de IA llega en la etapa 3: mientras tanto, los chats nuevos quedan asignados a la IA y el panel indica que hay que tomarlos para responder.

### Diagnóstico en Conexión

La tarjeta del número muestra el último mensaje o estado recibido de Meta, cuántos eventos esperan proceso y cuántos fallaron (con el tipo de error). Si una entrega **firmada** de Meta no pasa la validación, se anota la hora en `app_settings` (`whatsapp_signature_rejected`, como mucho una vez por minuto y sin contenido; las solicitudes sin firma no cuentan) y la tarjeta avisa que se revise `WHATSAPP_APP_SECRET` o la clave de la app propia. Sin eventos ni rechazos, indica revisar la suscripción del webhook al campo `messages`. Si llegan entregas para el número con otro WhatsApp Business Account ID, se descartan por seguridad, se anota ese ID (no es dato personal) y la tarjeta indica cuál pegar en las credenciales.

### Suscripción de la app a la cuenta (documentación oficial, 2026-10-26)

Meta solo envía los mensajes reales al webhook si la app está suscrita a la cuenta de WhatsApp: `GET /{WABA_ID}/subscribed_apps` lista las apps (`data[].whatsapp_business_api_data.{id,link,name}`) y `POST /{WABA_ID}/subscribed_apps` suscribe la app del token (`{"success":true}`). La prueba del panel de Meta llega aunque no exista esa suscripción. «Probar conexión», cuando lee bien el número, **suscribe automáticamente** la app del token (el `POST` no cambia nada si ya estaba suscrita) y luego lista las apps. Si Meta rechaza la suscripción, la prueba igual queda conectada, muestra el motivo y el botón «Suscribir mi app» (`POST /api/whatsapp/account/subscribe`) para reintentar. Caso real del 2026-10-26: solo estaba suscrita «WA DevX Webhook Events 1P App», la app interna de Meta para las pruebas del panel; la pantalla la señala cuando la propia no quedó suscrita. La guía de webhooks de Meta indica además que algunos webhooks no se envían con la app en modo **Dev**; si con la app suscrita no llegan mensajes, hay que publicarla (modo **Live**).

### Comprobaciones de la etapa 2

- `node tests/whatsapp-inbox.mjs` (simulador de Graph en 8446 que registra envíos y devuelve `wamid`): 46 comprobaciones. Incluyen: evento repetido diez veces = un mensaje, tipos no compatibles, aislamiento entre tiendas, filtros y búsqueda, sello de consulta, emisor único, versión vieja, CSRF, envío exacto a Meta, idempotencia, estados que no retroceden, fallo con motivo, error 5xx sin reintento, rechazo de Meta, estado anticipado sin bloquear la cola, ventana cerrada y reabierta, devolver a la IA, cron, permiso del plan, actualización en vivo, consultas que no renuevan la sesión y panel en claro, oscuro y móvil.
- MariaDB 10.11.19 local: 10 comprobaciones de la bandeja (reclamo con `SKIP LOCKED`, lista, sello, búsqueda, detalle, tomar, respuesta con resultado desconocido, idempotencia y ventana cerrada).

## Etapa 3: agente de IA

### Cómo responde
- Responde solo mientras el chat está con la IA (`owner_mode=ai`), con bloqueo por conversación, y vuelve a comprobarlo antes de enviar por si un asesor lo tomó. `customer_seq`/`ai_seq` hacen que conteste una sola vez los últimos mensajes del cliente, aunque lleguen varios mientras piensa. Lo ejecuta el procesamiento del webhook (hasta 5 chats) y el cron `whatsapp:work`.
- La IA **solo conversa**. Devuelve un JSON estricto con el texto, la intención, el producto, los datos capturados (nombre, ciudad, departamento, dirección, barrio, referencia, cantidad, variante) y una acción (`none`, `ask_product`, `request_quote`, `present_summary`, `confirm`, `handoff`). El servidor valida y decide; nunca fija precio, envío, total ni disponibilidad, ni crea pedidos. Solo puede mencionar el texto aprobado de «Precio y promociones».
- Hasta la etapa 5, un cliente listo para comprar (`request_quote`, `present_summary`, `confirm`) recibe la respuesta y el chat pasa a un asesor con sus datos.
- Contexto enviado: la tienda, la hora, los productos con ficha aprobada, la ficha del producto, los datos capturados y los últimos 12 mensajes (sin teléfono ni tokens).
- Respuestas «breves»: tope de 400 tokens y 350 caracteres (1 o 2 frases). «Normal»: 800 tokens y 700 caracteres. Tiempo de espera de 25 s. `AiClient::structured` generaliza el cliente; las landings conservan 6000 tokens y 90 s.
- Pasa a un asesor (con el motivo visible en la bandeja) cuando: el plan no incluye el agente, está apagado o no hay IA conectada (los chats nuevos empiezan con un asesor); se alcanzó el límite mensual; fuera de horario con esa opción; no hay fichas aprobadas; dos archivos seguidos; la IA falla (el cliente recibe el mensaje neutral); la IA lo pide según los motivos configurados.
- Fotos, audios y otros archivos: mensaje fijo sin gastar IA; al segundo seguido, a un asesor.
- Tokens: se guardan por mensaje y por conversación.

### Ajustes del agente
Tono (cercano, profesional, entusiasta), instrucciones adicionales, largo (breve por defecto), motivos para pasar a un asesor (cuatro activables y otros en texto libre), horario (días, desde, hasta y qué hacer fuera de horario: «responde igual», el predeterminado, o «avisar y pasar a un asesor») y tres mensajes automáticos. Capas: valores de Tinbana ← predeterminados del superusuario (`app_settings` `whatsapp_agent_defaults`, en Administración → Valores globales, auditado) ← ajustes propios de la tienda (`whatsapp_agent_settings`; «Usar los predeterminados» los borra).

### Permisos y límites (superusuario)
- Función `whatsapp_ai` («Agente de IA en WhatsApp»), por plan o por cuenta.
- Límite `whatsapp_ai_conversations` («Conversaciones de WhatsApp atendidas por IA al mes»), ilimitado por defecto. Cuenta las conversaciones a las que la IA respondió en el mes (hora de Colombia); una conversación ya atendida en el mes sigue atendida.

### Fichas de producto (`whatsapp_product_sheets`)
Resumen, qué puede decir, precio y promociones que puede mencionar, hasta 12 preguntas frecuentes y qué no debe prometer. Un borrador editable por producto; «Aprobar» crea una versión nueva y el agente usa la última aprobada. «Proponer borrador con IA» usa la conexión de IA de la tienda (requiere la función `ai`) solo con la descripción del producto y queda como borrador.

### API
`GET|PUT|DELETE /api/whatsapp/agent`, `GET /api/whatsapp/sheets`, `GET|PUT /api/whatsapp/sheets/{producto}`, `POST .../approve`, `POST .../generate`; superusuario: `GET|PUT /api/admin/whatsapp-agent`. El detalle de una conversación incluye el producto, la versión de la ficha, los datos capturados y los tokens.

### Datos (PostgreSQL `022`; MySQL `032`–`034`)
`whatsapp_agent_settings`, `whatsapp_product_sheets` y, en `whatsapp_conversations`, `product_id`, `sheet_version`, `customer_seq` y `ai_seq`.

### Comprobaciones de la etapa 3
- `node tests/whatsapp-agent.mjs` (Meta simulado en 8446 e IA simulada en 8447 con `AI_OPENAI_URL`): 50 comprobaciones. Cubren predeterminados, ajustes propios y su validación, CSRF, predeterminados del superusuario con auditoría, fichas y versiones, borrador con IA, aislamiento, la petición a la IA (estricta, sin almacenamiento, 400 tokens, clave de la tienda, sin teléfono ni token), una sola respuesta ante 10 entregas, recorte de respuestas largas, datos capturados, pasos a asesor (cliente listo para comprar, pide persona, falla de la IA, archivos, fuera de horario, límite mensual, plan sin agente), tomar y devolver con versión, emisor único y el panel en claro, oscuro y móvil.
- MariaDB 10.11.19 local: 11 comprobaciones (migraciones 032–034, ajustes, fichas, uso mensual, consulta de pendientes, bloqueo con intervalos y `GREATEST`).
## Etapa 4: anuncios y ofertas

Estructura del `referral` confirmada en la documentación oficial el 2026-10-26: `source_url`, `source_id`, `source_type` (`ad`), `body`, `headline`, `media_type`, `image_url` (anuncio de imagen), `video_url` y `thumbnail_url` (anuncio de video), `ctwa_clid` (no viene en anuncios de Estados) y `welcome_message.text`.

### Ofertas (`whatsapp_offers`)
Una oferta es un producto, sus unidades (combos) y su regla de precio: los **tramos por cantidad** del producto (versión vigente de `ProductOffers`; si no hay tramos vigentes, «precio pendiente» y el agente no habla de precio) o un **precio fijo**. Cada oferta tiene un código `TB-XXXX` (automático o propio, único por tienda; los `TV-` anteriores al cambio de marca siguen funcionando) y su mensaje predeterminado para pegar en el anuncio: «Hola, quiero {nombre} ({código})». Una oferta por producto puede marcarse para el **botón de WhatsApp de las landings**; ese enlace lleva el código con una firma HMAC de 4 caracteres (`TB-PICA1-K7Q2`). Archivar una oferta la retira de anuncios y landings sin borrar el historial.

### Anuncios (`whatsapp_ads`) y entradas (`whatsapp_entries`)
- Un anuncio que llega por primera vez se crea **sin asignar**, con el título, el texto y la imagen que envía Meta, y aparece primero en la tabla para elegir su oferta. También se puede agregar antes pegando su identificador. Un anuncio pausado no asigna su oferta.
- Orden de reconocimiento, sin elegir nunca el producto más vendido: (1) identificador del anuncio; (2) código firmado de la landing (certeza alta); (3) código escrito a mano (certeza media; el agente lo confirma); (4) sin relación clara, el agente pregunta.
- Cada entrada se guarda aparte (anuncio, oferta, método, certeza, código y `referral`). La conversación guarda la oferta, el producto, el anuncio, el método y la certeza de su última entrada. Si llega por otra oferta con datos de compra ya capturados, el agente pregunta si continúa la compra o empieza otra. Un anuncio nuevo no cambia pedidos anteriores.
- El agente recibe la oferta con el precio calculado por el servidor (`offer.price_text`) y solo puede repetirlo. Si el cliente cambia a otro producto, la oferta deja de aplicar a ese chat. Si el producto de la oferta no tiene ficha aprobada, el chat pasa a un asesor.

### Panel
Pestaña **Anuncios** (`/panel/whatsapp/anuncios`): tabla de anuncios (sin asignar en amarillo, entradas de los últimos 7 días, estado, asignar oferta, pausar, quitar), ofertas (crear, editar, archivar), mensajes predeterminados para copiar, guía para configurar un anuncio y orden de reconocimiento. En la bandeja, el contexto muestra el origen de la entrada (anuncio, identificador, método, certeza y oferta).

### API
`GET|POST /api/whatsapp/ads`, `PUT|DELETE /api/whatsapp/ads/{id}`, `POST /api/whatsapp/offers`, `PUT|DELETE /api/whatsapp/offers/{id}`.

### Datos (PostgreSQL `023`; MySQL `035`–`038`)
`whatsapp_offers`, `whatsapp_ads`, `whatsapp_entries` y, en `whatsapp_conversations`, `ad_ref`, `offer_method`, `offer_certainty` y `offer_changed`. Los indicadores usan 0/1 enteros, como el resto del proyecto.

### Comprobaciones de la etapa 4
- `node tests/whatsapp-ads.mjs` (Meta e IA simulados): 30 comprobaciones. Cubren validación y CSRF de ofertas; códigos, precios calculados y combos; código repetido; tramos sin vigencia; anuncios preparados antes; anuncios A y B con el mismo «Hola» y productos distintos; anuncio nuevo sin asignar con título e imagen; el agente pregunta sin elegir por defecto; asignar y reconocer al siguiente cliente; código escrito (indicio), código firmado de la landing, firma alterada; mensaje sin anuncio ni código; mismo teléfono por otro anuncio con compra en curso; anuncio pausado; oferta archivada; aislamiento entre tiendas, incluido el mismo identificador de anuncio en otra tienda; y el panel (crear oferta, contexto del chat, claro, oscuro y móvil).
- MariaDB 10.11.19 local: migraciones 035–038 y 6 comprobaciones (oferta, anuncio, entrada con `referral`, anuncio desconocido, orden y conteos, código firmado y archivo).
## Aviso al cliente y notificaciones de la tienda (pedido del propietario, 2026-10-26)

- **Mensaje al pasar a un asesor**: ajuste `handoff_notice` (activo por defecto) y texto `messages.handoff` («Te paso con un asesor para continuar. En un momento te escribe. 🙌»), personalizable por tienda y como predeterminado del superusuario. Cuando la IA pasa el chat (motivos configurados o cliente listo para comprar), el cliente recibe **solo ese mensaje**, no el texto de la IA; con el aviso apagado se envía la respuesta de la IA como antes. También se envía al pasar el chat por límite mensual, falta de fichas, IA no disponible o archivos repetidos. Si la IA falla se usa el mensaje de falla, y fuera de horario el de fuera de horario. Los ajustes guardados antes de existir este campo toman su valor predeterminado.
- **Notificaciones** (`notifications`, `notification_settings`; PostgreSQL `024`, MySQL `039`–`040`): eventos `handoff`, `ai_failure`, `limit`, `off_hours` y `new_chat` (chat nuevo sin IA disponible), con título, motivo y enlace al chat. Canales: campanita en el panel con contador y lista, sonido y notificación del navegador mientras Tinbana está abierto (la notificación del navegador solo con la pestaña en segundo plano y permiso concedido), y correo con la plantilla de Tinbana, enviado por el cron `mail:work` con hasta 5 intentos. Todo activo por defecto; el correo va al de la cuenta o al que se elija. Ajustes en `/panel/notificaciones`.
- La campanita consulta cada 20 s (60 s en segundo plano) con `X-Session-Probe`, así que no renueva la sesión; `errors-session.mjs` lo confirma.
- API: `GET /api/notifications?stamp=`, `POST /api/notifications/read {ids|all}`, `GET|PUT /api/notifications/settings`.
- Comprobado (local): `whatsapp-notify.mjs` 27 (mensaje predeterminado y personalizado, aviso apagado, avisos de cada evento, ajustes y validación, correo según canal y dirección, lista y marcado, aislamiento, campanita, sonido y notificación del navegador simulados, página de ajustes, móvil); MariaDB 5.
## Plantillas y nuevo chat (2026-10-27)

Documentación oficial consultada el 2026-10-27:
- Crear: `POST /{WABA_ID}/message_templates` con `name` (minúsculas y guion bajo), `language`, `category` (`utility` o `marketing`) y `components`. Cuerpo hasta 1024 caracteres con variables posicionales `{{1}}` y un ejemplo por variable en `example.body_text`; pie hasta 60; botones `QUICK_REPLY` hasta 25 caracteres.
- Listar: `GET /{WABA_ID}/message_templates?fields=name,language,status,category,id,components&limit=100` con paginación por cursor `after`.
- Eliminar: `DELETE /{WABA_ID}/message_templates?hsm_id=…&name=…`.
- Enviar: `POST /{PHONE_NUMBER_ID}/messages` con `type: template`, `template.name`, `template.language.code` y `components` (parámetros del cuerpo y `payload` de los botones de respuesta rápida). Al tocar un botón llega un mensaje `button` con `payload`, `text` y `context.id` del mensaje de la plantilla.
- La forma exacta de la respuesta al crear no está documentada: Tinbana guarda `id` y `status` si vienen y, en cualquier caso, el estado real se lee con «Actualizar estados».

Funcionamiento (`WhatsAppTemplates`, tabla `whatsapp_templates`; PostgreSQL `025`, MySQL `041`):
- Pestaña **Plantillas** (`/panel/whatsapp/plantillas`): dos sugeridas (`confirmacion_pedido`, utilidad, con «Confirmar pedido» y «Cambiar algo»; `saludo_nuevo_chat`, marketing), editor propio con variables legibles (`{{nombre}}`, `{{producto}}`…), que se convierten a `{{1}}`, `{{2}}` al enviarlas a Meta, ejemplos obligatorios, pie, hasta 3 botones y vista previa. Idiomas en español (`es_CO` por defecto).
- «Actualizar estados» trae aprobadas, en revisión, rechazadas o pausadas; importa las creadas directamente en Meta (sus variables quedan como `{{var1}}`, `{{var2}}`) y marca como «Eliminada en Meta» las que ya no existen.
- **Nuevo chat** (Bandeja) y **Enviar plantilla** (chat con la ventana de 24 h cerrada): solo con plantilla aprobada, todas las variables completas y la casilla «Este cliente me dio permiso para escribirle por WhatsApp». Los números colombianos de 10 dígitos que empiezan por 3 reciben el indicativo 57. El chat nuevo empieza con el asesor (motivo «Chat iniciado por la tienda»). El mensaje se guarda antes de enviarlo y no se reintenta solo; si Meta no responde, queda fallido con el aviso de revisar en WhatsApp.
- Límites: 20 creaciones por hora, 30 sincronizaciones cada 10 min y 60 envíos de plantilla por hora por tienda.
- API: `GET|POST /api/whatsapp/templates`, `POST /api/whatsapp/templates/sync`, `DELETE /api/whatsapp/templates/{id}`, `POST /api/whatsapp/chats`, `POST /api/whatsapp/conversations/{id}/template`.
- Meta cobra las conversaciones iniciadas con plantilla; el panel lo indica.
- Comprobado (local, Meta simulado): `whatsapp-templates.mjs` 32 (validaciones y CSRF, formato enviado a Meta, rechazo explicado, aprobación y plantillas externas, consentimiento, plantilla pendiente, variables, número colombiano, chat con asesor, ventana cerrada hasta que el cliente toca un botón, plantilla tras 24 h, aislamiento entre tiendas, eliminación por `hsm_id` y nombre, panel y móvil); MariaDB 3. No se creó nada en Meta.

## Confirmación de pedidos de landings (2026-10-27)

Servicio `WhatsAppOrderConfirm`; tablas `whatsapp_confirm_settings` y `whatsapp_order_confirmations` (PostgreSQL `027`, MySQL `043`–`044`).
- **Ajustes** (`/panel/whatsapp/confirmaciones`, `GET|PUT /api/whatsapp/confirmations`): apagado por defecto. Plantilla aprobada con **exactamente dos botones** (el primero confirma, el segundo pide cambios) y solo variables del pedido: `nombre`, `apellido`, `producto`, `variante`, `cantidad`, `precio`, `envio`, `total`, `direccion`, `ciudad`, `departamento`, `pedido`, `tienda`. La sugerida `confirmacion_pedido` cumple. Mensajes editables al confirmar y al pedir cambios. «Revisión manual» por defecto; «Enviar a Dropi automáticamente» usa el mismo envío que el botón manual (`PENDIENTE CONFIRMACION`, sin reintento si el resultado es desconocido).
- **Envío:** el pedido nuevo entra en cola dentro de la transacción del lead y se envía después de responder al formulario (respaldo: cron `whatsapp:work`). Se cotiza solo con el precio de la landing y el envío que Dropi cotizó al enviar el formulario (evento `auto_quoted`, vigencia 24 h). Sin ese envío, con variantes por elegir, dirección incompleta o teléfono inválido queda «No enviada» con el motivo. Un chat nuevo empieza con el asesor (motivo «Confirmación del pedido #…»). Cada botón lleva el `payload` `tvc:{id}:ok|change`. Si Meta no acepta la plantilla queda «No se envió»; un envío interrumpido más de 5 minutos queda fallido. Nunca se reenvía sola.
- **Respuesta:** solo cuenta un mensaje `button` con ese `payload`, en el mismo chat y con `context.id` igual al `wamid` de la plantilla; la IA no lo responde. «Confirmar pedido» confirma si el pedido sigue en borrador con la misma cotización y versión (evidencia: método `whatsapp_button`, `wamid` del toque y de la plantilla, hora); si cambió o venció, queda «Confirmó un resumen vencido», el chat pasa a un asesor y el cliente recibe un aviso. «Cambiar algo» deja el pedido en borrador, pasa el chat a un asesor y envía el mensaje de cambios. Repetir el toque no envía nada. Si el cliente escribe texto mientras espera la confirmación en un chat de la IA, el chat pasa a un asesor.
- **Pedido:** tarjeta «Confirmación por WhatsApp» con estado, enlace al chat y «Enviar resumen por WhatsApp» / «Enviar nuevo resumen» (`POST /api/orders/{id}/whatsapp {version}`; exige cotización vigente; 60 por hora). El historial muestra la cotización automática, el envío, los cambios y los resúmenes vencidos.
- **Formulario:** con la función activa y una plantilla válida aparece «Te enviaremos la confirmación de tu pedido por WhatsApp».
- **Notificaciones:** `order_confirmed` y `order_change` (activas por defecto, configurables en `/panel/notificaciones`).
- Comprobado (local, Meta y Dropi simulados): `whatsapp-confirm.mjs` 41 (validación de plantillas, CSRF, aislamiento, aviso del formulario, cotización y plantilla, toques falsos o de otro número, confirmación con evidencia, repetición, cambios, resumen vencido y reenvío desde el pedido, envío automático a Dropi, sin envío de Dropi, rechazo de Meta, apagado, panel y móvil). Puertos movibles con `TEST_BASE_URL`, `WA_GRAPH_PORT`, `DROPI_QUOTE_PORT` y `DROPI_ORDERS_PORT`. MySQL 043–044 sin comprobar en MariaDB local.


### El cliente escribe primero (2026-10-27, PostgreSQL `028`, MySQL `045`)

Documentación oficial consultada el 2026-10-27 (mensajes interactivos con botones de respuesta): `type: interactive`, `interactive.type: button`, `body.text` hasta 1024, `footer.text` hasta 60, hasta 3 botones `reply` con `id` hasta 256 y `title` hasta 20 caracteres únicos. El toque llega como `type: interactive`, `interactive.type: button_reply` con `button_reply.id`/`title` y `context.id` del mensaje original. Solo se puede enviar con la ventana de 24 h abierta.
- Ajuste «Primero invitar al cliente a escribirte» (activo por defecto) y espera antes de la plantilla (5, 10, 15, 30, 60 o 120 min; 15 por defecto). La plantilla pasa a ser respaldo opcional. Necesita el número que guarda «Probar conexión».
- Cada pedido usa su número de pedido `TB-XXXX-XXXX` (ver [ORDERS.md](ORDERS.md)) como código. La respuesta del formulario trae `whatsapp: {link, code}` y el popup muestra «Confirmar por WhatsApp» (abre `https://wa.me/{número}?text=Hola, quiero confirmar mi pedido TV-…` en otra pestaña), el código y «Ahora no».
- Un mensaje de texto con un código en espera asocia la confirmación a ese chat y la envía al instante como mensaje interactivo (texto de la plantilla elegida o el resumen predeterminado, pie «Pago contra entrega»), al número que escribió. La IA no responde ese mensaje. Repetir el código después no envía nada.
- Si el cliente no escribe, a la hora fijada sale la plantilla (cron `whatsapp:work`); sin plantilla queda «No enviada» con el motivo. Desde el pedido se puede enviar ya («Enviar el resumen ahora») después de cotizar; con el chat abierto sale con botones, si no con la plantilla.
- Comprobado (local): `whatsapp-confirm.mjs` 59 (enlace y código, nada antes de que escriba, mensaje interactivo al número que escribió, código repetido, contexto ajeno, confirmación por botón interactivo, respaldo con plantilla, envío inmediato desde el pedido, sin plantilla, popup y «Ahora no»).


### Correo «Recibimos tu pedido» con WhatsApp (2026-10-28)

- Al enviarse el correo (`mail:work`), `WhatsAppOrderConfirm::mailInfo` lee el estado de la confirmación: si el cliente aún no escribió, el correo incluye «¿Quieres confirmarlo más rápido?» y el botón «Confirmar por WhatsApp» con su código; si ya se le envió el resumen, el botón «Abrir WhatsApp» con el aviso de tocar «Confirmar pedido»; si ya confirmó (u otra situación), nada. La vista previa de Correos muestra el bloque cuando la tienda usa el paso «el cliente escribe primero».
- Requisitos para ver el botón del popup y el aviso del formulario: confirmaciones activas en Ventas WhatsApp → Confirmaciones, «Primero invitar al cliente a escribirte» encendido y el número guardado con «Probar conexión».


### Preguntas por un pedido ya hecho (2026-10-28)

- Si el cliente pregunta por su pedido («mi pedido», «mi orden», «dónde está mi…», «estado de…», «seguimiento», «rastrear»; no «hacer mi pedido») sin enviar el número, el agente responde sin IA y sin pasar a un asesor: «Con gusto te ayudo con tu pedido. Escríbeme tu número de pedido: empieza por TB…» (`WhatsAppAgent::ASK_ORDER`). Si ya se le pidió, la IA continúa normalmente.
- Las instrucciones de la IA dicen que preguntar por el estado de un pedido no es un problema y que pida el número; solo pasa a un asesor si el cliente reporta un problema.
- Cuando el cliente envía un número `TB-…`: si es de la tienda, recibe el estado; si no existe, «No encontramos un pedido con el número…»; si coincide con un código de oferta con firma (`TB-CEP2-K7Q2`), lo procesan las ofertas.


### Pedidos dentro del chat y memoria (2026-10-28, PostgreSQL `031`, MySQL `048`)

- **Memoria:** la IA devuelve en cada respuesta un resumen breve de la conversación (`whatsapp_conversations.summary`) y lo recibe en la siguiente, además de los últimos 20 mensajes. El paso pendiente se guarda en `whatsapp_conversations.pending`. La Bandeja muestra «En qué quedó» y «Lo que recuerda la IA».
- **Pedidos del cliente en el contexto** (`WhatsAppOrderChat`): los del mismo teléfono en la tienda (o enlazados al chat por una confirmación), con número, producto, total, estado y si falta confirmarlos; sin datos de contacto. La IA usa la acción `show_order` (con `order_number` o vacío) y el servidor escribe la respuesta; nunca dice que un pedido quedó confirmado.
- **Preguntar por «mi pedido»:** si el teléfono tiene un pedido, se muestra; si tiene varios, la lista para elegir; si no tiene, se pide el número TB. Sin IA y sin asesor.
- **«1 SÍ / 2 NO»:** al mostrar un pedido en borrador se cotiza si hace falta (precio de la landing y envío de Dropi, o envío incluido) y se pregunta «¿Lo confirmamos? Responde 1 para SÍ o 2 para NO». «1», «sí», «confirmo», «dale», «ok» o «listo» confirman (método `whatsapp_text`, evidencia con el texto y el `wamid`) si la cotización y la versión siguen iguales, y siguen el mismo camino que el botón (mensaje, aviso y envío automático a Dropi si está activo); si cambió, se muestra de nuevo. «2» o «no» deja el pedido en borrador y pasa a un asesor. Solo cuentan respuestas escritas; los botones mantienen su verificación de contexto.
- **Chats abiertos por la confirmación de pedido** empiezan con la IA cuando está disponible (antes, con un asesor). Ya no se pasa a un asesor cuando el cliente escribe mientras espera la confirmación.


### Instrucciones generales y aprendizajes (2026-10-28, PostgreSQL `032`, MySQL `049`)

- **Superadmin → Administración → «IA de WhatsApp»** (`/panel/admin/ia`): instrucciones generales (hasta 4000 caracteres, `app_settings.whatsapp_agent_prompt`) que se suman a las de cada tienda, y aprendizajes de la plataforma (hasta 1000). Cada cambio queda en la auditoría. API: `GET/PUT /api/admin/whatsapp-ai`, `POST /api/admin/whatsapp-knowledge`, `PUT/DELETE /api/admin/whatsapp-knowledge/{id}`.
- **Tienda → Agente IA → «Aprendizajes»** (hasta 500): pregunta → respuesta aprobada. En la Bandeja, cada mensaje de un asesor tiene «Guardar como aprendizaje», que abre la pregunta del cliente y la respuesta para editarlas antes de guardar (queda marcado «Desde un chat»). API: `GET/POST /api/whatsapp/knowledge`, `PUT/DELETE /api/whatsapp/knowledge/{id}`; requieren el permiso del agente de IA y están aisladas por tienda.
- **Cómo los usa la IA:** recibe en `knowledge` hasta 12 aprendizajes (de la tienda y de la plataforma) que comparten palabras con el último mensaje y la memoria; si hay 12 o menos, van todos. En empate gana el de la tienda. La IA no se modifica sola: solo reutiliza lo aprobado por una persona. Tabla `whatsapp_knowledge` (`user_id` NULL = plataforma).


### Cierre de conversaciones y borrado (2026-10-28, PostgreSQL `033`, MySQL `050`)

- **Evidencia legible:** la confirmación escrita queda como «El cliente respondió «1 SÍ»…» (o «sí» / «dale» con «equivale a 1 SÍ»); el «no» registra «2 NO» en el evento.
- **Después de confirmar** (por botón o por «1»), el mensaje de confirmado termina con «¿Tienes alguna otra pregunta? … Si no, responde *no* y cerramos este chat.» (`pending.type=after_confirm`, 24 horas). Una respuesta de cierre («no», «gracias», «listo 👍», «nada más, gracias»; sin «?» ni otras palabras) envía la despedida y cierra el chat sin IA. Cualquier otro mensaje borra la pregunta y lo responde el agente.
- **Cierre por inactividad:** el cron `whatsapp:work` cierra los chats sin mensajes en 24 horas, salvo los que esperan a un asesor (con asesor y mensajes sin leer). Un «1 SÍ / 2 NO» pendiente se conserva, así que una respuesta tardía sigue contando.
- **Reapertura:** si el cliente vuelve a escribir, el chat se abre de nuevo (con la IA si está disponible) y el agente solo lee desde el cierre (`opened_at`); conserva la memoria resumida y los pedidos.
- **Borrado:** 30 días después del cierre se borran los mensajes y los datos del chat (memoria, datos capturados, cotización); queda la fila de la conversación (contacto, entrada de anuncio, enlace a pedidos) y sale de la Bandeja. No se borran mensajes del mes en curso porque cuentan para el límite mensual de la IA. Los pedidos guardan su propia evidencia de confirmación.
- **Bandeja:** etiqueta «Cerrada» en la lista y aviso con fecha y motivo dentro del chat.
- **IA:** si el cliente solo agradece o se despide, responde con una despedida breve y no ofrece productos que no pidió.


### Etapa 5 · Pedidos armados en el chat (2026-10-28, PostgreSQL `034`, MySQL `051`)

- **Interruptor «Vender por WhatsApp»** en los ajustes del agente (`chat_orders`, apagado por defecto; también en los predeterminados de superadmin). Apagado, quien quiere comprar pasa a un asesor como antes.
- **Catálogo sin enlace:** la IA recibe los productos con ficha aprobada y, si tienen landing publicada, su `price_text` (precio de la landing o «desde» la variante más barata disponible), que puede decir tal cual. También recibe `buy` (variantes disponibles, cantidad máxima) del producto elegido.
- **Datos:** la IA pide nombre y apellido, ciudad (y departamento si se repite), dirección, barrio, variante y cantidad; referencia y correo opcionales. No se pide cédula: la integración con Dropi no la envía. Con todo, devuelve `request_quote` y su texto no se envía.
- **Servidor (`WhatsAppChatOrder`):** valida y pregunta lo que falta o es ambiguo (apellido, ciudad repetida, variante, cantidad máxima). Ciudad por nombre DANE (acepta «Cali» por «Santiago De Cali»; con nombre parcial prefiere la capital del departamento). Precio: la oferta del chat (anuncio o código) si es del mismo producto, que fija las unidades (si el total no se reparte en unidades exactas, pasa a un asesor); si no, la landing publicada (precio de la variante). Sin landing publicada, pasa a un asesor. Crea la consulta y el pedido por el mismo camino que el formulario (stock en vivo con Dropi, envío de Dropi o incluido, correo a la tienda, GHL) con `orders.source=whatsapp` y `product_data.origin=whatsapp`; no encola la plantilla de confirmación. Aviso «Un cliente armó un pedido en el chat» (`chat_order`).
- **Resumen y confirmación:** muestra el resumen con «1 SÍ / 2 NO». Los mismos datos muestran el mismo pedido; datos distintos crean otro y cancelan el borrador anterior del chat. «1» confirma (evidencia «1 SÍ»); «2» en un pedido del chat pregunta qué cambiar y la IA sigue, sin asesor.
- **Panel:** etiqueta «WhatsApp» en la lista de pedidos y «Por WhatsApp» en el detalle.
- **Enlace de la landing:** cada producto con landing publicada llega a la IA con su `url` (lo arma el servidor). La IA lo comparte, copiado exacto, solo cuando el cliente pide ver el producto, fotos o más detalles (añadido el 2026-10-28; `whatsapp-agent.mjs` 94).


### Etapa 6A · Avisos de estado del pedido y baja voluntaria (2026-10-28, PostgreSQL `035`, MySQL `052`–`056`)

- **Cuándo:** `DropiTracking::sync` detecta el cambio del estado logístico y llama a `OrderStatusNotices::queue` dentro de su transacción. Estados avisados: guía generada, en camino, novedad y entregado (no «pendiente», «devuelto» ni «cancelado», que ya tiene su correo). Uno por pedido y estado.
- **Correo:** cuatro correos nuevos en «Correos de pedidos» (`buyer_guide`, `buyer_in_transit`, `buyer_novelty`, `buyer_delivered`), activos por defecto y con mensaje adicional opcional. Llevan transportadora, guía o novedad y el enlace de consulta. Solo si el comprador tiene correo.
- **WhatsApp:** tarjeta «Avisos de estado del pedido» en WhatsApp → Confirmaciones (`GET/PUT /api/whatsapp/notices`), los cuatro activos por defecto. Cola `whatsapp_status_notices` procesada por `whatsapp:work`. Dentro de la ventana de 24 h va como texto; fuera, con la plantilla elegida (aprobada, sin botones y con variables de aviso: `nombre`, `pedido`, `estado`, `guia`, `transportadora`, `seguimiento`, `producto`, `tienda`). Sin plantilla se omite con el motivo y el correo sigue. Plantilla sugerida «aviso_estado_pedido» en Plantillas. Un envío que queda «enviando» más de 5 minutos se cierra como fallido sin reintento. Se omite si el pedido está cancelado, el aviso está apagado o ya hay un estado más reciente.
- **Novedad:** además avisa a la tienda (notificación `order_novelty`) y pasa el chat a un asesor.
- **Baja voluntaria:** «stop», «baja», «no me escriban más», «no quiero recibir más mensajes»… marcan `whatsapp_contacts.opted_out_at` y responden la confirmación; «ALTA» la revierte. No frena los avisos de pedidos (decisión del usuario) y servirá a los recordatorios de la etapa 6B. La Bandeja muestra «Dado de baja».


### Etapa 6B · Recordatorios (2026-10-28, PostgreSQL `036`, MySQL `057`)

- **Uno solo** por pedido sin confirmar y por compra a medias (`whatsapp_reminders`, `ref` única, registrada antes de enviar: nunca se repite). Los procesa `whatsapp:work` (`WhatsAppReminders`). Interruptores en WhatsApp → Confirmaciones → «Recordatorios», activos por defecto (guardados con los avisos, `reminders`).
- **Pedido sin confirmar:** 3 horas después del resumen («1 SÍ / 2 NO» en el chat o botones de la plantilla) sin respuesta, con el pedido en borrador. Dentro de la ventana de 24 h: «¿pudiste revisar tu pedido…?» y el resumen otra vez. Fuera: se reenvía la plantilla de confirmación (si hay). Sin plantilla, se registra como no enviado. 24 horas después del recordatorio sin respuesta: estado «Sin respuesta», evento `whatsapp_no_answer` y aviso a la tienda (`order_no_answer`). Si el cliente escribe o el pedido se confirma o cancela, queda «Respondió».
- **Compra a medias:** chat con la IA, con algún dato de compra capturado, sin pedido creado en el último día, sin paso pendiente, cuyo último mensaje fue de la tienda y el cliente calló hace más de 2 horas (y menos de 23): un texto «¿seguimos con tu pedido…?», sin plantilla.
- **Nunca:** a quien se dio de baja, si un asesor tomó el chat o le escribió en las últimas 24 horas, en chats cerrados ni fuera del horario de atención del agente (espera a la apertura mientras siga teniendo sentido).


### Etapa 6C · «Pendientes» (2026-10-28, PostgreSQL `037`, MySQL `058`)

- **Página** `/panel/pendientes` (primer ítem del menú, permiso `orders`; API `GET /api/pending`, `GET /api/pending/count`, `POST /api/pending/review`). Solo lectura: cada ítem enlaza a donde se resuelve y desaparece al resolverse.
- **Secciones, de lo más urgente a lo menos:** chats con asesor donde el cliente escribió último (con aviso si la ventana de 24 h cierra en menos de 2 horas o ya cerró); novedades de Dropi; borradores sin respuesta tras el recordatorio, con «pidió cambios» o sin resumen enviado (motivo); confirmados sin enviar a Dropi y «envío por verificar»; envíos fallidos de los últimos 7 días (mensajes, avisos, recordatorios, correos); plantillas elegidas para confirmaciones o avisos que Meta rechazó, pausó o desactivó. Hasta 50 por sección. Las secciones de WhatsApp se ocultan sin ese permiso.
- **Revisado:** solo para lo que no se resuelve solo (novedad, sin respuesta, cambios, resumen no enviado, envíos fallidos); se guarda en `pending_reviewed` con una clave que incluye la ocurrencia, así un problema nuevo reaparece. Los chats, los envíos a Dropi y las plantillas responden 409.
- **Contador del menú:** solo lo urgente (chats esperando asesor + novedades), cada minuto con la pestaña visible y al marcar un ítem.


### Guía para conectar el número (2026-10-28)

- En WhatsApp → Conexión, «Cómo conectar tu número de Meta» (`WhatsAppGuide.tsx`): pestañas «Número de prueba» (7 pasos) y «Mi número propio» (9 pasos: preparar el número, agregarlo y verificarlo, método de pago, publicar la app). Cada paso dice qué pegar en Tinbana y enlaza a Meta. Abierta mientras no hay número conectado; plegada después. Los nombres de los menús se contrastaron con la guía oficial «Get started» de Meta (2026-10-28); los de publicar la app, método de pago y verificación del negocio no salen en esa página.

### Configuración en Meta (cuando se autorice el piloto real)

1. En la app de Meta: WhatsApp → Configuración → Webhook: URL `https://<dominio>/whatsapp/webhook` y el mismo `WHATSAPP_VERIFY_TOKEN` del servidor; suscribir el campo `messages`.
2. En Tinbana: pegar Phone Number ID, WhatsApp Business Account ID y el token permanente de un usuario del sistema con `whatsapp_business_messaging` y `whatsapp_business_management`; pulsar «Probar conexión».

### Comprobaciones

- `node tests/whatsapp-connection.mjs` (servidor de pruebas con las variables de WhatsApp de prueba y un simulador HTTPS de Graph en 8446): 38 comprobaciones, incluidas las de app propia (clave nunca devuelta, token por cuenta, firma de la app propia, intento de inyectar mensajes en otro número y entrega mixta). Cubre CSRF, validación, token nunca devuelto, prueba solo de lectura, token rechazado, aislamiento entre usuarios, número duplicado, permiso del plan, verificación del webhook, firma ausente o inválida, guardado, 10 entregas repetidas = 1 evento, estados deduplicados, números ajenos ignorados sin contenido, límite de 3 MB, panel en escritorio, modo oscuro y móvil. No contacta a Meta.
- Prueba de humo MySQL en MariaDB 10.11.19 local aislada (127.0.0.1:33307): `schema.sql` + migraciones hasta 030 aplicadas e idempotentes; guardar y cifrar, número duplicado, firma, guardado, deduplicación, JSON con unicode, número ajeno y eliminación (11 comprobaciones).
- MariaDB local: migración 031 aplicada y 4 comprobaciones de app propia.
- **Comprobado por el propietario el 2026-10-26 (no por el asistente):** número de prueba de Meta conectado en producción (Probar conexión correcta), webhook verificado en Meta con la app de la plataforma y mensaje de prueba escrito al número. La recepción en Tinbana no puede verse hasta la etapa 2.
