# Pagos con Wompi

Las tiendas cobran a sus compradores con su propia cuenta de Wompi. Cada tienda conecta sus llaves (sin OAuth) y el dinero llega a su cuenta, no a la de Tinbana.

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| 0 · Verificación | Firmas de Wompi, llaves de prueba en el sandbox, cotización de Dropi con pago anticipado y aceptación de `SIN RECAUDO` | Hecha, salvo la confirmación de Dropi |
| 1 · Conexión | «Integraciones → Wompi»: 4 llaves cifradas, guía, URL de eventos con firma y prueba de conexión | Hecha en local; falta el evento real en el hosting |
| 2 · Landing | Pago en línea en el formulario; el pedido pasa a «pagado» solo con el evento firmado | Pendiente |
| 3 · WhatsApp | Link de pago desde el pedido y desde el asistente | Pendiente |
| 4 · Dropi y avisos | Pedidos pagados a Dropi `SIN RECAUDO`, avisos y Pendientes | Pendiente |

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
- **Dropi:** `php bin/console.php dropi:shipping-probe [email] 11001`, de solo lectura, ya cotiza contra entrega (`EnvioConCobro=true`) y pago anticipado (`EnvioConCobro=false`). Se ejecuta en el hosting, donde está el token.

## Fase 0 · Resultados

- [x] `wompi:probe selftest`: 8 de 8 comprobaciones (2026-11-17, local).
- [x] `wompi:probe sandbox` con las llaves de prueba (2026-11-17, local): el comercio respondió con medios activos (tarjeta, PSE, Nequi, Daviplata, Bancolombia y otros) y token de aceptación; la llave privada creó un link de un solo uso (HTTP 201); se armó el Web Checkout firmado.
- [x] Pago aprobado en el sandbox (2026-11-17): Web Checkout firmado con la tarjeta de prueba aprobada. `wompi:probe transaction` leyó `APPROVED`, 1500000 COP, la misma referencia `tb-probe-…` y medio `CARD`. Wompi aceptó la firma de integridad. La transacción trae también `payment_link_id`, útil para la fase 3. La redirección llegó como `?id=<transacción>&env=test`.
- [x] Pago rechazado en el sandbox (2026-11-17, tarjeta de prueba declinada): `DECLINED`, 1500000 COP, la misma referencia, medio `CARD`. La redirección llega igual (`?id=…&env=test`) que con un pago aprobado, lo que confirma que la página de regreso no sirve para saber si se pagó.
- [ ] Evento firmado real del sandbox. Requiere una URL pública, así que se verifica en el hosting: conectar las llaves de pruebas en «Integraciones → Wompi», pegar la URL de eventos en Wompi y hacer el pago de prueba.
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
- [ ] Confirmar con Dropi (soporte o su panel) que la cuenta acepta pedidos `SIN RECAUDO` por la API. No se puede comprobar en modo de solo lectura, y no se creará un pedido real para averiguarlo.
