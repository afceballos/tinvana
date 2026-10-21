# Leads y GoHighLevel

Configura GHL u otro receptor desde `/panel/webhooks`: proveedor, URL HTTPS y estado activo/pausado. Cada usuario tiene un único webhook. Al guardar, una tarjeta resaltada muestra su dominio e identificador, ocultando la parte secreta; el formulario se oculta y quedan las opciones Reemplazar y Eliminar. La URL completa se cifra por usuario y nunca se devuelve al panel. Eliminar la configuración conserva los leads pendientes. El navegador envía el formulario a `/p/{slug}/lead`, con CSRF e `idempotency_key`. PHP valida los campos, comprueba que la página esté publicada y guarda lead + entrega en una transacción. Responde 202: consulta guardada y envío pendiente. La ruta admite JSON y POST HTML para que el formulario funcione sin JavaScript.

Sin configuración o con el webhook pausado, las consultas permanecen pendientes sin gastar intentos. El worker usa exclusivamente la configuración del propietario del lead. Requiere HTTPS público en puerto 443, verifica TLS, fija los destinos DNS públicos y rechaza red privada y redirecciones. No guarda cuerpos de respuesta ni URLs en el historial.

Si ya tienes `GHL_WEBHOOK_URL` en el entorno privado, puedes importarlo explícitamente para una cuenta con `php backend/bin/console.php webhook:import email@dominio.com`. No se usa como destino global compartido.

## Payload del webhook

En Consultas recibidas, cada tarjeta resume contacto, producto, fecha y estado. «Ver detalle» abre un diálogo con dirección, precios e historial. El diálogo admite Escape, conserva un área desplazable y devuelve el foco al botón de apertura. La reprogramación de envíos fallidos se realiza desde el detalle; los estados siguen describiendo la entrega al webhook, no el avance de un pedido ni la creación de una oportunidad en GHL.

| Campo | Uso en GHL |
|---|---|
| `lead_id`, `idempotency_key` | Identificador estable de la consulta para deduplicación |
| `first_name`, `last_name` | Nombre y apellido del contacto |
| `email`, `phone` | Identificación/actualización del contacto |
| `phone_country` | País del teléfono (ISO); `phone` ya incluye el prefijo internacional |
| `address`, `address_details` | Dirección y apartamento/indicaciones; mapear a Address y campo adicional si corresponde |
| `country_code`, `country` | País de entrega: `CO` y `Colombia`; usar el código ISO para el selector Country |
| `state`, `department_code` | Departamento de entrega y su código DIVIPOLA |
| `city`, `city_code` | Municipio de entrega y su código DIVIPOLA |
| `postal_code` | Código postal opcional de seis dígitos, sin perder ceros iniciales |
| `product_id` | ID original de Dropi, campo personalizado |
| `product_name` | Nombre comercial editado de la landing |
| `sku` | SKU de la copia del producto |
| `dropi_product_name` | Nombre original de la copia de Dropi |
| `dropi_price` | Precio de Dropi guardado en la copia; null si no se conoce |
| `public_price` | Precio público configurado en el editor |
| `inflated_price` | El mismo precio público del editor, según la configuración solicitada |
| `image` | URL de imagen principal comercial o null |
| `landing_url` | URL canónica de la landing |
| `tags` | `dropi-product-lead` y `product-{id}` |

## Workflow requerido

1. Configura el trigger de inbound webhook en tu workflow y guarda su URL en la sección Webhook del panel privado.
2. Recibe un lead de prueba autorizado para que GHL permita mapear los campos. No uses secretos del webhook en React.
3. Antes de crear acciones, comprueba si `lead_id` ya fue procesado. Guarda el identificador en un campo/registro que permita reconocer esa consulta, no solo el email. Si ya existe, termina sin crear otra oportunidad.
4. Crea o actualiza el contacto mapeando nombre, apellido, email, teléfono, dirección, ciudad, departamento, país y código postal. Guarda indicaciones, códigos DIVIPOLA y país del teléfono en campos adicionales si los necesitas. Los leads históricos pueden enviar ubicación nula: no sobrescribas una dirección existente con valores vacíos. Configura deduplicación de contactos por email/teléfono conforme a tus reglas.
5. Mapea campos de producto a campos personalizados del contacto/oportunidad; agrega los tags recibidos.
6. Crea/actualiza una oportunidad en el pipeline y etapa que tú elijas. Incluye producto y `lead_id` en la identificación de la oportunidad. Evita crear otra por un reintento del mismo lead.
7. Ejecuta las notificaciones y automatizaciones que correspondan. Verifica el resultado en GHL; el código no configura automáticamente el workflow.

GHL debe conservar los identificadores procesados de una forma compatible con tu workflow. Un único campo «último lead_id» no deduplica bien consultas anteriores que lleguen fuera de orden. El header `Idempotency-Key` se envía, pero no se asume que GHL lo respete.

## Reintentos y precisión del estado

La cola usa PostgreSQL y `FOR UPDATE SKIP LOCKED`. Cada lead tiene una sola entrega, con historial de intentos, código HTTP, error sanitizado y próximo intento. Workers concurrentes reclaman filas distintas. Un lease de cinco minutos permite recuperar un proceso interrumpido. Se reintenta con demoras de 60, 120, 240… segundos, hasta ocho intentos; después queda fallido. El panel permite reprogramar un envío fallido sobre el mismo lead.

La base no duplica una consulta con la misma combinación landing + `idempotency_key`. Se envía siempre el mismo `lead_id` al webhook. Si GHL acepta y la respuesta se pierde, el reintento puede llegar otra vez: sin deduplicación en GHL no se puede garantizar una sola oportunidad externa. Esta es una limitación de cualquier entrega HTTP con reintentos.

`pending`: guardada, esperando cron o reintento. `delivered`: webhook devolvió 2xx; el panel lo llama «Webhook aceptado». `failed`: se agotaron los intentos. Un 2xx no prueba que el workflow creó contacto u oportunidad. Los cuerpos de respuesta externos no se guardan, para evitar registrar secretos o datos personales inesperados; se registra resultado HTTP y error de transporte.

PHP obtiene ID, nombres y precios de las copias guardadas al recibir el lead: ignora valores de producto/precio enviados por el visitante. El precio Dropi no aparece en el HTML público ni se necesita como campo oculto. Las consultas anteriores que no guardaron ese precio mantienen `dropi_price=null`.

El envío real y el workflow de GHL quedan pendientes de configurar. Las pruebas locales verifican ambos precios, aislamiento por usuario, pausa, persistencia, errores 503 y reintentos 200 sin transmitir leads a GHL.
