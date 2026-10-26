# Ventas por WhatsApp

Módulo propio de Tinvana para vender por WhatsApp con la **API oficial de WhatsApp Cloud (Meta)**, sin GHL ni n8n. Requisitos completos en [PROMPT-MODULO-WHATSAPP.md](PROMPT-MODULO-WHATSAPP.md). Se construye por etapas; cada etapa se entrega con pruebas locales aprobadas.

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Datos, conexión del número (credenciales del piloto) y webhook firmado con eventos guardados y deduplicados | Implementada y probada en local |
| 2 | Bandeja: recibir y responder a mano, estados de entrega, ventana de 24 h, tomar y devolver el chat | Pendiente |
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

### Variables de entorno (sin valores en el repositorio)

| Variable | Uso |
|---|---|
| `WHATSAPP_APP_SECRET` | Secreto de la app de Meta de la plataforma; valida las firmas del webhook. |
| `WHATSAPP_VERIFY_TOKEN` | Texto elegido por la plataforma que también se pega en Meta al configurar el webhook. |
| `WHATSAPP_GRAPH_VERSION` | Versión de Graph API, por defecto `v26.0`. |

### Panel

Menú «Ventas WhatsApp» → `/panel/whatsapp/conexion` (con el mismo sistema de tarjetas que Integraciones Dropi y Conexión GHL): estado del número, identificadores, calidad, prueba de conexión, reemplazo de credenciales, eliminación con confirmación, URL del webhook con botón para copiar y estado de la configuración del servidor. El permiso «Ventas por WhatsApp con IA» se activa o desactiva por plan o por cuenta en Administración.

### Configuración en Meta (cuando se autorice el piloto real)

1. En la app de Meta: WhatsApp → Configuración → Webhook: URL `https://<dominio>/whatsapp/webhook` y el mismo `WHATSAPP_VERIFY_TOKEN` del servidor; suscribir el campo `messages`.
2. En Tinvana: pegar Phone Number ID, WhatsApp Business Account ID y el token permanente de un usuario del sistema con `whatsapp_business_messaging` y `whatsapp_business_management`; pulsar «Probar conexión».

### Comprobaciones

- `node tests/whatsapp-connection.mjs` (servidor de pruebas con las variables de WhatsApp de prueba y un simulador HTTPS de Graph en 8446): 28 comprobaciones. Cubre CSRF, validación, token nunca devuelto, prueba solo de lectura, token rechazado, aislamiento entre usuarios, número duplicado, permiso del plan, verificación del webhook, firma ausente o inválida, guardado, 10 entregas repetidas = 1 evento, estados deduplicados, números ajenos ignorados sin contenido, límite de 3 MB, panel en escritorio, modo oscuro y móvil. No contacta a Meta.
- Prueba de humo MySQL en MariaDB 10.11.19 local aislada (127.0.0.1:33307): `schema.sql` + migraciones hasta 030 aplicadas e idempotentes; guardar y cifrar, número duplicado, firma, guardado, deduplicación, JSON con unicode, número ajeno y eliminación (11 comprobaciones).
- **No comprobado:** conexión con Meta real, recepción real de mensajes y despliegue en producción.
