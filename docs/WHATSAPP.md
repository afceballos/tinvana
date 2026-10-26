# Ventas por WhatsApp

Módulo propio de Tinvana para vender por WhatsApp con la **API oficial de WhatsApp Cloud (Meta)**, sin GHL ni n8n. Requisitos completos en [PROMPT-MODULO-WHATSAPP.md](PROMPT-MODULO-WHATSAPP.md). Se construye por etapas; cada etapa se entrega con pruebas locales aprobadas.

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Datos, conexión del número (credenciales del piloto) y webhook firmado con eventos guardados y deduplicados | Implementada y probada en local |
| 2 | Bandeja: recibir y responder a mano, estados de entrega, ventana de 24 h, tomar y devolver el chat | Implementada y probada en local |
| 3 | Agente de IA, fichas de producto aprobadas y ajustes | Pendiente |
| 4 | Anuncios → oferta y códigos de oferta (incluido el botón de WhatsApp de la landing) | Pendiente |
| 5 | Cotización, confirmación, pedido con origen WhatsApp y envío a Dropi con revisión | Pendiente |
| 6 | Plantillas, recordatorios, avisos de estado Dropi, consentimiento y bandeja de operación | Pendiente |
| 7 | Copia opcional a GHL, documentación y regresión completa | Pendiente |

Fuera de alcance: Embedded Signup (registro guiado con Facebook) y registro como proveedor tecnológico de Meta. El botón «Conectar con Meta» aparece deshabilitado como «Próximamente».

## Contrato con Meta (documentación oficial consultada el 2026-10-26)

- Graph API `v26.0` (la vigente en esa fecha). Base `https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/`.
- Prueba de conexión (solo lectura): `GET /{phone_number_id}?fields=verified_name,display_phone_number,quality_rating` con `Authorization: Bearer`.
- Verificación del webhook: `GET` con `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge`; se responde 200 con el `challenge` solo si el token coincide.
- Entregas: `POST` firmado con `X-Hub-Signature-256: sha256=<HMAC-SHA256 del cuerpo crudo con el secreto de la app>`. Meta reintenta hasta 7 días y puede repetir eventos; cargas de hasta 3 MB.
- Lo que no esté en la documentación oficial no se programa por suposición (por ejemplo, el listado de plantillas se confirmará en la etapa 6).

## Etapa 1

### Datos (PostgreSQL `020_whatsapp_core.sql`; MySQL `026`–`030`)

- `whatsapp_accounts`: un número por usuario y un usuario por `phone_number_id`; `waba_id`, nombre verificado, número visible, calidad, token cifrado, estado `pending/connected/error`, último error y última prueba, origen `manual/embedded_signup`.
- `whatsapp_events`: cada mensaje o estado entrante, una sola vez (`dedupe_key` única: `msg:<wamid>` o `st:<wamid>:<estado>`), con estado `pending/processing/done/ignored/failed`, intentos y bloqueo para el procesamiento de la etapa 2.
- `whatsapp_contacts`, `whatsapp_conversations` y `whatsapp_messages`: creadas ya con aislamiento por propietario (claves compuestas `id,user_id`); se llenan desde la etapa 2.
- PostgreSQL: RLS activado y permisos revocados a roles HTTP del proveedor, como en las demás tablas.

### Servidor

- `WhatsAppGraph`: cliente HTTPS de Meta (TLS verificado, sin redirecciones, tiempo límite). Solo fuera de producción admite `WHATSAPP_GRAPH_URL=https://127.0.0.1:<puerto>/` para el simulador de pruebas.
- `WhatsAppAccount`: guardar, probar y eliminar el número. El token se cifra con `Crypto` (contexto `id:usuario`) y nunca se devuelve. Al cambiar credenciales el estado vuelve a «Sin probar». Eliminar el número borra sus conversaciones y mensajes en Tinvana (no en Meta).
- `WhatsAppWebhook` en `GET|POST /whatsapp/webhook` (público, sin sesión, antes de `Auth::start`):
  - firma inválida o ausente → 401 y no se guarda nada; más de 3 MB → 413;
  - el dueño se identifica por `phone_number_id` **y** el `waba_id` de la entrada;
  - eventos de números no conectados se guardan solo como marca de duplicado (`ignored`, sin contenido);
  - responde `200 EVENT_RECEIVED` y luego libera la conexión (`fastcgi_finish_request`/`litespeed_finish_request`) antes de procesar. El procesamiento llega en la etapa 2; hasta entonces los eventos quedan `pending`.
- API del panel (requiere el permiso `whatsapp` del plan; CSRF en escrituras; límites por usuario): `GET|PUT|DELETE /api/whatsapp/account`, `POST /api/whatsapp/account/test`.

### Números en la app de Meta de otra persona (021 / MySQL 031)

Cada tienda puede conectar un número que esté en **su propia app de Meta**:

- En Conexión pega, además de sus credenciales, la **clave secreta de su app** (opcional; cifrada y nunca devuelta).
- Tinvana le genera un **token de verificación propio** (`tv…`), que solo ve esa cuenta, para configurar el webhook de su app con la misma URL `/whatsapp/webhook`.
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

### Comprobaciones de la etapa 2

- `node tests/whatsapp-inbox.mjs` (simulador de Graph en 8446 que registra envíos y devuelve `wamid`): 46 comprobaciones. Incluyen: evento repetido diez veces = un mensaje, tipos no compatibles, aislamiento entre tiendas, filtros y búsqueda, sello de consulta, emisor único, versión vieja, CSRF, envío exacto a Meta, idempotencia, estados que no retroceden, fallo con motivo, error 5xx sin reintento, rechazo de Meta, estado anticipado sin bloquear la cola, ventana cerrada y reabierta, devolver a la IA, cron, permiso del plan, actualización en vivo, consultas que no renuevan la sesión y panel en claro, oscuro y móvil.
- MariaDB 10.11.19 local: 10 comprobaciones de la bandeja (reclamo con `SKIP LOCKED`, lista, sello, búsqueda, detalle, tomar, respuesta con resultado desconocido, idempotencia y ventana cerrada).

### Configuración en Meta (cuando se autorice el piloto real)

1. En la app de Meta: WhatsApp → Configuración → Webhook: URL `https://<dominio>/whatsapp/webhook` y el mismo `WHATSAPP_VERIFY_TOKEN` del servidor; suscribir el campo `messages`.
2. En Tinvana: pegar Phone Number ID, WhatsApp Business Account ID y el token permanente de un usuario del sistema con `whatsapp_business_messaging` y `whatsapp_business_management`; pulsar «Probar conexión».

### Comprobaciones

- `node tests/whatsapp-connection.mjs` (servidor de pruebas con las variables de WhatsApp de prueba y un simulador HTTPS de Graph en 8446): 38 comprobaciones, incluidas las de app propia (clave nunca devuelta, token por cuenta, firma de la app propia, intento de inyectar mensajes en otro número y entrega mixta). Cubre CSRF, validación, token nunca devuelto, prueba solo de lectura, token rechazado, aislamiento entre usuarios, número duplicado, permiso del plan, verificación del webhook, firma ausente o inválida, guardado, 10 entregas repetidas = 1 evento, estados deduplicados, números ajenos ignorados sin contenido, límite de 3 MB, panel en escritorio, modo oscuro y móvil. No contacta a Meta.
- Prueba de humo MySQL en MariaDB 10.11.19 local aislada (127.0.0.1:33307): `schema.sql` + migraciones hasta 030 aplicadas e idempotentes; guardar y cifrar, número duplicado, firma, guardado, deduplicación, JSON con unicode, número ajeno y eliminación (11 comprobaciones).
- MariaDB local: migración 031 aplicada y 4 comprobaciones de app propia.
- **Comprobado por el propietario el 2026-10-26 (no por el asistente):** número de prueba de Meta conectado en producción (Probar conexión correcta), webhook verificado en Meta con la app de la plataforma y mensaje de prueba escrito al número. La recepción en Tinvana no puede verse hasta la etapa 2.
