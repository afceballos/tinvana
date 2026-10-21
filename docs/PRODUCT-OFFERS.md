# Ofertas por cantidad y variantes

## Configuración y alcance

En **Mis productos → Precios por cantidad** (`/panel/productos/{id}/ofertas`) se configura una oferta por producto seleccionado y propietario, con hasta 10 tramos y vigencia opcional. Cada tramo define cantidad mínima y precio público **por unidad**, no total del paquete.

Ejemplo de configuración del comerciante: desde 1 unidad a 50.000 COP; desde 2 unidades a 45.000 COP por unidad. Para 3 unidades se elige el tramo de 2: subtotal 135.000 COP, más el flete cotizado. No se generan descuentos ni beneficios automáticamente.

Los tramos no repiten cantidad y se ordenan en servidor. La cantidad mínima está entre 1 y 100; los importes son positivos y admiten dos decimales. Una oferta activa necesita al menos un tramo. Inicio/fin son opcionales, en ISO con zona horaria; la UI convierte la hora local del dispositivo a UTC. El servidor verifica fechas y que el fin sea posterior al inicio.

Guardar genera una nueva versión y una fila histórica en `product_offer_versions`. Se exige versión esperada para evitar sobrescritura concurrente. Desactivar afecta cotizaciones nuevas, no reescribe las ya emitidas.

## Aplicación al pedido

El operador elige **Aplicar oferta guardada** al cotizar. PHP lee la configuración vigente y resuelve el tramo con mayor mínimo alcanzado; no confía en el precio del navegador cuando se usa oferta. Rechaza versión antigua, oferta fuera de vigencia, desactivada o cantidad insuficiente.

La cotización guarda `offer_snapshot` con versión, precio/tramo y vigencia. El vencimiento del resumen es el menor entre 24 horas y el fin de la oferta. Cambiar la configuración no altera esa copia. Para aplicar una versión nueva se requiere nueva cotización y aceptación. El precio manual sigue siendo una opción explícita del operador.

Las ofertas no cambian automáticamente el precio ni el formulario de las landings. No hay combos de varios productos, varias partidas ni reglas por variante todavía; los tramos se aplican al producto completo.

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
