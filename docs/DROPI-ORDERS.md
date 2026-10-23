# Envío de pedidos a Dropi

## Flujo

1. La consulta de la landing crea un borrador de pedido.
2. El operador cotiza (cantidad, precio, envío y variante) y registra la aceptación del comprador. Más adelante esta aceptación podrá llegar del chatbot.
3. En **Envío a Dropi** revisa la vista previa (destinatario, dirección, departamento y ciudad tal como se enviarán, producto, valor a recaudar) y marca la casilla de revisión.
4. **Enviar a Dropi** crea la orden en Dropi con estado `PENDIENTE CONFIRMACION` y cobro `CON RECAUDO` (contra entrega). Ambos valores los eligió el usuario el 2026-10-23.
5. El usuario confirma la orden en su panel de Dropi, que es cuando Dropi genera la guía.

## Contrato usado

No hay documentación oficial pública de la API de órdenes. El contrato se tomó del código fuente del plugin de WordPress **Dropify** (`wc-dropi-integration` 4.7.3, publicado en wordpress.org), que crea órdenes en Dropi en tiendas reales:

- `POST https://api.dropi.co/integrations/orders/myorders`.
- Cabecera `dropi-integration-key` con el mismo token de integración que ya usa el catálogo; cuerpo JSON.
- Campos: `total_order`, `notes`, `name`, `surname`, `dir`, `country`, `state`, `city`, `phone`, `client_email`, `payment_method_id=1`, `status`, `type=FINAL_ORDER`, `rate_type`, `products`, `calculate_costs_and_shiping=true`, `supplier_id`, `create_product_if_not_exist=false`.
- `products`: el objeto del producto tal como lo devolvió el catálogo (`selected_products.original_data`), con `name`, `quantity`, `price` y `variation_id` cuando hay variante. Como hace el plugin, el envío cobrado al cliente se reparte en el precio unitario para que la suma sea igual a `total_order`.
- `supplier_id`: el `user_id` del producto en Dropi. Si el producto no lo tiene, hay que actualizar sus datos desde Dropi.
- Respuesta: `isSuccess` y `objects.id` con el número de orden de Dropi.
- `state` y `city`: el plugin envía el código de departamento de WooCommerce (`ANT`, `CUN`, `VAC`…) y el nombre del municipio de su propia lista. `backend/resources/geo/dropi-co.json` traduce los códigos DANE a esos valores: 1015 de 1122 municipios. Bogotá se envía como `CUN`/`Bogota`. Los municipios sin equivalencia se envían con el nombre DANE.
- `notes` lleva la referencia `Tinvana xxxxxxxx` y la variante. Las notas internas del pedido no se envían.

Desde este equipo no se ha llamado a ese endpoint. La primera orden real confirmará el formato de ciudades y la respuesta.

## Estados y duplicados

`integration_status`: `not_sent` → `sending` → `sent` | `failed` | `unknown`.

- `sent`: Dropi respondió con éxito y número de orden, que se guarda en `orders.dropi_order_id`.
- `failed`: rechazo explícito (`isSuccess=false`, HTTP 4xx) o fallo de conexión antes de enviar (DNS, conexión, TLS). Dropi no creó nada y se permite reenviar.
- `unknown`: timeout, HTTP 5xx, respuesta no JSON o éxito sin número. **No se reintenta**: la API no tiene clave de idempotencia y la orden pudo crearse. El operador la busca en Dropi y registra **la orden sí existe** (con su número) o **no existe** (vuelve a `failed`). Un envío que quedó en `sending` más de 2 minutos (proceso interrumpido) se trata igual.
- Con `sending`, `sent` o `unknown` no se puede editar, cotizar, devolver a revisión ni cancelar localmente. Los cambios de una orden ya creada se hacen en Dropi.
- Cada intento queda en el historial: `dropi_submit_started`, `dropi_sent`, `dropi_rejected`, `dropi_unknown` y `dropi_resolved`.

El token nunca llega al navegador ni a los logs; los mensajes de Dropi se guardan con el token redactado.

## API

- `POST /api/orders/{id}/dropi` `{version, confirm:true}`: envía la orden. Requiere pedido confirmado, cotización vigente, dirección de Colombia, variante cuando aplica y producto con proveedor.
- `POST /api/orders/{id}/dropi/resolve` `{version, outcome:'created'|'not_created', dropi_order_id?, note}`: solo con resultado desconocido.
- `GET /api/orders/{id}` devuelve en `dropi`: `status`, `can_submit`, `can_resolve`, `dropi_order_id`, `checks`, `preview` (lo que se enviará o se envió) y `last` (último resultado).

## Instalación

Migración `015_dropi_order_submission` en PostgreSQL (`backend/migrations`) y MySQL (`backend/mysql/migrations`): amplía los valores de `integration_status` y añade `dropi_order_id` e `integration_data`. En el servidor: desplegar y ejecutar `php ~/tinvana/bin/console.php migrate`.

## Pruebas

- `php backend/tests/dropi-orders.php`: 27 comprobaciones sin base ni red (formato del cuerpo, ciudades, clasificación de respuestas, redacción del token).
- `node tests/dropi-orders.mjs`: 36 comprobaciones contra un Dropi simulado (HTTPS local en 8443) y PostgreSQL aislado, incluida la interfaz en escritorio y móvil. Requiere el servidor de pruebas iniciado con `DROPI_ORDERS_URL=https://127.0.0.1:8443/integrations/orders/myorders` y `HTTP_CA_BUNDLE=.tools/test-cert.pem`. Esa variable solo se acepta fuera de producción y apuntando a `127.0.0.1`.

## Pendiente

- [ ] Primera orden real de prueba en producción, con autorización del usuario: comprobar que Dropi la acepta, que departamento y ciudad quedan bien y que se puede confirmar o cancelar desde su panel.
- [ ] Sincronizar estados, guía y novedades desde Dropi. El plugin no lo hace; hay que encontrar el endpoint o webhook.
- [ ] Cancelación desde Tinvana, varias partidas por pedido y aprobación automática por chatbot.
- [ ] Pago anticipado (`SIN RECAUDO`) si se necesita.

## Fuentes revisadas

- Plugin Dropify en wordpress.org (`https://downloads.wordpress.org/plugin/wc-dropi-integration.zip`), archivos `clasess/models/OrdersModel.php`, `clasess/Constants.php`, `states/CO.php` y `places/CO.php`, revisados el 2026-10-23.
- [Documento de Scribd aportado por el usuario](https://es.scribd.com/document/683043719/Documentacion-de-Dropi-docx-7): su contenido no es accesible sin sesión. Referencia histórica.
- [Dropi MCP](https://dropi.co/cr/mcp-claude): alternativa oficial con OAuth, no evaluada.

## Descubrimiento del estado de las órdenes (2026-10-23)

El usuario confirma que los pedidos ya llegan a Dropi. Para mostrar en Tinvana el estado, la guía y el historial hay que confirmar primero cómo se consultan. Copias no oficiales de la documentación mencionan `GET /orders/myorders` (lista, con `result_number` y `start`) y consultas por ID y por guía. También mencionan `PUT /orders/myorders/{id}`, que **cambia el estado** (genera la guía) y nunca debe usarse para consultar.

Comando de solo lectura: `php bin/console.php dropi:order-probe [orden_dropi]`. Usa el último pedido enviado (o el indicado) y su integración, y hace dos `GET`: `orders/myorders/{id}` y `orders/myorders?result_number=3&start=0`. Muestra los nombres de los campos y solo los valores de estado, guía, transportadora, novedad, historial e ID; nunca datos del comprador ni el token.
