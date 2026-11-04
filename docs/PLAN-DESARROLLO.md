# Tinbana: plan de desarrollo por fases

Documento vivo para revisar, fase por fase, si cada parte es posible y en qué orden hacerla.

- **Origen:** propuesta del equipo del 29 oct 2026 (10 fases). El objetivo es que un dropshipper de contraentrega use un solo panel en lugar de 6 a 10 herramientas (proveedor, WhatsApp, formulario, finanzas, investigación, creativos, logística y anuncios).
- **Evaluación de viabilidad:** 2026-11-03, contrastada con el código. No incluye consultas a terceros: todo lo que depende de una API externa sigue sin confirmar.
- **Leyenda:** 🟢 viable con lo que tenemos · 🟡 viable con trabajo grande o un trámite externo · 🔴 difícil o prematuro.
- **Uso:** marcar `[x]` solo lo implementado y comprobado. Anotar cada decisión en «Decisiones» con su fecha.

## Correcciones al supuesto del plan

El plan da por hechas cosas que hoy **no existen** en Tinbana (revisado el 2026-11-03):

- [ ] Integración con Shopify. Hoy solo está integrado Dropi.
- [ ] Módulo de finanzas.
- [ ] Bandeja multiagente. Hoy hay un usuario por cuenta.
- [ ] Campos `store_id` y `currency` en las tablas. Hoy todo se separa por usuario: una cuenta es una tienda.
- [ ] UTM guardados en el pedido.
- [ ] Envío de la compra a Meta o TikTok (píxel o API de Conversiones).

## Principios técnicos propuestos

| Principio | Estado hoy | Nota |
|---|---|---|
| Modelo de datos único con adaptadores | ❌ | Dropi tiene sus propias clases (`Dropi*`). Hay que generalizar antes de sumar el segundo proveedor. |
| Multi-país desde el inicio (`store_id`, `country`, `currency`) | ❌ | Mientras más tarde se agregue, más cara es la migración. |
| Eventos y colas con reintentos e idempotencia | 🟡 Parcial | El webhook de WhatsApp deduplica eventos y hay colas de confirmación. No hay una cola general. |
| Estados de pedido normalizados | 🟡 Parcial | Hay estados locales y estados de Dropi. Falta el listado único del plan. |
| Guardar historial con fecha | 🟡 Parcial | Se guardan las conversaciones, las confirmaciones y el seguimiento de Dropi. Faltan los movimientos de dinero. |

## Resumen de viabilidad

| Fase | Viabilidad | Estado hoy |
|---|---|---|
| 1. Proveedores y tiendas | 🟡 | Dropi hecho y atado a sus campos; Shopify no existe |
| 2. Venta y confirmación por WhatsApp | 🟢 | ~70 % hecho |
| 3. Utilidad real | 🟢 | No existe; todo es interno |
| 4. Formulario con upsells | 🟢 en landings / 🟡 en Shopify | El formulario y las ofertas por cantidad existen en las landings |
| 5. Investigación de productos | 🟡 | Solo comprando datos a un tercero |
| 6. Creativos con IA | 🟢 texto / 🟡 imagen / 🔴 video | Ya hay IA para landings |
| 7. Logística | 🟢 para Dropi / 🟡 para envíos propios | Seguimiento Dropi y avisos al cliente existen |
| 8.0 Gasto y ROAS real | 🟡 | Requiere la revisión de la app por parte de Meta y TikTok |
| 8.1 Lanzar anuncios | 🔴 | Permisos avanzados y riesgo de gastar dinero real |
| 9. Riesgo de devolución | 🟢 reglas / 🔴 modelo de IA | Faltan datos: producción tiene 10 pedidos (copia del 2026-10-30) |
| 10. Multi-tienda y multi-país | 🟡 | Migración grande de casi todas las tablas |

---

## Fase 1 · Integraciones con proveedores y tiendas — 🟡

**Objetivo:** vender productos de cualquier proveedor de contraentrega sin salir de Tinbana, y que el pedido llegue solo al proveedor correcto.

**Qué pide el plan:**
- Conectar Effi, Mastershop, Hoko, Triidy y Venndelo, en ese orden.
- Un buscador único de catálogo: costo, precio sugerido, stock, bodega y ciudad.
- Importar a Shopify con un clic.
- Enviar el pedido al proveedor y traer de vuelta su estado y la guía.
- Sincronizar stock y precio, con aviso cuando un producto se agota o cambia de costo.

**Estado hoy:** Dropi tiene catálogo, envío de órdenes, cotización de flete y seguimiento. Todo está atado a sus campos. Shopify no existe.

**Viabilidad:**
- **Lo propio es viable:** el modelo común y el paso de Dropi a primer adaptador.
- **El freno es externo:** no está confirmado qué plataformas dan API. Sin API habría que buscar una alianza; el plan descarta el scraping.
- **Shopify se construye desde cero:** una app de Shopify con permisos de pedidos y productos.

**Ejemplo:** un pedido con un producto de Mastershop entra por la landing. Tinbana sabe que ese producto es de Mastershop y lo envía por su API, igual que hoy lo hace con Dropi.

**Pendiente:**
- [ ] Preguntar a cada plataforma si tiene API pública o de partners.
- [ ] Diseñar el modelo común (producto, variante, proveedor, pedido) y migrar Dropi a adaptador.
- [ ] Decidir si se hace la app de Shopify y quién crea la orden cuando el pedido viene de Shopify.

## Fase 2 · Venta y confirmación por WhatsApp — 🟢

**Objetivo:** confirmar cada pedido antes de despacharlo, con IA, para reducir devoluciones.

**Ya existe:**
- API oficial de Meta (Cloud API).
- Plantillas aprobadas.
- Confirmación automática del pedido de la landing.
- IA con acciones concretas: confirmar, corregir dirección, cancelar y cerrar ante «no me interesa».
- Recordatorios.
- Avisos de estado del pedido.
- Paso a asesor humano.

Detalle en [WHATSAPP.md](WHATSAPP.md).

**Falta:**
- [ ] Bandeja multiagente: varios usuarios por cuenta, asignación de chats, etiquetas y notas. Toca cuentas y permisos.
- [ ] Reporte del porcentaje confirmado o cancelado sin humano. La meta del plan es el 80 %.
- [ ] Llamada como opción. Requiere otro proveedor y tiene costo.
- [ ] Que la confirmación o cancelación frene o libere el despacho en el proveedor. Ver la fase 1.

**Ejemplo:** el cliente pide hablar con alguien y el chat pasa al asesor libre, con el pedido y la conversación a la vista.

## Fase 3 · Utilidad real — 🟢

**Objetivo:** mostrar cuánto se gana de verdad por pedido, producto y día.

**Qué pide el plan:**
- El ingreso cuenta solo al entregar.
- La devolución cuenta como pérdida.
- Se restan todos los costos: producto, flete, recaudo, WhatsApp y anuncios.
- Panel de margen y tasas de entrega y devolución.
- Proyección de lo que sigue en camino.
- Conciliación de recaudos.

**Viabilidad:** alta, porque no depende de nadie externo. El estado «entregado» ya llega del seguimiento de Dropi.

**Cómo hacerlo:**
- Una tabla de movimientos por pedido, para poder auditar cada peso.
- El gasto en anuncios se carga a mano mientras llega la fase 8.

**Ejemplo:** pedido de $89.900, entregado.
- Costos: $35.000 de producto, $12.000 de flete, la comisión de recaudo y $8.000 de anuncios.
- Utilidad: $34.900 menos la comisión.
- Si el pedido se devuelve, se registra −$24.000 por los fletes de ida y vuelta.

**Pendiente:**
- [ ] Paso 1: movimientos, panel y gasto manual.
- [ ] Paso 2: completar con la fase 7 (entregas) y la fase 8 (gasto automático).

## Fase 4 · Formulario contraentrega con upsells — 🟢 en landings / 🟡 en Shopify

**Objetivo:** compra en un clic y más valor por pedido.

**Ya existe en las landings:**
- Formulario.
- Ofertas por cantidad.
- Validación de dirección y cobertura.
- Paso directo a la confirmación por WhatsApp.

**Falta:**
- [ ] Upsell de un clic antes de confirmar.
- [ ] Bloqueo de pedidos duplicados.
- [ ] Evento de compra a Meta (API de Conversiones) y a TikTok (Events API), con el mismo ID que el píxel.
- [ ] Guardar UTM en el pedido. Es necesario para la fase 8.
- [ ] Bloque de app en Shopify. Depende de la app de Shopify de la fase 1.

**Ejemplo:** antes de confirmar aparece «Agrega un segundo cargador por $19.900» y un botón de sí o no.

## Fase 5 · Investigación de productos y anuncios — 🟡

**Objetivo:** elegir qué producto vender con datos.

**Viabilidad:**
- **No conviene el rastreo propio:** es caro, se rompe y va contra los términos de Meta y TikTok.
- **Lo viable es licenciar datos** de un proveedor especializado por API, y usar las fuentes oficiales: la Biblioteca de Anuncios de Meta y el Creative Center de TikTok.
- **El diferenciador propio llega después,** con volumen: datos agregados y anónimos de entrega y devolución por producto dentro de Tinbana.

**Ejemplo:** «este producto se entrega el 78 % de las veces en Bogotá», con datos de las tiendas de Tinbana.

**Pendiente:**
- [ ] Elegir el proveedor de datos y su costo.
- [ ] Botón «vender este producto». Depende de las fases 1 y 4.

## Fase 6 · Creativos con IA — 🟢 texto / 🟡 imagen / 🔴 video

**Objetivo:** producir anuncios y contenidos dentro de Tinbana.

**Viabilidad por tipo:**
- **Texto:** ángulos, copys y guiones. Muy viable, porque ya hay IA conectada para las landings.
- **Imágenes:** 1:1, 4:5 y 9:16. Viables por API, con costo por imagen.
- **Video UGC:** caro y de calidad irregular. Conviene dejarlo de último o integrar una herramienta externa.

**Ejemplo:** «Genera 3 ángulos para este masajeador»: dolor de espalda, regalo y relajación en casa.

**Pendiente:**
- [ ] Revisar que las plantillas no prometan resultados de salud que Meta rechaza.

## Fase 7 · Gestión logística — 🟢 para Dropi / 🟡 para envíos propios

**Objetivo:** ver todos los envíos en un solo lugar y actuar rápido ante novedades.

**Ya existe:** el seguimiento de Dropi y los avisos de estado al cliente por WhatsApp.

**Falta:**
- [ ] Tablero de envíos con estados normalizados.
- [ ] Reacción automática a novedades por WhatsApp.
- [ ] Página de seguimiento e indicadores por transportadora y ciudad.
- [ ] Guías propias mediante un agregador de transportadoras con API. Proveedor por elegir.

**Ejemplo:** la transportadora reporta «dirección errada» y la IA le escribe al cliente para corregirla antes de que el pedido se devuelva.

## Fase 8 · Anuncios: gasto, ROAS real y lanzamiento

### 8.0 Gasto y ROAS real — 🟡

**Qué pide el plan:**
- Conectar Meta y TikTok por OAuth.
- Traer el gasto por anuncio.
- Relacionar cada pedido con su anuncio.
- Calcular el ROAS con solo lo entregado.

**Freno:** Meta y TikTok exigen revisar la app para leer los anuncios de otras cuentas, y eso puede tardar semanas.

**Ejemplo:** Meta reporta un ROAS de 3,2. Con solo lo entregado, el ROAS real es 1,9.

**Pendiente:**
- [ ] UTM en el pedido (fase 4).
- [ ] Iniciar la revisión de la app de Meta.

### 8.1 Lanzar anuncios — 🔴

**Viabilidad:** requiere más permisos y más revisión, y un error gasta dinero real del cliente.

**Recomendación:** empezar solo con reglas, por ejemplo «pausar si el ROAS real baja de X», antes de crear campañas.

## Fase 9 · Control de devoluciones y puntaje de riesgo — 🟢 reglas / 🔴 modelo de IA

**Objetivo:** predecir qué pedidos se van a devolver y actuar antes del despacho.

**Viabilidad:**
- **Reglas:** viables cuando existan las fases 3 y 7. Por ejemplo: devoluciones previas, dirección incompleta, ciudad con alta devolución, no respondió el WhatsApp o pedido duplicado.
- **Modelo de IA:** prematuro. Necesita decenas de miles de pedidos con resultado conocido.
- **Historial entre tiendas:** compartirlo exige cumplir la Ley 1581 de 2012. Validar con un abogado.

**Ejemplo:** un cliente con 2 devoluciones previas que no contestó el WhatsApp sale con riesgo alto, y se le pide reconfirmar o pagar el flete por anticipado.

## Fase 10 · Multi-tienda, multi-país y multi-moneda — 🟡

**Objetivo:** varias tiendas y países en una sola cuenta, con cifras consolidadas.

**Estado hoy:** la cuenta es la tienda. Separarlas toca casi todas las tablas.

**Pendiente:**
- [ ] Decidir si se agregan `store_id`, `country` y `currency` antes de construir las fases 3 en adelante.

---

## Respuestas a las preguntas abiertas del plan

- [x] **¿El modelo de Dropi es genérico?** No, está atado a sus campos.
- [x] **¿La confirmación usa la API oficial y tiene multiagente?** Usa la API oficial de Meta. No hay multiagente.
- [ ] **¿Qué plataformas tipo Dropi tienen API?** Sin confirmar; hay que preguntarle a cada una.
- [x] **¿Finanzas cuenta el ingreso al entregar?** El módulo no existe, así que se hará con esa regla desde el inicio.

## Orden recomendado

1. **Interno, sin terceros:** fase 3 paso 1 → upsell, UTM y evento a Meta (parte de la 4) → tablero de envíos y novedades (parte de la 7) → multiagente (parte de la 2).
2. **En paralelo, trámites que tardan:** preguntar por la API de Effi y Mastershop, crear la app de Shopify y pedir la revisión de Meta para anuncios.
3. **Después:** adaptadores de la fase 1 → 8.0 → fase 3 completa → 5 → 6 → reglas de la 9 → 8.1 → 10.

Orden del plan original, para comparar: 1 → 2 → 3 (primer paso) → 4 → 7 → 8.0 → 3 (completa) → 5 → 6 → 8.1 → 9 → 10.

## Decisiones

| Fecha | Decisión | Quién |
|---|---|---|
| — | Pendiente: ¿agregar `store_id` y `currency` ahora? | |
| — | Pendiente: ¿por qué fase se arranca? | |
