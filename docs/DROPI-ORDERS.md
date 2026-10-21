# Preparación de integración de órdenes Dropi

## Implementado: validación local de preparación

`DropiOrders::readiness` se incluye en `GET /api/orders/{id}` y en la sección **Preparación para Dropi**. Revisa integración de catálogo, aceptación local, cotización vigente, dirección/códigos locales y variante cuando corresponda. No descifra tokens ni realiza llamadas de red.

Mantiene `can_submit=false` y marca pendientes los contratos oficiales, validación de stock/cobertura/flete y prevención de duplicados/conciliación. No existe endpoint de envío activo ni una prueba de conexión ficticia para órdenes.

## Por qué aún no se envía

El catálogo existente autentica con `dropi-integration-key`. El documento histórico de Scribd describe login y Bearer; varias URLs no están completas en la vista accesible. No se asume equivalencia entre esas credenciales ni se recopilan contraseñas Dropi para probar rutas adivinadas.

## Dependencias para habilitar una conexión real

- [ ] Documentación vigente y endpoints completos aprobados para Colombia.
- [ ] Autenticación y permisos específicos para la cuenta; sandbox o instrucciones de pruebas autorizadas.
- [ ] Contrato de cantidades, variantes, bodegas, códigos de ciudades, transportadoras e importes.
- [ ] Consulta de stock/cobertura/flete y reglas de expiración de cotización.
- [ ] Creación de orden con referencia estable; respuesta e identificador externo persistidos.
- [ ] Idempotencia nativa o búsqueda fiable de orden por referencia para conciliar timeout.
- [ ] Pruebas de error y duplicados; no reintentar creación con resultado desconocido.
- [ ] Consulta de estados y mecanismo autorizado de sincronización, cancelación y guías.

Con esos contratos se implementará un adaptador con destinos HTTPS fijos, TLS verificado, timeouts, credenciales por propietario cifradas, recepción persistida y cola. No exponer autenticación al frontend ni usar mensajes de la IA para autorizar un despacho.

## Fuentes revisadas el 19 de octubre de 2026

- [Documento histórico aportado](https://es.scribd.com/document/683043719/Documentacion-de-Dropi-docx-7): referencia, no contrato vigente verificado.
- [Página oficial de Dropi MCP](https://dropi.co/cr/mcp-claude): anuncia herramientas de órdenes y envíos con autorización en Dropi. Es una alternativa que debe evaluarse; no se conectó ni se integra automáticamente por tener el token del catálogo. No sustituye las pruebas de cuenta, correlación e idempotencia.

La búsqueda de documentación pública no proporcionó en esta tarea un contrato REST completo, autenticado y probado para nuestra cuenta. No confundir documentación de facturación electrónica con la API de pedidos.
