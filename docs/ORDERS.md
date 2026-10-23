# Pedidos: operación local supervisada

## Etapa 2: correcciones, ofertas y variantes

La etapa actual permite editar comprador/dirección de Colombia y devolver confirmados a revisión. Las correcciones se guardan solo en el pedido; no modifican la consulta original ni el webhook ya enviado.

- **Editar comprador y dirección** en borradores: valida email, teléfono y códigos DANE con selectores flotantes buscables. Un cambio real invalida cotización/aceptación; cambiar dirección también elimina el flete. Guardar sin cambios conserva versión y cotización.
- **Devolver a revisión** en confirmados: exige motivo, conserva aceptación/resumen anterior en el historial y vuelve a borrador sin cotización, aceptación ni flete activos. Cancelados no se reabren.
- El historial muestra antes/después, resumen cotizado y aceptación invalidada. El editor abierto bloquea cotizar/confirmar hasta guardar o cancelar.
- El servicio verifica `not_sent` antes de modificar una operación. Ninguna acción local cambia estados externos.
- Variantes y ofertas por cantidad: consultar [PRODUCT-OFFERS.md](PRODUCT-OFFERS.md). Se aplican explícitamente en la cotización, sin modificar automáticamente las landings.
- **Envío a Dropi**: los pedidos confirmados se envían a Dropi como `PENDIENTE CONFIRMACION`; después del envío no se editan ni se cancelan localmente. Ver [DROPI-ORDERS.md](DROPI-ORDERS.md).

Además de la migración 011, aplicar `012_order_offers.sql`. La cotización dura como máximo 24 horas y nunca sobrepasa el fin de una oferta aplicada.

## Implementado

- Migración `011_orders.sql`: `orders` y `order_events`, claves de propietario, índices, RLS y revocación de acceso HTTP de Supabase.
- Cada consulta nueva crea un borrador dentro de la misma transacción que el lead y su entrega al webhook. Repetir la consulta conserva el mismo lead y pedido.
- Las consultas anteriores se convierten explícitamente desde su detalle mediante **Abrir o crear pedido**. No hay importación automática del historial.
- Panel `/panel/pedidos`: filtros por estado y paginación en URL, solicitudes cancelables y estados de carga/error/vacío. Detalle con contacto, dirección y copia del producto.
- Cotización manual de una partida: cantidad, precio público unitario, flete y notas. Cálculo en centavos enteros; PostgreSQL numeric. El total queda pendiente hasta especificar el flete, incluido cero explícito cuando corresponda.
- Cotizaciones identificadas y versionadas, vigencia de 24 horas. Cada modificación exige volver a confirmar. La aceptación se registra manualmente con evidencia y operador; no equivale a aceptación recibida automáticamente por WhatsApp.
- Control de concurrencia con bloqueo de fila y versión esperada. Confirmaciones vencidas, ajenas o sin evidencia se rechazan. Cancelación local con motivo e historial conservado.
- Estados de venta, integración, logística y pago independientes. La integración cambia al enviar a Dropi (`sending`, `sent`, `failed`, `unknown`); logística y pago permanecen en `not_requested` y `pending`.

## Uso

1. Abre una consulta anterior y pulsa **Abrir o crear pedido**, o recibe una nueva consulta desde una landing publicada.
2. Verifica manualmente producto, stock, dirección, cobertura y envío en Dropi.
3. Guarda cantidad, precio público y flete. Comparte el resumen completo con el comprador.
4. Registra su aceptación solo cuando exista, indicando canal, respuesta y referencia disponible.
5. Si la compra no continúa, cancela localmente con motivo.

La dirección ahora se puede corregir en el pedido. Una dirección incompleta no se puede cotizar hasta corregirla. No hay sincronización posterior de los cambios con el webhook del lead: este sigue transmitiendo los datos originales recibidos. El webhook conserva su funcionamiento anterior.

## API privada

- `GET /api/orders?page=1&status=draft` y `GET /api/orders/{id}`.
- `POST /api/orders` con `{lead_id}`: conversión idempotente.
- `POST /api/orders/{id}/quote`: `{version,quantity,unit_price,shipping_price,notes}`; importes decimales sin separadores de miles.
- `POST /api/orders/{id}/confirm`: `{version,quote_id,evidence,accepted:true}`.
- `POST /api/orders/{id}/cancel`: `{version,reason}`.
- `POST /api/orders/{id}/customer`: `{version,first_name,last_name,email,phone,country_code,department_code,city_code,address,address_details,postal_code}`.
- `POST /api/orders/{id}/reopen`: `{version,reason}`.
- `POST /api/orders/{id}/dropi` y `/dropi/resolve`: envío y verificación manual; ver [DROPI-ORDERS.md](DROPI-ORDERS.md).

La cotización acepta también `variant_id`, `use_offer` y `offer_version`. Al usar oferta PHP resuelve el precio autorizado, ignorando el importe unitario enviado por el navegador. El detalle devuelve `order`, `events`, `commercial` y `dropi` (preparación local, no respuesta externa).

Todas las operaciones exigen sesión propietaria y las mutaciones requieren CSRF. La API no recibe estados de integración ni identifica al propietario desde el cuerpo del cliente.

## Instalación y verificación

Ejecutar `php backend/bin/console.php migrate` antes de habilitar el código y compilar con `npm run build`. La migración añade tablas; no convierte consultas existentes. Utiliza el propietario PostgreSQL configurado para las migraciones; un rol de aplicación distinto requerirá sus permisos SQL específicos y políticas acordes.

Pruebas: `npm test` sobre el entorno local aislado; después `php backend/tests/orders-helper.php reset-limits`, `node tests/orders.mjs` y `node tests/order-editing.mjs`. La suite utiliza los leads de la prueba HTTP; la suite ampliada reinicia únicamente pedidos/ofertas de su fixture y prepara variantes locales. Los helpers rechazan bases que no sean locales y terminadas en `_test`. Limpiar con `backend/tests/fixtures.php cleanup`.

## Pendiente: siguientes etapas

La creación de órdenes en Dropi está implementada (ver [DROPI-ORDERS.md](DROPI-ORDERS.md)). Siguen pendientes la consulta automática de cobertura/fletes, guías, sincronización de estados, pagos y cancelaciones desde Tinvana.

Tampoco están implementados todavía empresa con miembros y roles, combos, múltiples partidas, ofertas públicas en landings, atribución de anuncios, webhooks entrantes autenticados de GHL ni agente de WhatsApp. Las ofertas versionadas sí están disponibles para cotización interna. La IA del editor sigue generando contenido de landings. El módulo añadido no usa ni revela credenciales externas.

## Detalle del pedido (rediseño 2026-10-23)

`src/Orders.tsx` (`OrderDetail`) y `src/order-detail.css`, inspirados en la referencia Kofra que aportó el usuario y adaptados a la marca Tinvana:

- **Cabecera:** número corto del pedido, fecha y estados de venta y Dropi.
- **Barra de avance:** Borrador → Cotizado → Aceptado → En Dropi.
- **Tarjeta principal oscura:** total (o «Por cotizar»), vigencia y desglose en chips (producto, envío, precio Dropi).
- **Factura:** con barra de acento naranja.
- **Tarjetas con icono.**
- **Columna lateral:** muestra primero el siguiente paso. En un pedido confirmado, el envío a Dropi; en un borrador, la cotización y la aceptación.
- **Móvil:** resumen, acción y al final el historial.

Conserva las clases y los textos que usan las pruebas.

**Envío sugerido:** el detalle devuelve `shipping_hint`, sacado del texto de envío de la landing publicada (`commerce.shipping` o el campo «Costo de envío» del bloque de envíos). «Gratis», «Incluido» o «Sin costo» dan 0; si no, se toma el primer monto de al menos 1.000. Si el pedido no tiene flete guardado, el campo de la cotización se rellena con ese valor y lo indica. Solo se guarda al guardar la cotización. El catálogo de Dropi no trae un flete por producto. Prueba: `php backend/tests/shipping-hint.php` (9 comprobaciones).
