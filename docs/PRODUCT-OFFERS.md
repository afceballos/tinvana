# Ofertas por cantidad y variantes

## Configuración y alcance

En **Mis productos → Precios por cantidad** (`/panel/productos/{id}/ofertas`) se configura una oferta por producto seleccionado y propietario, con hasta 10 tramos y vigencia opcional. Cada tramo define cantidad mínima y precio público **por unidad**, no total del paquete.

Ejemplo de configuración del comerciante: desde 1 unidad a 50.000 COP; desde 2 unidades a 45.000 COP por unidad. Para 3 unidades se elige el tramo de 2: subtotal 135.000 COP, más el flete cotizado. No se generan descuentos ni beneficios automáticamente.

Los tramos no repiten cantidad y se ordenan en servidor. La cantidad mínima está entre 1 y 100; los importes son positivos y admiten dos decimales. Una oferta activa necesita al menos un tramo. Inicio/fin son opcionales, en ISO con zona horaria; la UI convierte la hora local del dispositivo a UTC. El servidor verifica fechas y que el fin sea posterior al inicio.

Guardar genera una nueva versión y una fila histórica en `product_offer_versions`. Se exige versión esperada para evitar sobrescritura concurrente. Desactivar afecta cotizaciones nuevas, no reescribe las ya emitidas.

## Aplicación al pedido

El operador elige **Aplicar oferta guardada** al cotizar. PHP lee la configuración vigente y resuelve el tramo con mayor mínimo alcanzado; no confía en el precio del navegador cuando se usa oferta. Rechaza versión antigua, oferta fuera de vigencia, desactivada o cantidad insuficiente.

La cotización guarda `offer_snapshot` con versión, precio/tramo y vigencia. El vencimiento del resumen es el menor entre 24 horas y el fin de la oferta. Cambiar la configuración no altera esa copia. Para aplicar una versión nueva se requiere nueva cotización y aceptación. El precio manual sigue siendo una opción explícita del operador.

Desde el 2026-11-18 (Fase A), la landing puede mostrar estas ofertas como paquetes y aplicarlas a sus pedidos; ver «Ofertas en la landing». No hay combos de varios productos, varias partidas ni reglas por variante todavía; los tramos se aplican al producto completo.

## Ofertas en la landing (Fase A, 2026-11-18)

- **Editor:** en «Precio», el interruptor «Mostrar ofertas por cantidad (paquetes)» (`commerce.quantityOffers`) y el selector «Paquete destacado» (`commerce.offerHighlight`, la cantidad mínima del tramo).
  - Los tramos salen del producto; el editor los lista y enlaza a «Precios por cantidad».
  - Avisa si no hay una oferta activa o si la cantidad está desactivada en «Botón y cantidad».
- **Landing (`QuantityOffers::cards`):**
  - Una tarjeta por tramo vigente, dentro de la cantidad máxima, en la caja de compra y en el formulario. Muestra unidades, precio por unidad, total y «Ahorras …» frente al tramo de 1 unidad (o el precio de la landing si no hay tramo de 1), y «Más elegido» en el destacado.
  - Al tocar una tarjeta cambian la cantidad y el precio; el selector − / + mueve la tarjeta marcada. Las flechas del teclado navegan como un grupo de opciones.
  - Los tramos van a la página en `data-packs`, solo como dato de visualización.
- **Servidor (`QuantityOffers::apply`, en `Leads::save`):**
  - Resuelve el tramo con `ProductOffers::resolve` (el de mayor mínimo alcanzado) y fija el precio unitario, que manda sobre el precio de la variante.
  - Guarda `quantity_offer` en el pedido, que pasa a `orders.offer_snapshot` con `source:'landing'`.
  - El flete de Dropi (contraentrega o pago anticipado) se cotiza con el precio del tramo. El pago en línea aplica su descuento sobre el total del paquete (los descuentos se suman), y el Purchase del píxel lleva ese valor.
  - Sin oferta activa, o bajo el primer tramo, el pedido usa el precio de la landing como antes. Los pedidos del chat de WhatsApp no cambian.
- **Pruebas:** `tests/quantity-offers.mjs` (11 comprobaciones).
- **Comprobado en el hosting:** el 2026-11-18, con el commit `544021f` desplegado, el usuario confirmó que funciona bien.
- **Plan:** este apartado reemplaza al plan; las decisiones fueron tarjetas de paquete, descuento de Wompi sumado y la oferta manda sobre las variantes.

## Bloque «Arma tu kit» (Fase B, 2026-11-18)

- **Editor:** sección nueva «Arma tu kit» (`kit` en `backend/blocks.json`).
  - **Tamaños** (`data.sizes`, de 1 a 6): nombre, piezas (de 1 a 30) y precio fijo; sin precio usa el de la landing (`KitSizesEditor`).
  - **Piezas:** son los elementos del bloque: nombre, nota corta, foto, «Máximo por kit» (`quantity`, vacío = sin límite) y «Agotada» (`value='agotada'`).
  - Solo una sección «Arma tu kit» visible por landing, con al menos una pieza disponible (`Blocks::validate`, `Kits::sizes`).
- **Landing (`LandingRenderer::kit`, `src/landing-kit.ts`):**
  - 1. Tamaño (tarjetas). 2. Piezas con − / +, barra de progreso «3 de 6» y resumen.
  - El + se bloquea al llegar al máximo de la pieza o al completar el kit; las piezas agotadas no se pueden elegir.
  - Cualquier botón «Pedir» espera el kit completo: lleva al bloque y dice cuántas piezas faltan.
  - El formulario recibe la elección en `kit` (JSON) y muestra la composición y el total. La cantidad queda fija en 1 kit.
  - En una landing con kit no se muestran los paquetes de ofertas por cantidad.
- **Servidor (`Kits::apply`, en `Leads::save`):**
  - Valida el tamaño, que las piezas existan y estén visibles, que no estén agotadas, el máximo por pieza, que la suma sea exacta y que sea un kit por pedido.
  - Fija el precio del tamaño y guarda `product_data.kit` (tamaño, piezas y texto «Kit de 6: 2 × Reno, …»).
  - Pago en línea: el descuento de Wompi se suma sobre el precio del kit.
- **Dónde aparece la composición:** detalle del pedido («Kit armado»), correos y página de seguimiento del cliente (en lugar de la variante), el valor `variante` de la confirmación por WhatsApp y las notas del pedido en Dropi.
- **Sin migraciones:** todo vive en el contenido de la landing y en `product_data`.
- **Pruebas:** `tests/kit-builder.mjs` (17 comprobaciones). `tests/builder.mjs` cuenta ahora 21 tipos de sección.
- **Decisiones del usuario:** precio fijo por tamaño; piezas repetibles con máximo opcional; un kit por pedido; sin stock por pieza (solo «Agotada» a mano).

## Plan anterior: bloque «Arma tu kit» (Fase B, decisiones del 2026-11-18)

- **Precio:** fijo por tamaño de kit (por ejemplo, Kit de 3 a $70.000 y Kit de 6 a $120.000), sin importar qué piezas elija el cliente.
- **Piezas:** se pueden repetir, con un máximo opcional por pieza que define la tienda.
- **Cantidad:** un kit armado por pedido.
- **Stock:** sin stock por pieza por ahora; la tienda puede marcar una pieza como agotada a mano.
- **Pedido:** la composición del kit viaja en el pedido, los correos, la confirmación por WhatsApp y las notas para Dropi o el despacho propio. El servidor la valida contra la configuración del bloque.

## Plan anterior: ofertas en la landing (Fase A, decisiones del 2026-11-18)

- **Formato:** tarjetas de paquete en la landing y el formulario, una por tramo, con precio por unidad, total y ahorro. Opcionalmente un tramo marcado como «Más elegido».
- **Descuento de Wompi:** se suma. Primero el precio del tramo y encima el % de pago en línea.
- **Variantes con precio propio:** manda el precio del tramo.
- **Servidor:** el precio del tramo se aplica en el servidor al crear el pedido (cotización y `offer_snapshot`). Debe funcionar con contraentrega, Wompi, el píxel y Dropi.
- Fases siguientes guardadas: B «Arma tu kit», C chat de IA en el editor y D asistente de IA para la plataforma.

## Variantes

El selector de cotización utiliza IDs presentes en `mapped_data.variations` del producto seleccionado. Se guardan ID, etiqueta y SKU mínimo, sin exponer JSON completo adicional. Si no hay etiqueta conocida, se muestra `Variante {id}`; no se inventan atributos.

Una variante enviada debe pertenecer al producto. Si hay variantes o el tipo es `VARIABLE`, se exige seleccionar una. Si no hay IDs válidos para un producto variable, actualizar su catálogo antes de cotizar; no se permite inventar un ID.

Esta comprobación es contra la copia guardada del catálogo: no verifica stock ni acredita que el ID sea admitido por una API de órdenes aún no validada. La cotización/evento conserva la variante elegida aunque cambie la lista del catálogo. La preparación para Dropi comprueba si la selección sigue presente.

## API y esquema

`GET /api/products/{selected_id}/offers`: producto mínimo, versión (0 si no existe), settings y variantes.

`PUT /api/products/{selected_id}/offers`:

```json
{
  "version": 0,
  "settings": {
    "active": true,
    "tiers": [{"min_quantity": 1, "unit_price": "50000.00"}],
    "starts_at": null,
    "ends_at": null
  }
}
```

El ejemplo es ilustrativo, no una promoción cargada en producción. Sesión, propiedad y CSRF obligatorios; precio decimal sin separadores de miles.

Migración 012: `product_offers`, `product_offer_versions`, `orders.variant_data` y `orders.offer_snapshot`. FKs de propietario, versiones, RLS y revocación de roles HTTP del proveedor. Los locks serializan guardado de versiones y lectura de oferta durante cotización.
