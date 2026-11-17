# Pagos con Wompi

Las tiendas cobran a sus compradores con su propia cuenta de Wompi. Cada tienda conecta sus llaves (sin OAuth) y el dinero llega a su cuenta, no a la de Tinbana.

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| 0 · Verificación | Firmas de Wompi, llaves de prueba en el sandbox, cotización de Dropi con pago anticipado y aceptación de `SIN RECAUDO` | Hecha, salvo la confirmación de Dropi |
| 1 · Conexión | «Integraciones → Wompi»: 4 llaves cifradas, guía, URL de eventos con firma y prueba de conexión | Hecha y comprobada en el hosting (2026-11-17) |
| 2 · Landing | Pago en línea en el formulario; el pedido pasa a «pagado» solo con el evento firmado | Hecha y comprobada en el hosting (reportado por el usuario) |
| 3 · WhatsApp | Link de pago desde el pedido, en el chat (respuesta automática y asistente) y recordatorio | Hecha y comprobada en el hosting (reportado por el usuario) |
| 4 · Dropi y avisos | Pedidos pagados confirmados solos y enviados a Dropi SIN RECAUDO (manual por defecto, automático con interruptor), avisos | Hecha en local; falta el primer pedido real |

## Fase 2 · Decisiones del usuario (2026-11-17)

- **Opciones de pago por landing:** la tienda elige en el editor entre solo contraentrega, solo pago en línea o las dos. Con las dos, elige el comprador.
- **Monto en línea:** producto + envío, con el flete de pago anticipado (`EnvioConCobro=false`), que es más barato.
- **Incentivo:** descuento configurable por la tienda al pagar en línea (porcentaje, puede ser 0).
- **Pago no completado (rechazado o abandonado):**
  - El pedido queda «pendiente de pago» y aparece en Pendientes.
  - El comprador puede reintentar con un link.
  - Si en 48 horas no hay pago aprobado, se cancela solo.
- **Regla fija:** un pedido solo pasa a «pagado» con el aviso firmado de Wompi (`APPROVED`) cuyo monto y referencia coinciden con el pedido. La página de regreso nunca lo confirma.

## Confianza y comprobante (2026-11-17)

- **Opción «Pagar en línea»:**
  - Muestra «Pago seguro con **Wompi**» con un candado.
  - Muestra insignias solo de los medios que la cuenta de Wompi de la tienda acepta, según la prueba de conexión: Visa, Mastercard y American Express si acepta tarjeta (`CARD`); PSE, Nequi y Daviplata; Bancolombia (cualquiera de sus métodos).
  - Desde el mismo día, a pedido del usuario, son los **logos reales**, guardados en `backend/public/brand/payments/` y mostrados con `<img>` (un SVG así no puede ejecutar nada). Se revisaron antes de usarlos: sin scripts, eventos ni referencias externas. Fuentes:

    | Logo | Archivo | Fuente | Licencia indicada por la fuente |
    |---|---|---|---|
    | Visa | `visa.svg` | Wikimedia Commons, «Visa Inc. logo (2021–present).svg» | Dominio público |
    | Mastercard | `mastercard.svg` | Wikimedia Commons, «Mastercard 2019 logo.svg» | Dominio público |
    | American Express | `amex.svg` | Wikimedia Commons, «American Express logo (2018).svg» | Dominio público |
    | Nequi | `nequi.svg` | Wikimedia Commons, «Nequi Colombia logo.svg» | CC BY-SA 4.0 |
    | Bancolombia | `bancolombia.svg` | Wikimedia Commons, «Bancolombia S.A. logo.svg» | Dominio público |
    | Wompi | `wompi.svg` | `public-assets.wompi.com/brand_wompi/logos/logo-primary.svg` (sitio oficial de Wompi) | Marca de Wompi |
    | PSE | `pse.jpg` | Logo del encabezado de pse.com.co (sitio oficial) | Marca de ACH Colombia |
    | Daviplata | `daviplata.svg` | worldvectorlogo.com (no oficial; Daviplata no publica su logo) | Revisar con Daviplata |

  - Las licencias de Wikimedia se refieren al derecho de autor del archivo. Las marcas siguen siendo de sus dueños y se usan para indicar que la tienda acepta esos medios.
- **Página de regreso** (`src/landing-payment.ts`):
  - Aprobado: un check que se dibuja solo dentro de un círculo verde. Rechazado: una X con un leve temblor. Esperando: un indicador que gira. Vencido o sin aviso: un signo de atención.
  - Con «reducir movimiento» del dispositivo, las marcas aparecen sin animación.
- **Comprobante:**
  - Con el pago aprobado, `GET /p/<slug>/pago/<ref>` agrega `receipt`: tienda, pedido, producto, cantidad, desglose, total, medio, transacción de Wompi, referencia y fecha. Nunca lleva datos de contacto.
  - «Descargar comprobante» lo dibuja en un canvas y lo guarda como PNG (`comprobante-<pedido>.png`), sin librerías.
- **Pruebas:** `tests/wompi-payments.mjs` sube a 41 comprobaciones (insignias según los medios aceptados y comprobante sin datos de contacto). En el navegador se revisaron las insignias, la animación de aprobado y de rechazado y la imagen descargada.

## Fase 4 · Dropi SIN RECAUDO y avisos

- **Decisión del usuario (2026-11-17):** opción A por defecto (la tienda revisa y pulsa «Enviar a Dropi»). Opción B (envío automático) solo con un interruptor en «Integraciones → Wompi → Envío a Dropi».
- **Pago aprobado (`Payments::settle`):**
  - El pedido queda **confirmado** (`confirmation.source='wompi'`) sin llamada ni «1 SÍ». Los productos propios descuentan su stock, como en cualquier confirmación.
  - Correos: `buyer_confirmed` dice «Recibimos tu pago» con el total pagado, y `owner_new_order` dice «Nuevo pedido pagado». El aviso «en camino» dice que no hay que pagar al recibir.
- **Después del commit (`Payments::afterPaid`):**
  - «¡Pago recibido!» al cliente por WhatsApp, solo dentro de la ventana de 24 horas.
  - Notificación en el panel.
  - Con el interruptor (`wompi_accounts.auto_dropi`, apagado por defecto), `DropiOrders::submit` automático. Un fallo queda como `auto_dropi_failed` y nunca deshace el pago.
- **Envío a Dropi (`DropiOrders`):**
  - `rate_type` pasa a `SIN RECAUDO` solo para pedidos en línea pagados. Usa el mismo cuerpo, con `payment_method_id` 1 y `total_order` igual a lo que pagó el comprador (en centavos del pago), repartido en el precio de la línea.
  - Requisitos del pedido en línea: «Pago en línea aprobado por Wompi» y «Precio y envío fijados por el pago» (sin cotización con vencimiento).
  - Antes de pagarse, el envío responde 409.
  - **Billetera:** el panel avisa cuánto descontará Dropi (precio del proveedor × cantidad + envío; si el comprador no pagó envío, «+ el envío que calcule Dropi»), según lo visto en la orden 93524042.
- **Pedido pagado en el panel:**
  - Sin «Cotización manual» ni «Devolver a revisión». Cotizar, reabrir o editar el cliente responde 409: se cancela y se reembolsa en Wompi.
  - El total es lo cobrado en Wompi.
  - La vista previa dice «Total pagado (no se recauda)».
  - La historia usa nombres claros (pago solicitado, aprobado, rechazado, vencido…).
- **Landing sin envío de Dropi:** el pedido pagado guarda envío $0 (lo que pagó el comprador). Dropi igual cobra su flete a la billetera.
- **Migraciones:** PostgreSQL `044_wompi_auto_dropi.sql`; MySQL `069_wompi_auto_dropi.sql`.
- **Pruebas:** `tests/wompi-payments.mjs` sube a 39 comprobaciones, con Dropi simulado en 8443. Cubre la confirmación automática, los correos, el precio bloqueado, el envío manual SIN RECAUDO con el total pagado, el interruptor apagado por defecto y el envío automático.
- **Pendiente:** el primer pedido real SIN RECAUDO creado por Tinbana, con un pedido de la tienda. Se cancela en Dropi si algo no cuadra.

## Fase 3 · Link de pago por WhatsApp

- **Regla:** el link siempre lo escribe el servidor (`Payments::retryUrl`, la landing + `/pagar/<ref>`), nunca la IA. Solo existe mientras el pedido en línea espera el pago y no está cancelado.
- **Desde el pedido** (botón «Enviar link por WhatsApp» en la tarjeta de pago; `POST /api/orders/<id>/payment-link`):
  - Si el cliente escribió en las últimas 24 horas, Tinbana le envía el mensaje con el link, el total y el vencimiento, y queda `payment_link_sent` en la historia del pedido.
  - Si no (o no hay chat, o el plan no incluye WhatsApp), WhatsApp no deja enviar texto libre. La tarjeta lo explica y ofrece «Abrir en mi WhatsApp» (`wa.me` con el mensaje listo).
  - Las plantillas aún no admiten botones con link, así que fuera de la ventana no se envía nada automático.
- **En el chat:**
  - Cuando el cliente pregunta por «mi pedido», la respuesta automática del servidor muestra el estado y, si espera el pago, el link (`WhatsAppOrderChat::show`).
  - El asistente ve en `orders` el campo `payment` («contraentrega», «en línea, esperando pago», «en línea, pagado» o «en línea, vencido sin pago»).
  - La acción `payment_link` hace que el servidor envíe el link del pedido pendiente (por número, o el más reciente). Si no hay pedido pendiente, responde que no ve uno. El texto o los links que escriba la IA en esa respuesta no se envían.
- **No se confirma sin pagar:**
  - Un pedido en línea pendiente no ofrece «1 SÍ / 2 NO» en el chat (`confirmable`).
  - No se envía la confirmación contraentrega por WhatsApp (`WhatsAppOrderConfirm::forOrder`).
  - `Orders::confirmByCustomer` lo rechaza.
- **Recordatorio** (`payment_pending`, en «Ventas WhatsApp → Confirmaciones → Recordatorios», activo por defecto):
  - Una vez, si el pedido sigue sin pagar 24 horas después de creado y faltan más de 1 hora para el vencimiento.
  - Solo si el chat está dentro de la ventana de 24 horas (sin plantilla ni costo); si no, queda omitido con el motivo.
  - Corre con `whatsapp:work`.
- **Migraciones:** PostgreSQL `043_reminders_payment_pending.sql`; MySQL `067_reminders_kind_drop.sql` y `068_reminders_payment_pending.sql` (nuevo valor de `whatsapp_reminders.kind`).
- **Pruebas:** `tests/wompi-whatsapp.mjs` (11 comprobaciones) con Meta, OpenAI y Wompi simulados. El asistente solo responde con una ficha de producto aprobada (regla existente).

## Fase 2 · Cómo funciona

- **Editor:** sección «Pago» (`src/BuilderPayment.tsx`) con `commerce.paymentMode` (`cod`, `online` o `both`) y `commerce.onlineDiscount` (0 a 50 %), validados en `Blocks::commerce`.
  - El pago en línea solo aparece en la landing si la tienda tiene el permiso `payments` y su cuenta de Wompi está conectada. Si no, la landing cobra contraentrega (`Payments::mode`).
- **Formulario:**
  - Con `both`, el comprador elige y el pago en línea aparece marcado primero. Con `online`, no hay opción que elegir.
  - Se muestra el descuento y el total a pagar, y el botón cambia a «Continuar al pago».
  - La cotización de envío pide el flete con pago anticipado (`EnvioConCobro=false`) cuando se paga en línea.
- **Monto (`Payments::prepare`):** productos (precio de la variante u oferta × cantidad) − descuento redondeado + flete con pago anticipado de Dropi.
  - Si el envío con Dropi está activo y no hay cotización, el pago en línea se rechaza (409) y el comprador puede elegir contraentrega.
  - Los productos propios no suman flete. El navegador nunca fija el monto.
- **Pedido:**
  - Se crea con `payment_method='online'`, `payment_status='pending'`, `payment_reference=tb-<16 hex>` (aleatoria), `payment` (monto, desglose e intentos) y `payment_due_at` (48 horas).
  - Los correos de pedido recibido (comprador y tienda) se envían al aprobarse el pago, y no se envía la confirmación contraentrega por WhatsApp.
  - No se puede confirmar ni reabrir hasta que esté pagado; cancelarlo sí se puede.
- **Checkout (`Payments::checkout`):**
  - Cada intento usa la referencia `tb-…-<n>` (máximo 20), así que un rechazo se puede reintentar.
  - Lleva el correo y el nombre del comprador. La dirección de regreso es la misma landing con `?pago=<referencia>`, solo si es `https` pública.
- **Rutas públicas** (por la referencia aleatoria; sin datos personales, `no-store` y `noindex`):
  - `GET /p/<slug>/pago/<ref>`: estado (`pending`, `paid` o `closed`), si el último intento fue rechazado, monto, número de pedido y link de seguimiento.
  - `GET /p/<slug>/pagar/<ref>`: redirige (303) a un nuevo intento firmado.
- **Avisos (`Payments::apply`):** el aviso firmado ya guardado se aplica al pedido de la tienda.
  - `APPROVED` con monto en centavos y moneda iguales: el pedido pasa a «pagado» (`payment_approved`) y se encolan los correos. Es idempotente.
  - Monto distinto: no se marca como pagado; queda `payment_mismatch`.
  - `DECLINED`, `ERROR` o `VOIDED`: el pedido sigue pendiente; queda `payment_declined`.
  - Pago aprobado en un pedido ya cancelado: queda `payment_after_cancel`.
- **48 horas (`Payments::expire`, desde el cron `mail:work`):**
  - Antes de cancelar se consulta a Wompi (`GET /transactions?reference=…`, con la llave privada) por si se perdió un aviso. Si hay un pago aprobado, el pedido queda pagado (`source=reconcile`).
  - Si no, queda `payment_status='expired'` y el pedido se cancela.
- **Página de regreso** (`src/landing-payment.ts`): consulta el estado durante unos 30 segundos.
  - Pagado: muestra el resultado y envía el `Purchase` a los píxeles de la tienda una sola vez, con la referencia como `eventID`.
  - Rechazado o sin aviso: ofrece «Intentar de nuevo».
  - Vencido: lo explica.
- **Panel:**
  - Tarjeta «Pago en línea · Wompi» en el detalle del pedido (`src/OrderPayment.tsx`): estado, desglose, transacción, medio, vencimiento, intentos y link para reintentar.
  - Pendientes tiene la sección «Pagos en línea por revisar»: esperando pago, rechazados, monto distinto y pago en un pedido cancelado.
- **Migraciones:** PostgreSQL `042_orders_online_payment.sql`; MySQL `065_orders_payment_status_drop.sql` y `066_orders_online_payment.sql`. `payment_status` pasa a admitir `pending`, `paid` y `expired`.
- **Protección hasta la fase 4:** un pedido pagado en línea no se puede enviar a Dropi (la revisión de envío muestra «Envío sin recaudo… próximamente» y el envío responde 409), porque saldría CON RECAUDO y la transportadora le cobraría otra vez al cliente. Mientras tanto se crea a mano en Dropi como SIN RECAUDO.
- **Pruebas:** `tests/wompi-payments.mjs` (33 comprobaciones) con Wompi y Dropi simulados. En el navegador, con las llaves de sandbox: opción y totales, paso a Wompi, regreso aprobado y rechazado (con avisos firmados enviados en local), tarjeta del pedido y editor.
- **Comprobado en el hosting:** el usuario desplegó el commit `9e4b7bb` e hizo la compra de prueba con las llaves de sandbox siguiendo la guía. Reportó que todo funcionó: pago en línea desde la landing, regreso con el resultado y pedido pagado en el panel.

## Fase 1 · Conexión

- **Pantalla:** «Integraciones → Wompi» (`/panel/wompi`, `src/WompiConnection.tsx`), con el permiso de plan `payments` («Pagos en línea con Wompi»). La función es nueva, así que queda activa en todos los planes que no la apaguen.
- **Cuenta:** una por tienda (`wompi_accounts`).
  - La llave pública se guarda visible.
  - La llave privada, el secreto de eventos y el secreto de integridad se guardan cifrados (contexto `id:usuario:campo`) y nunca vuelven al navegador.
  - Las cuatro deben ser del mismo ambiente. Al reemplazarlas, los tres secretos pueden quedar vacíos para conservar los guardados; si cambia el ambiente, hay que pegar las cuatro.
- **Prueba de conexión (solo lectura):**
  - `GET /merchants/<llave pública>` trae el nombre del comercio y sus medios de pago.
  - `GET /transactions?reference=tb-check-…` con la llave privada responde 200 si la llave es válida y 401 si no.
  - Los dos secretos se comprueban con el primer aviso (eventos) y con el primer pago firmado por Tinbana (integridad, referencias `tb-…`).
- **URL de eventos propia:** `APP_URL/wompi/events/we<40 hex>`, con el token guardado cifrado y su hash para buscarlo.
  - Respuestas: 404 si la URL no existe, 401 si el checksum no coincide (se anota `last_rejected_at` y Wompi reintenta), 200 cuando se guarda o ya estaba.
  - Un aviso válido del otro ambiente se responde con 200 y no se guarda.
  - Los avisos se guardan en `wompi_events`, una sola vez por transacción y estado. La fase 2 los usará para marcar pedidos pagados.
- **Pago de prueba:** solo con llaves de pruebas y la conexión comprobada. Es un Web Checkout firmado de $10.000 (referencia `tb-test-…`) que comprueba la URL de eventos y los dos secretos.
- **Dirección de regreso:** Wompi responde 403 a todo el checkout si la dirección de regreso no es pública y `https` (comprobado con `http://127.0.0.1`). Por eso `Wompi::redirectUrl()` solo la envía cuando `APP_URL` es `https` y no es local.
- **API:** `GET/PUT/DELETE /api/wompi/account`, `POST /api/wompi/account/test` y `POST /api/wompi/account/test-payment`, con CSRF y límites por tienda.
- **Migraciones:** PostgreSQL `041_wompi.sql`; MySQL `063_wompi_accounts.sql` y `064_wompi_events.sql`.
- **Pruebas:** `tests/wompi-connection.mjs` (29 comprobaciones), con Wompi simulado en `https://127.0.0.1:8449/v1` (`WOMPI_API_URL`, ignorada en producción).

## Contrato de Wompi (documentación oficial, revisada el 2026-11-17)

- **Ambientes:**
  - Sandbox: `https://sandbox.wompi.co/v1`.
  - Producción: `https://production.wompi.co/v1`.
  - Las llaves de un ambiente no sirven en el otro.
- **Llaves:**

  | Llave | Sandbox | Producción |
  |---|---|---|
  | Pública | `pub_test_` | `pub_prod_` |
  | Privada | `prv_test_` | `prv_prod_` |
  | Secreto de eventos | `test_events_` | `prod_events_` |
  | Secreto de integridad | `test_integrity_` | `prod_integrity_` |

- **Firma de integridad:** `SHA256(referencia + monto_en_centavos + moneda [+ fecha_expiración] + secreto_integridad)`. Siempre se calcula en el servidor.
- **Web Checkout:** `https://checkout.wompi.co/p/?public-key=…&currency=COP&amount-in-cents=…&reference=…&signature:integrity=…`, con `redirect-url` opcional.
  - La redirección trae `?id=<transacción>`, pero **no confirma el pago**.
  - El widget (`https://checkout.wompi.co/widget.js`) es la otra opción, pero exige abrir la CSP de la landing.
- **Eventos:**
  - `transaction.updated` lleva `signature.properties`, `signature.checksum` (también en el encabezado `X-Event-Checksum`) y `timestamp`.
  - Checksum: `SHA256(valores de properties tomados de data, en ese orden + timestamp + secreto_eventos)`. La lista de propiedades viene en cada evento y no se fija en el código.
  - Hay que responder HTTP 200. Si no, Wompi reintenta 3 veces en 24 horas (a los 30 minutos, a las 3 horas y a las 24 horas).
  - Estados finales: `APPROVED`, `DECLINED`, `VOIDED` y `ERROR`.
- **Links de pago:**
  - `POST /v1/payment_links` con la llave privada (`Bearer`). Campos obligatorios: `name`, `description`, `single_use` y `collect_shipping`; opcionales: `amount_in_cents`, `currency` (solo COP), `expires_at` (UTC), `redirect_url` y `sku` (máximo 36 caracteres).
  - URL para compartir: `https://checkout.wompi.co/l/<id>`.
- **Error en la documentación de Wompi:** el ejemplo de la página de eventos muestra la cadena `1234-1610641025-49201APPROVED44900001530291411prod_events_…` con el hash `3476DDA5…`, pero el SHA256 real de esa cadena es `5a18ec5e…`. El cálculo de Tinbana sigue los pasos documentados; la confirmación definitiva será un evento real del sandbox (fase 1).

## Fase 0 · Herramientas

- **`backend/src/Wompi.php`:** firma de integridad, validación de eventos, ambiente de las llaves, dirección del Web Checkout y peticiones a la API. Las llaves nunca salen en registros ni en pantalla.
- **`php bin/console.php wompi:probe`:**
  - `selftest`: sin red. Prueba las fórmulas con los ejemplos oficiales, el rechazo de eventos alterados o con otro secreto y la mezcla de llaves de prueba y producción.
  - `sandbox`: solo acepta llaves de prueba. Lee el comercio (llave pública), crea un link de pago de un solo uso (llave privada) y arma un Web Checkout firmado (secreto de integridad) de $15.000.
  - `transaction <id>`: lee la transacción del sandbox y muestra estado, monto, referencia y medio de pago.
  - **Llaves:** el comando las toma de `WOMPI_TEST_PUBLIC_KEY`, `WOMPI_TEST_PRIVATE_KEY`, `WOMPI_TEST_EVENTS_SECRET` y `WOMPI_TEST_INTEGRITY_SECRET`. Se ponen en la configuración local ignorada por git (`.tools/test-env.json` o `backend/.env`) y nunca en el repositorio ni en la documentación.
- **Detalle de una orden:** `php bin/console.php dropi:order-probe rates <email> <orden_dropi>` (`GET orders/myorders/<id>`, solo lectura). Lista todas las claves y muestra los valores de pago, cobro, montos, tarifa, tipo, estado, ids y el nombre del método de pago. Los datos de contacto (nombre, teléfono, correo, dirección, ciudad, documento y notas) no se imprimen; el filtro se comprobó sin red con una orden inventada.
- **Dropi, tipos de cobro (2026-11-17):** `php bin/console.php dropi:order-probe rates [email]` lee los últimos 200 pedidos de la cuenta (`GET orders/myorders`) y cuenta los valores de `rate_type`. Para un ejemplo de cada tipo muestra solo los campos de pago, cobro, montos y estado; nunca datos del comprador ni el token. Si la cuenta ya tiene pedidos SIN RECAUDO (por ejemplo, hechos a mano en el panel de Dropi), confirma el valor exacto y cómo los guarda Dropi. Si no los tiene, no confirma nada y hace falta la respuesta de soporte o una prueba controlada.
- **Dropi:** `php bin/console.php dropi:shipping-probe [email] 11001`, de solo lectura, ya cotiza contra entrega (`EnvioConCobro=true`) y pago anticipado (`EnvioConCobro=false`). Se ejecuta en el hosting, donde está el token.

## Fase 0 · Resultados

- [x] `wompi:probe selftest`: 8 de 8 comprobaciones (2026-11-17, local).
- [x] `wompi:probe sandbox` con las llaves de prueba (2026-11-17, local): el comercio respondió con medios activos (tarjeta, PSE, Nequi, Daviplata, Bancolombia y otros) y token de aceptación; la llave privada creó un link de un solo uso (HTTP 201); se armó el Web Checkout firmado.
- [x] Pago aprobado en el sandbox (2026-11-17): Web Checkout firmado con la tarjeta de prueba aprobada. `wompi:probe transaction` leyó `APPROVED`, 1500000 COP, la misma referencia `tb-probe-…` y medio `CARD`. Wompi aceptó la firma de integridad. La transacción trae también `payment_link_id`, útil para la fase 3. La redirección llegó como `?id=<transacción>&env=test`.
- [x] Pago rechazado en el sandbox (2026-11-17, tarjeta de prueba declinada): `DECLINED`, 1500000 COP, la misma referencia, medio `CARD`. La redirección llega igual (`?id=…&env=test`) que con un pago aprobado, lo que confirma que la página de regreso no sirve para saber si se pagó.
- [x] Evento firmado real del sandbox (2026-11-17, en el hosting, reportado por el usuario). Con las llaves de pruebas conectadas en «Integraciones → Wompi», la URL de eventos pegada en Wompi y el pago de prueba aprobado, el aviso llegó a «Últimos avisos» y los dos secretos quedaron comprobados (en verde). Confirma el cálculo del checksum con un evento real, a pesar del ejemplo erróneo de la documentación.
- [x] `dropi:shipping-probe` en el hosting (2026-11-17, ejecutado por el usuario sin correo: primera integración, producto 309, bodega Cali → Bogotá, valor declarado $13.500). Dropi cotiza el pago anticipado (`EnvioConCobro=false`) y sale más barato en todas las transportadoras:

  | Transportadora | Contra entrega | Pago anticipado |
  |---|---|---|
  | VELOCES | $16.450 | $14.450 |
  | ENVIA | $16.164 | $14.610 |
  | TCC | $18.730 | $15.730 |
  | DOMINA | $20.188,6 | $16.688,6 |
  | COORDINADORA | $21.730 | $18.530 |
  | INTERRAPIDISIMO | Error: mínimo $45.000 | $17.920 |
  | JAMV-DRIVE | $20.000 | $19.000 |
  | DEROCHA-EXPRESS | $22.400 | $21.400 |

  99MINUTOS y WIILOG dan error de bodega en los dos casos. En la fase 4, la cotización de los pedidos pagados debe usar `EnvioConCobro=false`. La cuenta del correo probado primero no tenía Dropi conectado.
- [x] La cuenta maneja pedidos `SIN RECAUDO` (2026-11-17, `dropi:order-probe rates` ejecutado por el usuario en el hosting). De los 7 pedidos de la cuenta, 6 son `CON RECAUDO` y 1 es `SIN RECAUDO` (orden 93524042, `type` FINAL_ORDER, estado ENTREGADO, `total_order` 50000, `shipping_amount` 10774), con el valor exacto `rate_type: "SIN RECAUDO"`.
  - Para comparar, un CON RECAUDO del 2026-10-23 tenía `total_order` 60000 y `shipping_amount` 16550.
  - **Detalle de la orden 93524042** (`dropi:order-probe rates <email> 93524042`, ejecutado por el usuario el 2026-11-17):
    - `rate_type` «SIN RECAUDO», `payment_method_id` **1** (el mismo que Tinbana envía hoy) y `type` FINAL_ORDER.
    - `total_order` 50000 (igual al `price` del detalle), `shipping_amount` 10774, transportadora ENVIA (id 2). Llegó entregada.
    - `shop.type` «CHATEA PRO»: la creó otra integración por API, lo que indica que la API acepta `SIN RECAUDO`.
    - **Billetera de Dropi:** al crearla, Dropi descontó del saldo del dropshipper el costo del proveedor más el flete. Quedó `history_wallet` SALIDA 28274 = `supplier_price` 17500 + envío 10774 (`discounted_amount` 28274; saldo anterior 34063), y `dropshipper_amount_to_win` = 21726 (= 50000 − 28274).
    - **Para la fase 4:**
      - Enviar el mismo cuerpo que contraentrega, con `rate_type: "SIN RECAUDO"`, `payment_method_id` 1 y `total_order` = lo que pagó el comprador.
      - La tienda debe tener **saldo en su billetera de Dropi** que cubra el costo del producto más el flete; si no, el pedido no puede pagarse en Dropi.
