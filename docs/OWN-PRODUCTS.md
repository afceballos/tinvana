# Productos propios

Productos creados desde cero en Tinbana, sin Dropi. La tienda los vende con su landing, guarda su stock y **los despacha ella misma**. Todo el pedido se maneja en Tinbana: no se envía nada a Dropi.

## Flujo

1. **Mis productos → «Crear producto»** (`/panel/productos/nuevo`):
   - Nombre, descripción, SKU, fotos (hasta 12, se guardan en Mis archivos), precio de venta y costo opcional (muestra la ganancia por unidad).
   - **Variantes opcionales:** hasta 3 opciones (por ejemplo Color y Talla) y una variante por combinación, hasta 100. Cada variante puede tener su propio precio, stock y SKU.
   - **Stock opcional:** sin control de stock, el producto siempre está a la venta.
2. **«Guardar y crear landing»** abre el constructor.
   - La landing empieza con el nombre, la descripción, las fotos y el precio del producto, más el precio propio de cada variante.
   - Desde ahí se edita y se publica igual que una landing de Dropi.
3. **El comprador hace su pedido:**
   - Se crea el pedido con `fulfillment='own'`.
   - Si el stock se controla, el formulario no acepta más unidades de las que quedan.
4. **Confirmación:** se cotiza y se confirma igual que siempre (a mano, por el botón de WhatsApp o en el chat).
   - Al confirmar, el stock baja.
   - El pedido aparece en **Pendientes → «Pedidos propios por despachar»**.
5. **Panel «Envío» del pedido** (reemplaza a «Envío a Dropi»). La tienda marca cada paso:
   - En preparación.
   - Despachado, con transportadora y guía opcionales.
   - En camino.
   - Novedad (con nota obligatoria).
   - Entregado.
   - Devuelto.

   El cliente recibe los mismos avisos por correo y WhatsApp que con el seguimiento de Dropi: guía, en camino, novedad y entregado. La consulta pública del pedido muestra el estado, la transportadora y la guía.

## Reglas

- **Stock (`orders.stock_units` guarda lo que tomó el pedido):**
  - Baja al confirmar.
  - Vuelve si el pedido se cancela, se devuelve o se regresa a revisión.
  - Nunca baja de 0. Si al confirmar no alcanzaba, queda el evento «Stock insuficiente al confirmar».
- **Editar el producto** (icono de lápiz en Mis productos, `/panel/productos/:id/editar`):
  - Actualiza el stock, las variantes y los datos guardados del producto en sus landings, incluida la publicada.
  - Los textos y precios de la landing no cambian, igual que con «Actualizar desde Dropi».
  - Las variantes conservan su ID al añadir valores, así que la landing mantiene sus precios y fotos por variante.
  - Si un pedido se confirma mientras el formulario está abierto, al guardar manda el stock que tiene el formulario.
- **Después de despachado**, el pedido ya no se puede editar ni devolver a revisión. Solo se puede actualizar el envío, o cancelarlo mientras no esté entregado.
- **Envío:** no se cotiza con Dropi; el editor oculta esa opción. Se cobra el valor escrito en «Envío» de la landing («$12.000» o «Gratis»). Si está vacío, se cotiza en el pedido.
- **Desactivado para pedidos propios:**
  - Enviar a Dropi: la API responde 409.
  - «Actualizar desde Dropi»: la API responde 409.
  - Envío automático a Dropi tras la confirmación por WhatsApp.
- **Permisos:**
  - Crear o editar requiere la función `landings` del plan.
  - Cuenta en el límite `products`.
- **Fotos:** una foto en uso por un producto propio no se puede borrar desde Mis archivos.

## Datos

- **Producto:** `selected_products.source='own'`, con `integration_id` y `dropi_id` en `NULL`, comprobado por la restricción de la base.
  - `original_data` guarda una copia con la forma de Dropi más la clave `own` (costo, opciones, variantes y control de stock).
  - `Product::map` la convierte en el mismo formato de siempre, con `source:'own'` y `cost`.
- **Pedido:** `orders.fulfillment` (`dropi` u `own`) y `orders.stock_units`. El estado lo lleva `logistics_status`.
  - La transportadora, la guía y el historial se guardan en `dropi_tracking` con `manual:true`, porque las pantallas y los avisos ya leen esa columna.
- **Migraciones:**
  - PostgreSQL `038_own_products.sql`.
  - MySQL `059_own_products.sql` y `060_orders_fulfillment.sql`.

## API

| Ruta | Uso |
|---|---|
| `POST /api/products/own` | Crea el producto. Cuerpo: `name`, `description`, `price`, `cost`, `sku`, `images[]`, `track_stock`, `stock`, `options[{name,values[]}]` y `variants[{key:"Negro\|S",price,stock,sku}]`. |
| `GET` y `PUT /api/products/{id}/own` | Lee y guarda el formulario. Responde 409 si el producto es de Dropi. |
| `POST /api/orders/{id}/shipping` | `{version,state,carrier?,guide?,note?}`. Estados: `pending`, `guide_generated`, `in_transit`, `novelty`, `delivered` y `returned`. |

**Código:**
- Backend: `backend/src/OwnProducts.php`.
- Panel: `src/OwnProductForm.tsx`, `src/OrderShipping.tsx` y `src/own-product.css`.

## Verificación

Del 2026-11-07, en la base local MariaDB `zenzales_test`:

- **`tests/own-products.mjs`:** 29 comprobaciones. Cubre:
  - Validación y aislamiento entre cuentas.
  - Landing con el precio del producto.
  - Pedido sin Dropi, con el stock que baja y vuelve.
  - Despacho con guía y Pendientes.
  - Variantes con IDs estables.
- **Suites existentes que pasan:**
  - `npm test` 107, `orders` 37, `order-editing` 52, `landing-stock` 24 y `landing-variants` 40.
  - `dropi-orders` 36, `dropi-tracking` 28, `dropi-shipping` 20, `media-delete` 28 y `whatsapp-confirm` 92.
  - `product-list`, `order-lookup` 18 y `store-router` 20.
- **`builder-http` falla** en «duplicate prevention retained», también sin estos cambios: es una de las suites antiguas que ya fallaban.
- **Capturas en navegador:** formulario a 1440 px y 390 px (claro y oscuro), lista, constructor y pedido con el panel de envío. Sin scroll horizontal en celular.
- **No probado:** un correo o WhatsApp real del aviso, ni en producción.
