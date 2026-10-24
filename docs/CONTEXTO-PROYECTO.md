# Tinvana: documento maestro de contexto y continuidad

Última actualización: **23 de octubre de 2026** (envío a Dropi).

Documento vivo para el propietario del proyecto, desarrolladores y otras IA. Describe el estado conocido al cerrar la última implementación; no garantiza que un túnel, proceso o servicio externo siga activo en otra sesión.

## 1. Lectura rápida para retomar

- **Producto:** plataforma privada para administrar integraciones Dropi, seleccionar productos, crear/publicar landings y recibir consultas. Se amplía con pedidos y ventas por WhatsApp.
- **Marca actual:** Tinvana. Zenzales/Dropi + Zenzales son nombres anteriores que aún aparecen en rutas, configuraciones técnicas y algunos documentos.
- **Proyecto real:** en producción en **`https://tinbana.com`** (GoDaddy cPanel) con PHP + MySQL (`DB_DRIVER=mysql`); catálogo obtenido de Dropi. Supabase PostgreSQL queda como entorno histórico. No existe fallback de productos inventados. Los datos de pruebas están aislados.
- **Estado de producción (confirmado por el usuario el 2026-10-23):** despliegue sobre **MariaDB 10.11.19** (no MySQL), login y flujos de la aplicación, correo con Resend, HTTPS Let's Encrypt (raíz y comodín `*.tinbana.com`), subdominio por tienda y cron de trabajadores funcionando. El asistente no lo comprobó directamente.
- **Última entrega funcional:** envío de pedidos confirmados a Dropi (migración 015), con estado `PENDIENTE CONFIRMACION` y cobro contra entrega, probado contra un Dropi simulado. **Sin desplegar y sin orden real de prueba todavía.**
- **Todavía no:** sincronización de estados/guías desde Dropi, agente vendedor de WhatsApp, sincronización bidireccional de GHL, logística ni conciliación financiera.
- **Últimas comprobaciones locales:** ver la bitácora del 2026-10-22 (subdominio de tienda, interfaz y regresiones). Los checks externos se distinguen de las pruebas aisladas.
- **Siguiente paso operativo:** desplegar, ejecutar `migrate` (aplica 015) y hacer una orden real de prueba en Dropi con autorización del usuario; después probar copia de seguridad/restauración de MySQL y medios, confirmar la renovación automática de los certificados en diciembre de 2026 y avanzar en el contrato oficial de órdenes Dropi y en GHL/WhatsApp.

Leyenda:

- `[x]` Implementado o realizado, con el alcance que indica el texto.
- `[ ]` Pendiente; no asumir que existe por aparecer en un diseño o documento.
- Una función implementada puede tener una comprobación externa pendiente: ambas se registran por separado.

## 2. Objetivo y restricciones acordadas

- [x] Proyecto independiente del catálogo original; se reutilizan diseño, comportamiento y mapeo donde corresponde.
- [x] React + TypeScript + Vite + Tailwind CSS + React Router.
- [x] PHP 8.2+ con Composer, API REST JSON y autenticación/autorización en servidor.
- [x] PDO conserva PostgreSQL/Supabase como driver legado verificado; la base productiva está aún en PostgreSQL.
- [x] Configuración por entorno y selector PDO `DB_DRIVER` (`pgsql`/`mysql`); la conversión de consultas y las rutas MySQL específicas están implementadas y cubiertas por pruebas de dialecto locales.
- [x] React no accede directamente a la base ni recibe secretos de integraciones.
- [x] Guardar productos seleccionados y copias necesarias; no importar todo Dropi.
- [x] Una plantilla reutilizable por landing, no un proyecto React por producto.
- [x] Adaptación de backend para MySQL: capa PDO/dialecto, resultados `RETURNING`, upserts, límites, runner de migraciones y verificación de 18 tablas implementados.
- [x] Verificación con servidor MySQL real en GoDaddy: `pdo_mysql`, migración y flujos de la aplicación (confirmado por el usuario el 2026-10-23; sin suite automatizada contra MySQL).

Referencia original, que debe permanecer intacta: `C:\Users\andre\Desktop\Proyectos\Dropi - GHL\catalogo`.

Workspace actual: `C:\Users\andre\Desktop\Zenzales\Dropi + Zenzales`. La marca cambió; no renombrar carpetas ni contratos técnicos automáticamente.

Repositorio GitHub: `https://github.com/afceballos/tinvana`, rama `master`. El código está publicado; esto no significa que se haya desplegado en GoDaddy.

`backend/mysql/schema.sql` define el esquema inicial de 18 tablas para MySQL 8.0.16+. Está importado en GoDaddy y, según el usuario, `migrate` y los flujos de la aplicación funcionan allí. El asistente no ha consultado ese servidor; no hay suite automatizada contra MySQL (el PHP local carece de `pdo_mysql`).

## 3. Arquitectura y organización

```text
Panel React -> API PHP -> PostgreSQL o MySQL (según DB_DRIVER)
                    |-> Dropi: catálogo real por integración
                    |-> OpenAI / Anthropic: propuestas para landings
                    |-> Cola de leads -> webhook GHL u otro receptor
Visitantes -> PHP /p/{slug}: HTML específico + interacciones React
Formularios -> lead + entrega pendiente + borrador de pedido (misma transacción)
```

| Ruta | Responsabilidad |
|---|---|
| `src/` | Panel, editor, formularios, componentes, estilos y runtime de landings. |
| `src/main.tsx` | Sesión React, navegación y rutas privadas. |
| `src/api.ts` | Cliente HTTP, CSRF y manejo de sesión expirada. |
| `backend/public/index.php` | Entrada web, API, rutas públicas, medios y entrega de SPA. |
| `backend/src/` | Servicios PHP: Auth, Dropi, Landing, Leads, Orders, Media, etc. |
| `backend/migrations/` | Migraciones SQL versionadas; no modificar una ya aplicada. |
| `backend/bin/console.php` | Instalación, migraciones, administrador y trabajadores de colas. |
| `backend/storage/` | Archivos y recursos privados; no servir como carpeta estática. |
| `tests/`, `backend/tests/` | Pruebas HTTP, navegador, validaciones y fixtures aislados. |
| `.tools/` | Herramientas locales, configuración y procesos temporales; excluido de Git. |
| `docs/` | Guías funcionales y técnicas. |
| `Iconos y logos/` | Recursos originales de marca. |
| `output/pdf/` | PDF explicativo ya generado de la ampliación WhatsApp. |

### Migraciones existentes

| Versión | Contenido principal |
|---|---|
| 001 | Usuarios, integraciones, seleccionados, landings, plantilla, leads, entregas y límites. |
| 002 | Restricciones de acceso a roles HTTP del proveedor. |
| 003 | Configuración de webhook por usuario. |
| 004 | Medios subidos. |
| 005 | Constructor de landings y publicación de contenido. |
| 006 | Conexiones de IA por usuario. |
| 007 | Dirección y teléfono de leads. |
| 008 | Perfil de usuario. |
| 009 | Verificación, recuperación y correo de cuentas. |
| 010 | Biblioteca de imágenes por cuenta y mes. |
| 011 | Pedidos locales y eventos. |
| 012 | Ofertas comerciales, historial de versiones y snapshots de oferta/variante en pedidos; aplicada a Supabase y al entorno local. |
| 013 | Subdominio por landing (`landing_pages.subdomain`, `published_subdomain`); sustituido por 014, columnas sin uso. |
| 014 | Subdominio de tienda por usuario (`users.store_subdomain`), en PostgreSQL y MySQL. |
| 019 | Superusuario y planes: `users.status`, `plan_id`, `plan_expires_at`, `entitlement_overrides`, `admin_note`, `last_login_at` y rol `superadmin`; tablas `plans`, `app_settings` y `admin_audit` (en MySQL, 020 a 025). |
| 018 | Logística reflejada desde Dropi: valores ampliados de `logistics_status` (en MySQL, 019). |
| 017 | Seguimiento de Dropi: `orders.dropi_status`, `dropi_tracking` y `dropi_synced_at` (en MySQL, 018). |
| 016 | Correos de pedidos: tabla `order_mail` y `users.mail_settings` (en MySQL, archivos 016 y 017). |
| 015 | Envío a Dropi: estados `sending/sent/failed/unknown`, `orders.dropi_order_id` e `integration_data`, en PostgreSQL y MySQL. Aplicada solo en la base local de pruebas. |

Esquema acumulativo: consultar el SQL real antes de cambiarlo. Hay relaciones de propietario y restricciones de unicidad; la autorización de aplicación sigue siendo obligatoria aunque exista RLS en tablas específicas.

## 4. Funcionalidades de la plataforma

### 4.1 Acceso, cuentas y perfil

- [x] Login/logout reales con password_hash/password_verify.
- [x] Sesiones PHP, cookie HttpOnly, Secure en producción HTTPS, SameSite, regeneración y CSRF.
- [x] Límites de login y controles de propietario en API; rutas privadas React.
- [x] Instalación de administrador por comando, sin contraseña predeterminada.
- [x] Perfil con nombre, apellido, empresa, foto, teléfono y dirección; email/usuario no editables.
- [x] Menú de cuenta y cambio de contraseña con revocación de sesiones según versión.
- [x] Registro con verificación por email y establecimiento de contraseña mediante enlace.
- [x] Enlace de verificación de 24 horas y recuperación de 30 minutos; tokens de un uso almacenados como hash.
- [x] Envío de correo con cola y SMTP o Resend, con plantilla HTML de marca Tinvana y remitente «Tinvana».
- [x] Resend configurado en producción (dominio `tinbana.com`, cron `mail:work`) y entrega de extremo a extremo funcionando (confirmado por el usuario el 2026-10-23).
- [ ] Verificación por SMS: no desarrollada ni servicio contratado.

No solicitar que se peguen secretos en el chat. El remitente `no-reply@zenzales.com` fue solo la propuesta inicial; el dominio de envío actual es `tinbana.com`.

### 4.2 Dropi, catálogo y selección

- [x] Integraciones por usuario, token cifrado con cifrado autenticado y clave de entorno fuera de la base.
- [x] Reemplazo de token y prueba de conexión; el frontend solo recibe estado de configuración.
- [x] Cliente PHP cURL, TLS verificado, timeouts, destinos fijos y redacción de secretos.
- [x] Catálogo con búsqueda debounce, cuatro órdenes: ID ascendente/descendente y nombre A-Z/Z-A.
- [x] 32 productos visibles: solicitar 50 y usar desplazamiento `(página-1)*32`; no usar `count:0` como total.
- [x] Búsqueda, orden y página en URL; cancelación de solicitudes obsoletas.
- [x] Modal, galería, estados de carga/vacío/error y diseño responsive.
- [x] Selección persistente entre páginas/sesiones y sección Mis productos.
- [x] Mapeo real: precio, SKU, imágenes principales, categorías, bodegas, variantes y atributos disponibles.
- [x] URLs absolutas conservadas; rutas de imagen relativas prefijadas con CloudFront; stock desconocido no inventado.
- [x] Catálogo y categorías respondieron realmente durante verificaciones anteriores; hubo un 401 inicial antes de ajustar compatibilidad del cliente.
- [ ] Revalidar conexión desde el hosting definitivo: el éxito desde este equipo no garantiza otra IP/red.

No volver a añadir filtro de favoritos sin comprobarlo. Categorías, orden por precio y selector de tamaño no están expuestos inicialmente en el catálogo del panel.

### 4.3 Landings, editor y publicación

- [x] Copia del producto al generar landing; contenido comercial separado del original.
- [x] Editor de título, slug, descripción, precio público, galería, botones, colores y SEO.
- [x] Constructor de bloques reutilizables, plantillas guardadas y listado de productos seleccionados de la cuenta.
- [x] Actualización explícita del producto que conserva cambios comerciales.
- [x] Menú de anclas, encabezado oscuro sticky y logo reemplazable.
- [x] Borradores iniciales, preview autorizada o firmada temporal y publicación/despublicación.
- [x] PHP entrega HTML principal y metadatos propios en `/p/{slug}`; borradores/inexistentes devuelven 404.
- [x] Sitemap excluye borradores; no exposición automática de proveedor, costo o JSON interno.
- [x] WhatsApp aparece si se configura; no se inventan reseñas, garantías o promociones.

### 4.4 IA para contenido

- [x] Conexiones OpenAI y Anthropic/Claude por usuario, cifradas y con proveedor activo.
- [x] Generación de propuestas usando producto y bloques existentes; revisión humana antes de guardar/publicar.
- [x] Controles de validación y límites; no publicar automáticamente ni inventar disponibilidad.
- [x] Respuesta real de OpenAI comprobada anteriormente sin guardar la propuesta.
- [ ] Verificar respuesta externa real de Claude con credencial autorizada; las pruebas aisladas no sustituyen esa comprobación.
- [ ] Agente vendedor conversacional: pertenece a la fase nueva, no al generador del editor.

Una suscripción ChatGPT/Claude de usuario no implica acceso de API ni cubre necesariamente los cargos de Conversation AI de GHL.

### 4.5 Formularios, consultas y webhook

- [x] Nombre, apellido, email, teléfono con banderas, dirección, indicaciones, país, departamento, ciudad y código postal opcional.
- [x] Landings con entrega solo Colombia; perfil con selectores mundiales. Listados buscables, ordenados y flotantes.
- [x] Cantidad configurable y precios derivados de datos del servidor, no de campos manipulables del navegador.
- [ ] Aplicar ofertas por cantidad y selector de variantes al formulario público: la ampliación actual las usa en cotización interna, sin cambiar automáticamente las landings.
- [x] Lead guardado antes de intentar entrega; deduplicación por landing y clave idempotente.
- [x] Una configuración de webhook por usuario: visualizar identificador enmascarado, reemplazar o eliminar; URL cifrada.
- [x] Cola, reintentos y resultado HTTP/historial; vista compacta de consultas y detalle.
- [x] Payload con datos del formulario/dirección, producto, SKU, cantidad, precio Dropi, público, total, imagen, URL y tags.
- [x] “Precio inflado” significa precio público del editor, no porcentaje automático.
- [ ] Comprobar el workflow real de GHL, su mapeo, deduplicación y creación de contactos/oportunidades.

“Webhook aceptado” solo significa respuesta HTTP exitosa. El receptor debe deduplicar por `lead_id`; no se promete entrega externa exactamente una vez. Cambiar una cotización local no actualiza automáticamente el webhook original del lead.

### 4.6 Archivos y diseño

- [x] Carga JPEG/PNG/WebP y conversión real a WebP: entrada máxima 8 MB, salida máxima 1600 px y 400 KB.
- [x] Biblioteca privada por cuenta/mes, búsqueda, paginación, descarga y reutilización sin duplicar el archivo.
- [x] Rutas nuevas `backend/storage/media/{usuario}/{año}/{mes}/{uuid}.webp`; compatibilidad con archivos anteriores.
- [x] Tarjetas compactas, selección por borde/chulo y selección múltiple.
- [x] Eliminación con confirmación y protección de referencias guardadas en landings, versiones publicadas, leads y plantillas.
- [x] Marca Tinvana: paloma origami, Montserrat, naranja `#FF6A00`, secundario `#FFBA3D`, oscuro `#1E1E1E`, crema `#FFF8F1`, borde `#FFE0CD`.
- [x] Toasts flotantes, carga moderna, GSAP y escena Three.js sutil con reducción de movimiento y fallback.

La biblioteca es de imágenes, no un gestor genérico de PDF/documentos. Copiar una URL privada no la publica. Una referencia externa o edición sin guardar no se puede detectar al eliminar.

## 5. FASE APARTE: pedidos, WhatsApp, GHL y operación Dropi

### 5.1 Objetivo y responsabilidades propuestas

Unificar ventas de landing y chat en el mismo proyecto. Tinvana conserva ofertas, cotizaciones, aceptación y pedido; GHL gestiona contactos/conversación/asesores; Dropi acredita sus órdenes y datos logísticos disponibles. La IA conversa; el backend valida operaciones.

Documentos de origen: `Proyecto_ventas_WhatsApp_GHL_Dropi.docx` y la explicación `output/pdf/Tinvana-Integracion-Ventas-WhatsApp.pdf`. Son propuestas, no certifican funcionalidades ya existentes. El otro DOCX, `Proyecto_control_dropshipping_Boostec_GHL.docx`, no se incorpora automáticamente como requisito implementado.

### 5.2 Etapa 1 completada: pedidos locales supervisados

- [x] Tablas `orders` y `order_events`, migración 011, índices y aislamiento por propietario.
- [x] Borrador automático por cada consulta nueva, en la misma transacción que lead y entrega pendiente.
- [x] Conversión explícita de consultas anteriores, idempotente: **Abrir o crear pedido**.
- [x] Panel `/panel/pedidos`, filtro de venta y paginación en URL, detalle `/panel/pedidos/{id}`.
- [x] Copias de comprador, dirección y producto; una partida por pedido en esta etapa.
- [x] Cotización manual: cantidad, precio unitario público, flete y notas internas.
- [x] Total pendiente hasta indicar flete; cero debe introducirse explícitamente si corresponde.
- [x] Importes calculados en centavos enteros y almacenados con numeric; UI muestra decimales sin redondear el total.
- [x] Cotización con UUID, versión y vencimiento de 24 horas.
- [x] Bloqueo de cambios concurrentes mediante fila/versión; cambios sin guardar bloquean aceptación en UI.
- [x] Aceptación manual con evidencia del comprador, operador y cotización vigente.
- [x] Cancelación local con motivo; historial conservado.
- [x] Estados de venta `draft`, `confirmed`, `cancelled`.
- [x] Estados separados que permanecen en `integration_status=not_sent`, `logistics_status=not_requested`, `payment_status=pending`.
- [x] 38 comprobaciones específicas, 107 generales y comprobación del panel público en lectura.

Límites de la entrega inicial: dirección de solo lectura y sin selección de variantes; quedaron superados por la etapa 2 descrita a continuación. Siguen pendientes varias partidas y cotización automática. No se importó todo el historial. Marcar aceptación no registra una orden Dropi ni un pago; cancelar localmente no solicita cancelación externa.

### 5.3 Etapa 2: correcciones y condiciones comerciales

- [x] Editar comprador/dirección de Colombia con validación PHP, teléfono con banderas y selectores buscables flotantes. Conserva la consulta original, registra antes/después e invalida cotización; cambiar dirección también elimina el flete. Guardar sin cambios no invalida nada.
- [x] Devolver confirmados locales a revisión con motivo; la aceptación anterior queda histórica, vuelve a borrador y exige nuevo flete/cotización/aceptación. No se reabren cancelados ni se modifican directamente confirmados.
- [x] Selección de variantes con IDs de la copia del producto; verificación de pertenencia, snapshot y obligatoriedad cuando corresponde. Sin afirmar stock ni compatibilidad de órdenes externas.
- [ ] Múltiples partidas por pedido y variantes seleccionables desde el formulario público.
- [x] Ofertas internas por cantidad: hasta 10 tramos por producto, activación, vigencia opcional, historial versionado y aplicación explícita al cotizar. PHP resuelve el precio y congela la versión; el resumen no supera la vigencia de la oferta.
- [ ] Combos de varios productos y publicación automática de ofertas en landings.
- [x] Pantalla Mis productos → Precios por cantidad y auditoría privada de cambios/aceptaciones invalidadas.
- [x] 52 checks de edición, ofertas, variantes y preparación, incluidos guardado/reapertura desde navegador y móvil.
- [ ] Espacios por empresa/tienda, miembros y roles; hoy la pertenencia es por usuario.
- [ ] Registro anuncio → oferta → entrada → sesión → pedido.
- [ ] Consentimientos, exclusiones, responsables, tareas y bandeja operativa ampliada.
- [ ] Infraestructura de eventos entrantes, autenticación, outbox y correlación con sistemas externos.

### 5.4 Dropi: envío de órdenes implementado, orden real pendiente

Detalle en [DROPI-ORDERS.md](DROPI-ORDERS.md).

- [x] Contrato tomado del código del plugin Dropify 4.7.3 (wordpress.org): `POST /integrations/orders/myorders` con `dropi-integration-key`, el mismo token del catálogo. No hay documentación oficial pública; Scribd no es accesible sin sesión.
- [x] Botón **Enviar a Dropi** en pedidos confirmados, con vista previa y casilla de revisión. Estado `PENDIENTE CONFIRMACION` y `CON RECAUDO`, elegidos por el usuario el 2026-10-23; la guía se genera al confirmar en Dropi.
- [x] Traducción DANE → departamento/ciudad del plugin (1015 de 1122 municipios; el resto con nombre DANE).
- [x] Estados `sent`/`failed`/`unknown`, número de orden Dropi guardado, sin reintento automático ante resultado desconocido, verificación manual registrada y bloqueo de cambios locales tras el envío.
- [x] 27 checks unitarios y 36 de extremo a extremo contra un Dropi simulado, incluida la interfaz.
- [ ] Primera orden real autorizada: confirmar aceptación, formato de ciudad, confirmación y cancelación en el panel de Dropi.
- [ ] Consultar stock/cobertura/fletes antes de cotizar; hoy el operador lo revisa a mano.
- [ ] Consultar órdenes, guías, estados y novedades; verificar webhooks o polling permitido.
- [ ] Confirmar capacidades de modificación/cancelación y recaudos; no confundir cartera con conciliación de cada pedido.

Referencia histórica: <https://es.scribd.com/document/683043719/Documentacion-de-Dropi-docx-7>. Algunas URLs aparecen como `[Link]` en el contenido accesible. No se implementaron endpoints adivinados ni se crearon órdenes reales con esa documentación.

### 5.5 GHL y WhatsApp pendientes

- [ ] Subcuenta de pruebas, acceso administrativo autorizado y permisos API necesarios.
- [ ] Decidir conexión piloto con token privado o instalación multiempresa por OAuth.
- [ ] Vincular contacto, sesión, oportunidad y pedido exactos; dos compras de un teléfono no deben mezclarse.
- [ ] WhatsApp oficial conectado y validación de capacidades/cargos de la cuenta.
- [ ] Probar GHL → backend → GHL, incluyendo resultado asíncrono sin mensajes duplicados.
- [ ] Asesor IA con fichas aprobadas, captura guiada, cotización y confirmación vinculada a versión.
- [ ] Reconocimiento de anuncio y oferta con metadatos reales; pedir aclaración ante ambigüedad.
- [ ] Intervención humana: pausar bot y seguimientos; reanudación explícita.
- [ ] Plantillas aprobadas y verificación de ventanas/consentimiento antes de cada envío.
- [ ] Recuperación de compras incompletas identificables y parada al comprar/rechazar/revocar permiso.
- [ ] Sincronizar resultados y estados logísticos reales con la oportunidad correcta.

n8n es opcional, no dependencia instalada obligatoria. Para el piloto se pueden utilizar PHP, PostgreSQL y cron; escalar trabajadores según carga. No conectar dos bots como emisores simultáneos del mismo chat.

### 5.6 Finanzas y extensiones posteriores

- [ ] Conciliación de recaudos, producto, fletes, devoluciones, comisiones y margen efectivo.
- [ ] Pagos anticipados con confirmación del proveedor; un comprobante por chat no acredita pago.
- [ ] Shopify y definición de un único responsable de crear órdenes si se incorpora.
- [ ] Audios, comentarios sociales, marketplace de creativos y riesgo externo: fuera del MVP inicial.
- [ ] Piloto supervisado de una tienda en Colombia, un número y 5-10 productos.
- [ ] Pruebas de duplicados, timeout, cambio de dirección, stock agotado, toma humana y múltiples compras; lote supervisado antes de automatizar despachos.

### 5.7 Lo que necesitamos del propietario

- [ ] Confirmar si el piloto será una tienda propia o varias empresas desde el inicio.
- [ ] Conseguir acceso autorizado/documentación de órdenes Dropi y condiciones de pruebas.
- [ ] Autorizar acceso a subcuenta GHL de pruebas y definir quién administra sus conexiones.
- [ ] Elegir número WhatsApp, productos y dos anuncios para pruebas de atribución.
- [ ] Definir ofertas, precios, cobertura, transportadoras y reglas de excepciones.
- [ ] Designar operador que revise pedidos y atienda novedades.
- [ ] Confirmar hosting permanente y presupuesto de servicios externos.

## 6. Entornos, despliegue y secretos

- [x] Supabase PostgreSQL real (histórico): conexión PDO con TLS; migraciones hasta 012 aplicadas. Desde GoDaddy no es accesible (timeout en 5432/6543).
- [x] Demo histórica por túnel temporal de Cloudflare; ya no es el entorno de referencia.
- [x] Configuraciones y guías Apache/Nginx, frontend compilado y rutas al refrescar.
- [x] Despliegue definitivo en GoDaddy cPanel con dominio `tinbana.com`: backend privado en `~/tinvana`, público en `~/public_html`, vía `.cpanel.yml` (confirmado por el usuario el 2026-10-23).
- [x] MariaDB 10.11.19 con `pdo_mysql`, HTTPS (Let's Encrypt raíz y comodín) y cron `mail:work`, `webhooks:work` y `maintenance` funcionando en GoDaddy (confirmado por el usuario el 2026-10-23).
- [ ] Crear y restaurar backup MySQL y medios; probar recuperación.
- [ ] Confirmar que la primera renovación automática de los certificados (diciembre de 2026) se instala sola.

Los destinos anteriores (`dropizenzales.andresceballos.dev`, Hostinger) quedaron descartados.

Ubicaciones privadas a conocer, **sin transcribir su contenido**:

- `backend/.env`: base, clave de cifrado y configuración de servidor.
- Base de datos: tokens de integraciones cifrados, hashes de contraseñas y datos de clientes.
- `.tools/test-env.json`: configuración exclusivamente local de pruebas.
- `.tools/demo-runtime.json` y archivos PID: estado operativo temporal; comprobar antes de usar.
- `backend/storage/`: medios, certificados y almacenamiento privado según configuración.

Conservar `TOKEN_ENCRYPTION_KEY` y los archivos privados al cambiar el proveedor. El usuario autorizó migrar a MySQL para GoDaddy; producción permanece sin cambios mientras terminan las pruebas.

## 7. Pruebas y evidencia

| Comprobación | Último estado conocido | Qué acredita / qué no |
|---|---|---|
| `npm run build` | Aprobado en la etapa de pedidos | TypeScript/Vite y runtime. Advertencias conocidas de tamaño de chunks y assets públicos. |
| `backend/tests/mysql-dialect.php` | 16 checks aprobados el 2026-10-21 | Conversiones de SQL PostgreSQL y semántica `DO NOTHING` cubiertas; no ejecuta SQL en un servidor MySQL. |
| `backend/tests/run.php` | 69 checks aprobados el 2026-10-21 | Pruebas unitarias/funcionales sin conexión a MySQL real. |
| `composer validate` | Correcto el 2026-10-21; advertencia de licencia | Valida manifiesto/lock, no instala ni prueba `pdo_mysql`. |
| Integración MySQL/GoDaddy | Funcionando según el usuario (2026-10-23) | Uso manual en producción; no hay suite automatizada contra MySQL y el asistente no consultó la base del hosting. |
| Correo Resend en producción | Funcionando según el usuario (2026-10-23) | Entrega real reportada por el usuario; no se midió entregabilidad (SPF/DKIM, spam). |
| `npm test` | 107 checks aprobados | Sesión PHP, permisos, publicación, leads y receptor TLS local; no GHL real. |
| `node tests/orders.mjs` | 38 checks aprobados | Pedidos locales, permisos, cotización, expiración, precisión, concurrencia por versión, deduplicación y UI. |
| `node tests/order-editing.mjs` | 52 checks aprobados el 2026-10-23 | Edición/revisión, historial, ofertas versionadas y validación de variantes. Pruebas locales, sin órdenes externas. |
| `backend/tests/dropi-orders.php` | 27 checks aprobados el 2026-10-23 | Cuerpo de la orden, ciudades y clasificación de respuestas; sin red. |
| `node tests/dropi-orders.mjs` | 36 checks aprobados el 2026-10-23 | Envío, rechazo, resultado desconocido, verificación manual, bloqueo de duplicados e interfaz contra un Dropi simulado. **No acredita que la API real de Dropi acepte la orden.** |
| `php -l` PHP afectado | Aprobado | Sintaxis, no prueba externa de negocio. |
| Demo de pedidos | Aprobado en lectura | Ruta pública del panel, API autenticada y renderizado; sin modificar pedidos reales. |
| `node tests/media-delete.mjs` | 28 checks históricos aprobados | Borrado seguro y UI sobre archivos de pruebas. No reejecutado en la entrega de documentación. |
| Cuenta/email | Pruebas aisladas históricas aprobadas | Lógica de cuentas y plantilla; la entrega real se registra en la fila de Resend. |
| Dropi catálogo | Respuestas reales históricas comprobadas | No acredita permisos para crear órdenes. |
| OpenAI | Generación real histórica comprobada | No acredita Claude, saldo futuro ni agente WhatsApp. |

No sumar comprobaciones de distintas fechas como si todas se hubieran ejecutado hoy. `docs/VERIFICATION.md` contiene registros históricos, algunos con pendientes ya superados; contrastar con este estado y las guías de módulo.

### Repetir pruebas sin tocar producción

1. Usar `.tools/test-env.json` con PostgreSQL local `zenzales_test` en `127.0.0.1:55432`.
2. Iniciar PostgreSQL local y aplicar migraciones mediante `.tools/run-test-command.ps1 backend/bin/console.php migrate`.
3. Crear fixtures con `backend/tests/fixtures.php`; iniciar servidor de pruebas con `.tools/start-test-server.ps1` (8081).
4. Ejecutar `TEST_BASE_URL=http://127.0.0.1:8081 npm test`, adaptando asignación de entorno a PowerShell.
5. Para las suites de pedidos, mantener los leads de la suite general y ejecutar el helper de límites local antes de `node tests/orders.mjs` y `node tests/order-editing.mjs` (ver ORDERS.md). La segunda reinicia solo sus fixtures de pedidos/ofertas.
6. Limpiar fixtures con el helper, comprobar identidad de procesos y detener solo servicios de pruebas. No detener demo por confusión de PID/puerto.

Estado al cerrar las pruebas de pedidos: fixtures eliminados y servicios de pruebas detenidos; demo activa en la comprobación realizada. Revisar el estado real en la siguiente sesión.

## 8. Índice de guías

| Tema | Documento |
|---|---|
| Instalación y configuración | [INSTALLATION.md](INSTALLATION.md) |
| API y seguridad | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Despliegue y migración | [DEPLOYMENT.md](DEPLOYMENT.md), [MIGRATION.md](MIGRATION.md) |
| Demo temporal | [TEMPORARY-DEMO.md](TEMPORARY-DEMO.md) |
| Pedidos y correcciones | [ORDERS.md](ORDERS.md) |
| Ofertas y variantes | [PRODUCT-OFFERS.md](PRODUCT-OFFERS.md) |
| Preparación de órdenes Dropi | [DROPI-ORDERS.md](DROPI-ORDERS.md) |
| Superusuario, planes y permisos | [ADMIN.md](ADMIN.md) |
| Consultas, dirección y GHL | [LEAD-FORM.md](LEAD-FORM.md), [GHL.md](GHL.md) |
| Constructor y encabezado | [BUILDER.md](BUILDER.md), [LANDING-HEADER.md](LANDING-HEADER.md) |
| Productos relacionados | [PRODUCT-LIST.md](PRODUCT-LIST.md) |
| IA | [AI-LANDINGS.md](AI-LANDINGS.md) |
| Perfil, cuentas y geografía | [PROFILE.md](PROFILE.md), [ACCOUNT-EMAIL.md](ACCOUNT-EMAIL.md), [GEOGRAPHY.md](GEOGRAPHY.md) |
| Biblioteca | [IMAGES.md](IMAGES.md) |
| Identidad y experiencia | [TINVANA-DESIGN.md](TINVANA-DESIGN.md), [MOTION.md](MOTION.md), [NOTIFICATIONS.md](NOTIFICATIONS.md) |
| Evidencia histórica | [VERIFICATION.md](VERIFICATION.md) |

## 9. Bitácora de hitos y continuidad

Hitos anteriores agrupados por funcionalidad; no se asignan fechas precisas que no estén acreditadas en las guías:

- Base real PHP/PostgreSQL y autenticación; selección y catálogo real Dropi.
- Editor/publicación, formularios con dirección, webhook por usuario y colas.
- IA por cuenta, perfiles, registro/recuperación y geografía.
- Biblioteca mensual y reutilización; rediseño Tinvana y eliminación segura de medios.

### 2026-10-19 · Primera etapa de pedidos

- **Cambio:** migración 011, servicio Orders, API privada, rutas, panel, detalle y vínculo desde consultas.
- **Comprobado:** 107 checks HTTP, 38 de pedidos, compilación, sintaxis y demo pública en lectura.
- **Datos reales:** migración aditiva aplicada; no se convirtieron consultas históricas ni se enviaron órdenes a Dropi.
- **Límites:** dirección solo lectura, cotización y aceptación manuales, sin conexión operativa externa.
- **Siguiente paso recomendado:** editor de datos/dirección con invalidación de cotización; en paralelo validar contrato oficial de órdenes Dropi.

### 2026-10-19 · Documento maestro y protocolo de actualización

- **Cambio:** creado este documento, checklist independiente de la fase nueva, índice y `AGENTS.md` con instrucciones de continuidad; enlazado desde README.
- **Verificación:** lectura de estructura, migraciones y guías; validación de enlaces locales y coherencia con la última entrega. No se reejecutaron pruebas funcionales por cambios exclusivamente documentales.
- **Pendiente externo:** correos reales, hosting definitivo, permisos de órdenes Dropi y subcuenta/WhatsApp de GHL.

### 2026-10-19 · Correcciones de pedidos, ofertas y preparación Dropi

- **Cambio:** edición de comprador/dirección, vuelta de confirmados a revisión, historial de datos/aceptación, ofertas por cantidad con vigencia y versiones, variantes en cotización y lista de preparación sin envío.
- **Esquema:** migración 012 aplicada en Supabase y PostgreSQL local; tablas de ofertas/versiones y snapshots de oferta/variante. No se crearon ofertas ni se editaron pedidos reales durante las pruebas.
- **Comprobado:** 107 checks generales, 38 base y 52 ampliados, build y revisión de escritorio/móvil. Sintaxis de los servicios PHP afectados comprobada.
- **Contrato comercial:** un cambio real invalida cotización/aceptación; si cambia dirección, también flete. Reabrir exige motivo y nueva aceptación. Una oferta modificada no reescribe cotizaciones anteriores; el precio de oferta se resuelve en servidor.
- **Límites:** una partida, ofertas internas sin publicación automática en landings, stock/cobertura/flete manuales. Preparación Dropi no habilita envío.
- **Siguiente paso:** validar contrato y acceso autorizado de órdenes Dropi; después cotización/registro externo seguro. Ofertas/variantes públicas y combos necesitan su propia ampliación.

### 2026-10-21 · Publicación del código en GitHub

- **Cambio:** se conectó el remoto `origin` y se publicó el commit `16733bb` en `master` del repositorio `afceballos/tinvana`; contiene la aplicación, migraciones, documentación, pruebas y recursos de marca.
- **Protección:** `.env`, certificados, sesiones, almacenamiento privado, `.tools`, `node_modules`, skills descargadas y temporales locales quedaron excluidos. No se encontraron patrones de claves en el historial ni en el conjunto preparado.
- **Comprobado:** el `git push` terminó con `master -> master`; la rama local sigue `origin/master`. No se desplegó código en GoDaddy ni se ejecutaron migraciones allí.
- **Siguiente paso:** comprobar en el cPanel Economy PHP y `pdo_pgsql`, conexión TLS a Supabase, raíz pública y Git Version Control; preparar despliegue a pruebas antes de producción.

### 2026-10-21 · Preparación del despliegue en cPanel (GoDaddy)

- **Cambio:** `backend/public/index.php` localiza el backend privado en el directorio padre o, si no existe allí, en `../tinvana` (para `public_html` + `~/tinvana`). Se añadió `.cpanel.yml` (copia el backend privado a `~/tinvana` y la parte pública a `~/public_html` sin tocar `.env`, `vendor` ni `storage`) y `scripts/package-vendor.ps1` (genera `output/deploy/tinvana-vendor.zip`, ignorado por git).
- **Comprobado:** `php -l` de `index.php`; el script generó el zip de `vendor` con Composer sin dependencias de desarrollo. No se probó el despliegue real ni la carga del sitio en cPanel.
- **Límites:** `pdo_pgsql` en el hosting, PHP 8.2+, salida TLS a Supabase, SSH/Terminal, cron y SMTP siguen sin verificar en GoDaddy. `AccountMail` lee el logo en `~/tinvana/public/brand` (lo copia `.cpanel.yml`).
- **Siguiente paso:** seguir [DEPLOYMENT.md](DEPLOYMENT.md#cpanel-git-version-control), ejecutar `console.php check` y probar login y landing.

### 2026-10-21 · Diagnóstico de conexión PostgreSQL y borrador MySQL

- **Resultado reportado por el usuario:** PHP 8.3.33, `pdo_pgsql` disponible, certificado CA no legible; conexión a los puertos 5432 y 6543 con timeout. Esto no acredita credenciales incorrectas; la conexión TCP no se establece.
- **Solicitud:** empezar limpio con una base MySQL que pueda importarse desde phpMyAdmin. Crear ese esquema requiere también adaptar PDO, consultas, migraciones, comandos y pruebas PHP; cambiar solo el SQL no hace compatible la aplicación.
- **Artefacto:** creado `backend/mysql/schema.sql` para MySQL 8.0.16+; no se ejecutó ni validó en un servidor MySQL. No incluye usuario, password hash, token Dropi, URL de webhook ni API key de IA. Los secretos se deben almacenar cifrados por el backend y la clave maestra fuera de la base.
- **Pendiente:** conversión integral a MySQL y pruebas contra una instancia MySQL aislada, o habilitación por GoDaddy de salida TCP a PostgreSQL. Corregir también el archivo CA legible manteniendo verificación TLS.

### 2026-10-21 · Inicio de adaptación PDO para GoDaddy MySQL

- **Cambio:** `Database` permite seleccionar `pgsql` o `mysql` mediante `DB_DRIVER`; `.env.example` declara explícitamente `pgsql` como valor actual por defecto, y `console.php check` comprueba la extensión PDO correspondiente y muestra el motor configurado.
- **Comprobado:** sintaxis PHP de `Database.php` y `console.php`. No se conectó a MySQL ni se ejecutaron migraciones.
- **Estado y límite:** SQL, migraciones e instalación MySQL siguen pendientes. No desplegar ni cambiar `DB_DRIVER` en producción todavía. El usuario informa que la base MySQL ya existe con tablas; la conexión `localhost` debe probarse desde GoDaddy.
- **Siguiente paso:** adaptar las consultas y migraciones, probar contra MySQL aislado y después ejecutar diagnóstico desde el hosting. No usar fixtures sobre la base del usuario.
### 2026-10-21 · Conversión MySQL: capa PDO, dialecto y esquema

- **Cambio:** selector de driver PDO (`pgsql`/`mysql`), comprobación de extensión según driver, conversiones SQL focalizadas (JSON, fechas, upserts, bloqueos y `RETURNING`), rutas MySQL para límites de login/IA, verificador de 18 tablas y registro de esquema base sin recrear tablas. `.cpanel.yml` incluye el paquete privado `backend/mysql`; Composer ya no exige exclusivamente `pdo_pgsql`.
- **Pruebas ejecutadas:** `backend/tests/mysql-dialect.php` (16 checks); `backend/tests/run.php` (69 checks); lint del código PHP propio; `npm run build`; `composer validate` válido con advertencia informativa de licencia. El build conserva avisos de chunk grande y rutas de banderas resueltas en runtime. No se conectó a un MySQL real.
- **Corrección de auditoría:** se preserva el resultado nulo de `INSERT ... ON CONFLICT DO NOTHING RETURNING` cuando no se insertó la fila, evitando duplicar entregas/eventos en reintentos idempotentes.
- **Límites:** el PHP local carece de `pdo_mysql` y no hay servidor MySQL local disponible. No se desplegó ni se alteró la base GoDaddy. El soporte local implementado aún no equivale a compatibilidad integral demostrada.
- **Siguiente paso:** ejecutar `check`/`migrate` desde GoDaddy con la versión/extensión confirmadas y probar los flujos esenciales con datos controlados; no activar tráfico real hasta que terminen.

### 2026-10-21 · Candidato MySQL publicado en GitHub

- **Commit:** `884af33` en `master` de `afceballos/tinvana`; incluye backend MySQL, esquema, build React y guías actualizadas.
- **Dependencias:** generado `output/deploy/tinvana-vendor.zip` (aprox. 4.0 MB) desde `composer.lock`; verificado que contiene `vendor/autoload.php` y no contiene `.env` ni `storage`. El ZIP es un artefacto local excluido de Git.
- **Comprobado:** `git push` completado. No se desplegó en cPanel, no se modificó `~/tinvana/.env` y no se ejecutaron consultas/migraciones en la base GoDaddy.
- **Siguiente paso:** desplegar HEAD desde cPanel, configurar `DB_DRIVER=mysql` y variables MySQL en el `.env` privado; correr `check` y `migrate` y devolver los resultados sin incluir la contraseña.

### 2026-10-21 · Exportación de datos PostgreSQL para MySQL

- **Cambio:** se generó localmente un SQL de solo inserciones a partir de una transacción PostgreSQL `READ ONLY`; no se cambió ni escribió en Supabase. Incluye las tablas de negocio y no incluye `schema_migrations` ni los límites temporales `rate_limits`.
- **Protección de transición:** tokens Dropi, webhook y claves de IA se descifraron en memoria y se volvieron a cifrar con una clave nueva, entregada en un archivo `.env` privado separado. Los enlaces de cuenta se invalidan y las entregas GHL pendientes/en proceso se marcan fallidas para revisión manual antes de reintentar.
- **Archivos locales excluidos de Git:** `.tools/tinvana-mysql-data.sql`, `.tools/tinvana-mysql-encryption.env` y `.tools/tinvana-media.zip`. Los medios se trasladan aparte del SQL.
- **Límite:** la base MySQL de GoDaddy aún no ha sido importada ni comprobada. Importar datos requiere tablas vacías con `backend/mysql/schema.sql` ya aplicado; verificar claves, relaciones, medios y login antes del corte. El dump contiene datos personales y se debe mantener privado.

### 2026-10-21 · Diagnóstico del error de conexión en producción

- **Reporte:** el usuario sigue viendo “PostgreSQL no está disponible” al completar una operación en el sitio.
- **Hallazgo de código:** `backend/public/index.php` imprimía ese texto fijo ante cualquier `PDOException`, aunque `DB_DRIVER=mysql`; el mensaje no permitía concluir qué motor estaba activo.
- **Cambio local:** el error visible ahora nombra el motor configurado y los logs registran solo driver y SQLSTATE. También se reconoce el SQLSTATE/clave de duplicado MySQL para responder conflicto correctamente, sin registrar DSN, credenciales ni mensaje PDO.
- **Documentación:** `docs/DEPLOYMENT.md` explica confirmar el HEAD desplegado, ubicación privada del `.env`, `DB_DRIVER=mysql`, `pdo_mysql` y ejecutar `php ~/tinvana/bin/console.php check` seguido de `migrate` desde cPanel.
- **Comprobado:** inspección del código y edición local. No se ha desplegado esta corrección ni probado el PHP/MySQL productivo; por tanto, la causa de la conexión sigue pendiente.
- **Siguiente paso:** desplegar el cambio y obtener el resultado literal de `php ~/tinvana/bin/console.php check` (sin mostrar variables ni secretos). Si no hay Terminal en el plan, revisar el error log de PHP de cPanel y confirmar que el commit HEAD se desplegó.
### 2026-10-21 · Capa visual moderna, modo oscuro y plantilla de marca

- **Cambio:** solo frontend. Nueva capa de movimiento y profundidad (barra lateral flotante con píldora deslizante, encabezado de vidrio, tarjetas y botones con micro-interacciones, diálogos y avisos con entrada suave), modo oscuro con interruptor y revelado circular, y rediseño de «Plantilla de marca» con paletas, contraste y vista previa en vivo. Guía: [MODERN-UI.md](MODERN-UI.md).
- **Comprobado:** `npm run build`; `node tests/modern.mjs` con 17 comprobaciones sobre API simulada; el `PUT /api/template-settings` sigue enviando los mismos cuatro campos. Capturas locales en claro y oscuro de login, catálogo, plantilla y constructor.
- **Límites:** modo oscuro revisado con datos simulados y estados vacíos en el resto de pantallas; sin ejecutar las pruebas con base local ni probar en GoDaddy. Las landings publicadas no cambian.
- **Siguiente paso:** revisar pedidos, archivos y consultas con datos reales en oscuro; decidir si se moderniza también el diseño de las landings públicas.

### 2026-10-22 · Barra lateral con scroll interno y scrolls sutiles

- **Cambio:** solo frontend. La barra lateral deja fijos cabecera y pie; solo la lista de opciones se desplaza, sin barra visible y con desvanecidos de borde. El resto de scrolls usan barras finas y translúcidas, con variante oscura. Detalle en [MODERN-UI.md](MODERN-UI.md).
- **Comprobado:** `npm run build`; `node tests/modern.mjs` (17 comprobaciones); revisión con ventana baja en claro y oscuro (sin scroll en la barra, lista desplazable, botón de contraer visible, estado contraído).
- **Límites:** los scrolls internos se revisaron visualmente solo en el constructor con datos simulados; sin pruebas con base local ni en GoDaddy.

### 2026-10-22 · Listas compactas de productos, consultas y pedidos

- **Cambio:** solo frontend. Tarjetas compactas en Mis productos con filtros y búsqueda, filas con avatar, contadores y chips en Consultas y Pedidos, detalle de consulta como panel lateral y ficha del pedido con resumen tipo factura y línea de tiempo. Sin cambios de API, datos ni flujos. Detalle en [MODERN-UI.md](MODERN-UI.md).
- **Comprobado:** `npm run build`; `node tests/compact.mjs` con 27 comprobaciones y `node tests/modern.mjs` con 17, ambos con API simulada; capturas en claro y oscuro.
- **Ajuste posterior:** toda la fila de consultas y pedidos es clicable; el botón es una flecha con nombre accesible.
- **Límites:** los contadores de consultas y pedidos son de la página cargada; no se añadieron datos de pago ni acciones inexistentes en el sistema; pruebas con base local y despliegue en GoDaddy sin ejecutar.

### 2026-10-22 · Corrección de la pantalla de carga inicial

- **Problema:** al cargar la hoja principal, el contenido de la pantalla de carga saltaba de estar centrado a quedar pegado arriba y se mantenía así mientras se verificaba la sesión. Causa: `backend/public/brand/brand.css` (logo y pie fijos, contenido centrado) y `src/motion.css` (logo y pie en el flujo con `space-between`) definían `.startup-loader` de forma incompatible.
- **Cambio:** `motion.css` usa el mismo esquema (contenido centrado, logo y pie fijos) y `LoadingScreen` usa el mismo logo que el HTML inicial, para que el paso del HTML a React no mueva ni cambie nada.
- **Comprobado:** medición cuadro a cuadro con la sesión retrasada, en claro y oscuro; `node tests/preload.mjs` (12 comprobaciones, API simulada): contenido centrado y sin movimiento entre el HTML y React a 1440 y 390 px. `tests/modern.mjs` (17) y `tests/compact.mjs` (27) siguen aprobando.
- **Límites:** los primeros milisegundos antes de que termine de cargar el CSS dependen del navegador y la red; no se probó en GoDaddy. `tests/motion.mjs` (con base local) no se ejecutó.

### 2026-10-22 · Correos de cuenta: marca, diagnóstico y configuración en cPanel

- **Hallazgos:** en producción faltaban `SMTP_*`/`RESEND_API_KEY` (solo existía `MAIL_FROM_ADDRESS`), por lo que registro y recuperación respondían «El envío de correos de cuenta todavía no está configurado»; además los envíos de la cola requieren el cron `mail:work`, y los errores de entrega no quedaban registrados.
- **Cambio:** plantilla con la marca Tinvana (logo PNG `tinvana-mail.png`, colores y textos), remitente «Tinvana», `SMTP_HOST=localhost` sin verificación de certificado (tráfico local), registro en `error_log` del motivo de cada fallo sin datos personales, `AccountMail::diagnose()` y comando `php bin/console.php mail:test correo@dominio`. Guía en [ACCOUNT-EMAIL.md](ACCOUNT-EMAIL.md).
- **Comprobado:** `node tests/mail-local.mjs` (8 comprobaciones) contra SMTP TLS local; `php backend/tests/account-resend.php` actualizado y aprobado; vista previa visual de los dos correos. **No** se envió ningún correo real ni se accedió a tinbana.com.
- **Pendiente:** crear el buzón (o cuenta Resend), completar el `.env` del servidor, crear el cron `mail:work` y ejecutar `mail:test` allí; confirmar que la consulta de cola funciona en MySQL (no hay MySQL local).

### 2026-10-22 · Resend como transporte de correo

- **Decisión:** usar Resend (HTTPS) en lugar de SMTP del hosting. El transporte ya existía; se mejoró el diagnóstico: `mail:test` comprueba la conexión HTTPS con `api.resend.com` y los fallos de Resend informan estado HTTP y motivo con la clave oculta.
- **Comprobado:** `php backend/tests/account-resend.php` (ahora exige el estado HTTP y que la clave no aparezca) y `node tests/mail-local.mjs`. No se contactó con Resend ni se envió ningún correo real.
- **Pendiente:** cuenta de Resend, verificación DNS de `tinbana.com` en GoDaddy, clave de API, variables en el `.env` del servidor, cron `mail:work` y `mail:test` en el servidor; confirmar la cola en MySQL.

### 2026-10-22 · HTTPS con Let's Encrypt en GoDaddy

- **Contexto:** se canceló el SSL de pago que GoDaddy cobró sin consulta; el hosting no tiene AutoSSL ni Terminal.
- **Cambio de infraestructura (sin cambios de código):** certificado de Let's Encrypt para `tinbana.com` y `www.tinbana.com` emitido e instalado con `acme.sh` y el gancho `cpanel_uapi` desde tareas de cron. Procedimiento en [DEPLOYMENT.md](DEPLOYMENT.md#https-en-godaddy-sin-autossl-letsencrypt-con-acmesh-por-cron).
- **Comprobado:** el navegador muestra el certificado de Let's Encrypt; el registro de `acme.sh` informa éxito y la próxima renovación el 21 de diciembre de 2026.
- **Pendiente de confirmar:** que la primera renovación automática (diciembre de 2026) se instale sola.

### 2026-10-22 · Subdominio opcional por landing y certificado comodín
- **Infraestructura (en producción):** registro DNS `A` `*`, CNAME `_acme-challenge` hacia acme-dns, certificado comodín de Let's Encrypt (`tinbana.com` y `*.tinbana.com`) emitido con `acme.sh --dns dns_acmedns` desde cron e instalado con `cpanel_uapi`, y dominio `*.tinbana.com` en cPanel. Comprobado desde fuera: `tinbana.com`, `www` y subdominios arbitrarios sirven el certificado nuevo (vence el 20 de enero de 2027) y responden HTTP 200 con la app.
- **Cambio de código inicial (histórico, sustituido el mismo día):** subdominio elegido por cada landing (migración 013, commit `9353369`). Se reemplazó por el subdominio de tienda de la entrada siguiente; las columnas `landing_pages.subdomain` y `published_subdomain` quedaron sin uso.
- **Comprobado (histórico):** las pruebas de ese diseño (46, 12 y 18 comprobaciones) se retiraron junto con él.
- **Limitaciones / pendiente:** confirmar que la primera renovación automática del comodín (diciembre de 2026) se instale sola; las cron de `maintenance` y `webhooks:work` necesitan `-d register_argc_argv=1` (ver DEPLOYMENT.md).

### 2026-10-22 · Subdominio por usuario (tienda)
- **Decisión del usuario:** cada usuario es una tienda; el subdominio es del usuario, no de cada producto, y los enlaces de sus productos quedan en él con las mismas reglas de nombre. Ampliación expresamente pedida (no solo visual).
- **Cambio:** `users.store_subdomain` (migración 014 en PostgreSQL y MySQL), clase `Store`, tarjeta «Tu tienda» en el perfil (`PUT /api/profile/store`), enlaces `<tienda>.<dominio>/p/<slug>` en la página, consultas, mapa del sitio, «Mis productos» y constructor; router que aísla cada tienda (solo sirve sus landings publicadas; tienda inexistente o raíz de tienda: 404). Se retiró el selector por landing. Guía: [STORE-SUBDOMAIN.md](STORE-SUBDOMAIN.md).
- **Comprobado (local, base PostgreSQL aislada, datos propios eliminados):** `store-subdomain.php` 50, `store-router.mjs` 20, `store-address.mjs` 20; regresión: `backend/tests/run.php` 69, `blocks.php` 101, `header.php` 15, `mysql-dialect.php` 16, `compact.mjs` 27, `modern.mjs` 17, `preload.mjs` 12; `tsc -b` y compilación sin errores.
- **Limitaciones / pendiente:** la migración MySQL no se probó con un MySQL real; hay que desplegar, ejecutar `migrate` (aplica 013 y 014) en el servidor y probar con una tienda real; la raíz de la tienda (`<tienda>.tinbana.com/`) devuelve 404 hasta que exista una página de inicio de tienda; cambiar el nombre de la tienda invalida los enlaces anteriores.

### 2026-10-22 · Tarjeta «Webhook actual» rediseñada
- **Cambio visual (sin tocar la API ni la lógica):** se quitó el borde izquierdo de color; tarjeta redondeada con icono, chip de estado y la URL enmascarada en un recuadro. Detalle en [MODERN-UI.md](MODERN-UI.md#tarjeta-webhook-actual).
- **Comprobado:** `tests/webhook-card.mjs` 13, y sin regresiones en `modern.mjs` 17, `compact.mjs` 27, `preload.mjs` 12 y `store-address.mjs` 20; `tsc -b` y compilación sin errores. Revisión visual en tema claro y oscuro. No se probó con un webhook real.

### 2026-10-22 · Alertas e informativos con color por tipo
- **Cambio visual (sin tocar lógica ni roles ARIA):** éxito verde, error rojo, advertencia ámbar e información azul, en notificaciones flotantes y mensajes en línea, con tema oscuro propio y sin borde lateral de color. Detalle en [NOTIFICATIONS.md](NOTIFICATIONS.md#colores-por-tipo-y-estilo-moderno-sin-borde-lateral).
- **Comprobado:** `tests/alerts.mjs` 18; sin regresiones en `modern.mjs` 17, `compact.mjs` 27, `preload.mjs` 12, `store-address.mjs` 20 y `webhook-card.mjs` 13; `tsc -b` y compilación sin errores; revisión visual en tema claro y oscuro.
- **No comprobado:** `tests/notifications.mjs` (usa un túnel externo caducado); los mensajes de las landings públicas no se modificaron.

### 2026-10-23 · Producción en GoDaddy confirmada
- **Reporte del usuario:** «ya todo está ok». Funcionan en `tinbana.com` el despliegue con MySQL (migraciones hasta 014), login y flujos de la aplicación, correo con Resend (cron `mail:work`), HTTPS Let's Encrypt raíz y comodín, subdominio por tienda y cron `webhooks:work`/`maintenance`.
- **Comprobado por el asistente:** solo que el repositorio local coincide con `origin/master` (commit `463808a`). No se accedió al servidor, a la base ni a Resend; el estado de producción es el que reporta el usuario.
- **Cambio:** solo documentación; se actualizaron la lectura rápida, las casillas de MySQL, correo y despliegue, la tabla de migraciones (013 y 014) y [ACCOUNT-EMAIL.md](ACCOUNT-EMAIL.md).
- **Pendiente:** backup y restauración de MySQL y medios; confirmar la renovación automática de certificados en diciembre de 2026; contrato de órdenes Dropi; GHL/WhatsApp.

### 2026-10-23 · Envío de pedidos a Dropi
- **Cambio:** `DropiOrders` envía pedidos confirmados a `POST https://api.dropi.co/integrations/orders/myorders` (contrato del plugin Dropify 4.7.3) con estado `PENDIENTE CONFIRMACION` y `CON RECAUDO`; migración 015 (PostgreSQL y MySQL); rutas `/api/orders/{id}/dropi` y `/dropi/resolve`; sección **Envío a Dropi** con vista previa; `backend/resources/geo/dropi-co.json`. Guía: [DROPI-ORDERS.md](DROPI-ORDERS.md).
- **Comprobado (local, PostgreSQL aislado, Dropi simulado):** `dropi-orders.php` 27, `dropi-orders.mjs` 36; regresión `npm test` 107, `orders.mjs` 38, `order-editing.mjs` 52, `run.php` 69, `mysql-dialect.php` 16, `compact.mjs` 27, `modern.mjs` 17; `tsc -b` y compilación sin errores. Fixtures retirados y servicios de prueba detenidos.
- **No comprobado:** ninguna llamada a la API real de Dropi; migración 015 sin aplicar en MySQL de GoDaddy.
- **Siguiente paso:** desplegar, `migrate`, y una orden real de prueba autorizada por el usuario; revisarla y cancelarla o confirmarla en Dropi.

### 2026-10-23 · Migraciones por cron en GoDaddy (MariaDB)
- **Resultado reportado por el usuario (log del cron):** `Aplicada: 014_store_subdomain.sql` y servidor `10.11.19-MariaDB`. La 014 **no estaba aplicada** hasta hoy, aunque antes se había registrado como aplicada; queda corregido. Después, `migrate:auto` empezó la 015 sin escribir resultado.
- **Causa:** `DROP CHECK` en `backend/mysql/migrations/015` es sintaxis exclusiva de MySQL y MariaDB la rechaza; la sentencia es única y no aplicó nada. El error no apareció porque PHP CGI del cron no define `STDERR`.
- **Cambio:** la 015 usa `DROP CONSTRAINT` (MariaDB 10.2+ y MySQL 8.0.19+); `console.php` envía los errores a la salida cuando no hay `STDERR` e incluye el SQLSTATE. Comando `migrate:auto` para cron cada minuto. El paso `migrate` de `.cpanel.yml` se retiró porque el despliegue se quedó cargando.
- **Comprobado:** `php -l`, `mysql-dialect.php` 16 y `migrate:auto` dos veces contra PostgreSQL local. Sin MariaDB local: la 015 corregida no se ha ejecutado contra MariaDB.
- **Siguiente paso:** desplegar, revisar en `~/migrate.log` que diga `Aplicada: 015_dropi_order_submission.sql`, y después hacer la orden real de prueba en Dropi.

### 2026-10-23 · Formulario de landing: país del teléfono
- **Reporte del usuario:** al enviar el formulario de una landing, la consola mostraba «An invalid form control with name='phone_country' is not focusable» y no se enviaba.
- **Diagnóstico:** el selector nativo de país del teléfono está oculto tras el de banderas y, a diferencia de departamento y ciudad, no tenía manejador de `invalid`; si quedaba vacío, el navegador bloqueaba el envío sin mensaje. No se reprodujo cómo quedó vacío en el caso del usuario: 244 países, prefijos escritos a mano y la landing real `andres.tinbana.com` (sin enviar) dejaron el campo válido.
- **Cambio:** `src/lead-form.ts` sincroniza el país solo con valores existentes, se corrige y reenvía si el oculto queda vacío, y muestra «Selecciona el país de tu teléfono.» en el campo visible cuando no hay país. Guía: [LEAD-FORM.md](LEAD-FORM.md).
- **Comprobado:** `tests/lead-phone-country.mjs` 6 y `tests/delivery-ui.mjs` en local; `tsc -b` y compilación. Sin desplegar.

### 2026-10-23 · Teléfono: «Verifica el teléfono y su prefijo internacional»
- **Reporte del usuario:** el formulario respondía ese mensaje aunque escribía el número con su prefijo.
- **Diagnóstico (local):** con el prefijo mostrado aparte, teclear `+` abre el buscador de países (comportamiento de `intl-tel-input`); escribir el prefijo sin `+` funciona, pero un `57` repetido o un `0` inicial llegan inválidos al servidor. La ayuda decía «Confirma el país y el prefijo de tu número». En la corrección de pedidos, escribir `57…` producía `+5757…`.
- **Cambio:** `DeliveryAddress::phone` reintenta sin ceros iniciales ni código de país repetido, y da un mensaje con el prefijo elegido que pide escribir sin él; la ayuda pide elegir la bandera y escribir sin prefijo. Guía: [LEAD-FORM.md](LEAD-FORM.md).
- **Comprobado:** `phone.php` 16, `run.php` 69, `npm test` 107, `delivery-ui.mjs`, `lead-phone-country.mjs` 6, `profile.mjs`, `order-editing.mjs` 52. No se sabe qué número exacto usó el usuario.

### 2026-10-23 · Confirmación animada al enviar el formulario
- **Pedido del usuario:** al enviar no se veía confirmación; cerrar el popup y mostrar otro con el pájaro de papel, moderno y con el estilo de la página.
- **Cambio:** `src/lead-success.ts`, `src/success-bird.ts`, estilos en `src/landing-form.css` y enganche en `src/landing-runtime.ts`. Pautas de las skills `gsap-core` (timeline, transformaciones, reducción de movimiento) y `ui-ux-pro-max` (confirmación visible, salida más rápida que la entrada, cierre claro). El buscador de `ui-ux-pro-max` no se pudo ejecutar porque no hay Python instalado; se consultaron sus CSV y referencias directamente. Guía: [LEAD-FORM.md](LEAD-FORM.md).
- **Comprobado (local):** `lead-success.mjs` 12, `lead-phone-country.mjs` 6, `delivery-ui.mjs`, `tsc -b` y compilación; capturas en escritorio y móvil.

### 2026-10-23 · Notificaciones flotantes sin recuadro
- **Reporte del usuario:** las tarjetas de error e informativas se veían como cortadas, con un recuadro alrededor de la sombra.
- **Causa:** `.toast-viewport` tiene `overflow` y solo 6 px de relleno, y recortaba la sombra de la tarjeta.
- **Cambio:** más relleno y posición compensada en `src/notifications.css`. Detalle en [NOTIFICATIONS.md](NOTIFICATIONS.md).
- **Comprobado:** `alerts.mjs` 18, `modern.mjs` 17, `compact.mjs` 27; capturas en claro y oscuro (escritorio). La vista móvil no se capturó.

### 2026-10-23 · MariaDB local, error al cotizar, fechas y rediseño del pedido
- **Reporte del usuario:** guardar la cotización respondía «MySQL no está disponible»; el detalle del pedido «se ve muy plantilla»; el envío debería venir prellenado.
- **Causa del error (reproducida en MariaDB 10.11.19 local):** la emulación de `UPDATE … RETURNING` pasaba demasiados parámetros (`HY093`). Afectaba a cotizar, aceptar, corregir, reabrir, cancelar y enviar a Dropi en producción. También fallaba la fecha ISO de las ofertas (`22007`) y las fechas se mostraban 5 horas corridas. Detalle en [MIGRATION.md](MIGRATION.md#errores-de-mariadb-corregidos-2026-10-23).
- **Cambio:** `MySqlDialect`, `Database` (fechas ISO UTC y `timestamp()`), `Orders` (`shipping_hint`, fecha de oferta), rediseño de `OrderDetail` y `order-detail.css`, y cabecera con icono en `OrderDropi`. Guía: [ORDERS.md](ORDERS.md).
- **Comprobado en MariaDB:** `order-editing.mjs` 52, `dropi-orders.mjs` 36, `compact.mjs` 27, `modern.mjs` 17, `lead-success.mjs` 12.
- **Comprobado en PostgreSQL:** `npm test` 107, `orders.mjs` 38, `order-editing.mjs` 52, `dropi-orders.mjs` 36, `compact.mjs` 27, `alerts.mjs` 18, `delivery-ui.mjs`, `lead-phone-country.mjs` 6, `lead-success.mjs` 12, `run.php` 69, `mysql-dialect.php` 18, `phone.php` 16, `shipping-hint.php` 9 y `dropi-orders.php` 27. También `tsc -b` y la compilación; capturas en claro, oscuro y móvil.
- **No comprobado:** el despliegue en GoDaddy con estos cambios.

### 2026-10-23 · Integraciones Dropi con el estilo de Conexión GHL
- **Pedido del usuario:** que la página de integraciones Dropi mantenga los estilos de Conexión GHL.
- **Cambio:** solo interfaz, sin tocar la API (`src/DropiIntegrations.tsx`, `src/modern.css`). Detalle en [MODERN-UI.md](MODERN-UI.md).
- **Comprobado:** `dropi-integrations-ui.mjs` 10, `webhook-card.mjs` 13, `modern.mjs` 17, compilación; capturas en claro, oscuro y móvil con la API simulada. No se probó con un token real.

### 2026-10-23 · Precio sugerido en el editor; envío calculado por Dropi pendiente
- **Pedido del usuario:** mostrar el precio sugerido de Dropi y, opcionalmente, el envío que calcula Dropi según la ciudad, sumado al total del formulario.
- **Cambio:** precio sugerido con el botón **Usar precio sugerido** en `src/Builder.tsx`. Guía: [BUILDER.md](BUILDER.md).
- **Comprobado:** comprobación manual en el editor local (aparece $20.000 y se aplica) y `builder.mjs` completa en PostgreSQL local.
- **Pendiente:** el cálculo automático del envío necesita confirmar el cotizador de Dropi con una consulta de solo lectura y el token real. No se implementaron endpoints adivinados.

### 2026-10-23 · Envío calculado por Dropi en las landings
- **Descubrimiento:** el usuario ejecutó `dropi:shipping-probe` en producción. `orders/cotizaEnvioTransportadoraV2` cotiza por transportadora con DANE de 8 dígitos (origen: ciudad de la bodega del producto). Ejemplo Cali → Bogotá contra entrega: ENVIA $16.164 … DEROCHA-EXPRESS $22.400. Algunas transportadoras devuelven error (mínimos o bodega).
- **Decisiones del usuario:** transportadora más barata disponible, redondeada hacia arriba a $1.000 y sumada al total del formulario.
- **Cambio:** `DropiShipping`, ruta `/p/{slug}/shipping`, opción en el editor, resumen en el formulario, consulta y webhook con el envío, y pedido con el envío prellenado. Detalle en [BUILDER.md](BUILDER.md).
- **Comprobado (local, PostgreSQL y Dropi simulado):** `dropi-shipping.mjs` 20, `dropi-shipping.php` 9; regresión `npm test` 107, `orders.mjs` 38, `order-editing.mjs` 52, `dropi-orders.mjs` 36, `delivery-ui.mjs`, `lead-phone-country.mjs` 6, `lead-success.mjs` 12, `builder.mjs`, `webhook-card.mjs` 13 y las pruebas PHP.
- **No comprobado:** la cotización real desde el formulario en producción; es lo primero que hay que probar tras desplegar.

### 2026-10-23 · IA, perfil y contraseña con el estilo de Conexión GHL
- **Pedido del usuario:** Integraciones de IA y otros módulos se veían básicos; unificarlos con el estilo de GHL e Integraciones Dropi.
- **Cambio:** solo interfaz (`AiSettings.tsx`, `StoreAddress.tsx`, `Profile.tsx`, `ui.tsx`, `modern.css`). Detalle en [MODERN-UI.md](MODERN-UI.md).
- **Comprobado:** `store-address.mjs` 20, `alerts.mjs` 18, `modern.mjs` 17, `compact.mjs` 27, `webhook-card.mjs` 13, `dropi-integrations-ui.mjs` 10 y `profile.mjs`; capturas de escritorio con API simulada.

### 2026-10-23 · Correos de pedidos y su configuración
- **Pedido del usuario:** correo al comprador al entrar, confirmarse o cancelarse un pedido; correo al usuario por cada pedido nuevo; mismo estilo que los correos de cuenta; configuración en el perfil.
- **Cambio:** `OrderMail`; `AccountMail` separado en `layout()` y `deliver()` sin cambiar los correos de cuenta; migración 016; cola procesada por `mail:work`; pantalla **Correos de pedidos** con vista previa y prueba. Guía: [ACCOUNT-EMAIL.md](ACCOUNT-EMAIL.md#correos-de-pedidos-2026-10-23).
- **Comprobado (PostgreSQL local):** `order-mail.mjs` 23, `order-mail-worker.php` 11, `account-resend.php`, `mail-local.mjs` 8; regresión `npm test` 107, `orders.mjs` 38, `order-editing.mjs` 52, `dropi-orders.mjs` 36, `dropi-shipping.mjs` 20, `delivery-ui.mjs`, `lead-success.mjs` 12, `profile.mjs`, `modern.mjs` 17, `compact.mjs` 27, `run.php` 69 y `mysql-dialect.php` 19.
- **Pendiente en producción:** desplegar, aplicar la migración (cron `migrate:auto` o `migrate`) y probar con **Enviarme una prueba** y un pedido real.

### 2026-10-23 · Seguimiento de pedidos en Dropi
- **Reporte del usuario:** los pedidos ya se envían a Dropi; quiere ver el estado y su historial en Tinvana.
- **Descubrimiento:** `dropi:order-probe` en producción confirmó `GET orders/myorders/{id}` con estado, historial, guía, transportadora y flete. Detalle en [DROPI-ORDERS.md](DROPI-ORDERS.md#seguimiento-de-órdenes-en-dropi-2026-10-23).
- **Cambio:** `DropiTracking`, migración 017, cron `dropi:sync`, botón **Actualizar desde Dropi**, historial de estados y diferencia de flete en el detalle; estado de Dropi en la lista.
- **Comprobado (local, Dropi simulado):** `dropi-tracking.mjs` 19, `dropi-tracking.php` 8; regresión `orders.mjs` 38, `order-editing.mjs` 52, `dropi-orders.mjs` 36, `dropi-shipping.mjs` 20, `order-mail.mjs` 23, `compact.mjs` 27, `modern.mjs` 17 y las pruebas PHP.
- **Pendiente en producción:** desplegar, migrar, crear el cron `dropi:sync` cada 10 minutos y comprobar con un pedido real.

### 2026-10-23 · Estados de Dropi reflejados en Tinvana
- **Pedido del usuario:** si el pedido cambia de estado o se cancela en Dropi, que cambie también en Tinvana.
- **Cambio:** la logística sigue a Dropi; la cancelación en Dropi cancela la venta y avisa al comprador; la barra de avance tiene el paso «Entregado». Migración 018. Detalle en [DROPI-ORDERS.md](DROPI-ORDERS.md).
- **Comprobado (local):** `dropi-tracking.mjs` 26, `dropi-tracking.php` 11 y la regresión de pedidos, Dropi, correos e interfaz.

### 2026-10-23 · Envío confirmado y notas de Dropi (transportadora retirada)
- **Prueba real del usuario:** se eligió ENVIA y Dropi asignó VELOCES. La API ignora la transportadora, así que se retiró el selector y ya no se envía ese campo.
- **Se mantiene:** el envío pendiente o confirmado, con aceptación obligatoria para confirmada.
- **Nuevo:** las notas que se escriben en Dropi al cambiar de estado o cancelar se ven en el historial de Dropi y en el de Tinvana.
- **Comprobado (local, con Dropi simulado):** regresión completa.
- **Sin verificar en Dropi real:** que `PENDIENTE` equivalga a confirmar y el nombre del campo `notes` en una cancelación real.

### 2026-10-23 · Superusuario, planes y permisos
- **Pedido del usuario:** un superusuario para administrar las cuentas, activar o desactivar funciones, y gestionar planes y límites de landings, con valor global y valor por cuenta. Hoy todas las cuentas conservan acceso a todo.
- **Cambio:**
  - rol `superadmin`, asignado solo por consola;
  - sección Administración con cuentas, planes, valores globales y auditoría;
  - funciones y límites en tres capas: global, plan y cuenta;
  - suspensión de cuentas, con las landings fuera de línea.
  - Detalle en [ADMIN.md](ADMIN.md).
- **Corrección encontrada:** `/panel/correos` faltaba en la lista de rutas del panel que sirve PHP, así que al recargar daba 404. Corregido junto con las rutas de administración.
- **Comprobado (local):** `admin.mjs` 39 y la regresión de pedidos, Dropi, correos, perfil, tienda, constructor, IA e interfaz.
- **Pendiente:** aplicar en producción (deploy y `migrate:auto`, migraciones 020 a 025) y asignar el superusuario con `superadmin:grant`. La pasarela de pago y la página pública de planes son el siguiente paso.

### 2026-10-24 · Filtro de pedidos por fecha
- **Cambio:** filtro por rango de fechas de creación en la lista de pedidos, en días de Colombia, con atajos y el rango en la URL. Detalle en [ORDERS.md](ORDERS.md).
- **Comprobado (local):** `order-dates.mjs` 13 (incluye el límite de medianoche en hora de Colombia), `orders.mjs` 38, `order-editing.mjs` 52, `admin.mjs` 39 y `npm test` 107.

### 2026-10-24 · Página de error animada y redirección por sesión vencida
- **Cambio:**
  - página de error con la marca, animada, para el 404 del panel y para todas las páginas que rechaza el servidor;
  - la vigilancia de sesión no la renueva y lleva al inicio de sesión con un aviso y regreso a la página anterior.
  - Detalle en [MODERN-UI.md](MODERN-UI.md).
- **Comprobado (local):** `errors-session.mjs` 15 (sesión de 8 s: las consultas de sondeo no la renuevan), `npm test` 107, `orders`, `order-dates`, `admin`, `compact` y `modern`.

### 2026-10-24 · Nueva pantalla de precarga
- **Cambio:** una sola escena animada (HTML y React con el mismo marcado y una sola hoja `preload.css`) y una salida de despegue en lugar de la entrada separada. Detalle en [MODERN-UI.md](MODERN-UI.md).
- **Comprobado (local):** `preload.mjs` 23, `errors-session.mjs` 15, `npm test` 107, `admin`, `orders`, `compact` y `modern`.
- **Limitación:** `motion.mjs` apunta a una URL de túnel antigua y no se puede ejecutar; no se modificó.
- **Observación:** `errors-session.mjs` falló una vez justo después de otras pruebas, sin causa identificada; las tres ejecuciones siguientes pasaron (15/15).

### 2026-10-24 · Precarga con duración mínima
- **Cambio:** a pedido del usuario, la precarga dura un mínimo de 1,8 s desde el inicio de la carga, más el despegue, para que se alcance a ver sin alargar las cargas lentas.
- **Comprobado (local):** `preload.mjs` 25 (medido: despegue a 2.024 ms y fin a 2.853 ms), `npm test` 107, `admin` 39 y `order-dates`.

### 2026-10-24 · Rediseño de las landings
- **Pedido del usuario:** bloques más modernos, animados y con mejor llamado a la acción, carga rápida, WhatsApp flotante, compartir opcional, cuadrículas sin huecos y configuración en la plantilla.
- **Cambio:**
  - tres estilos (moderno por defecto, cálido y audaz) y cuatro tipografías;
  - contraste automático del botón y ahorro real;
  - barra fija al pasar el producto, WhatsApp flotante y compartir opcional;
  - cuadrículas sin huecos y movimiento con CSS;
  - script de 160 KB a 91 KB, sin GSAP.
  - Se aplica a todas las landings (también las publicadas) sin cambiar su contenido. Detalle en [BUILDER.md](BUILDER.md).
- **Comprobado (local):** `landing-design.mjs` 33, `template-design.mjs` 6, y regresión aislada idéntica a la línea base (`npm test` 107, PHP 69, `builder`, `lead-success`, `dropi-shipping`, `product-list`, `dropi-block`, `delivery-ui`, `store-router`, `orders`…). Capturas de los tres estilos en escritorio y móvil revisadas.
- **Pendiente:** verlo con productos e imágenes reales en producción; las pruebas usan imágenes de prueba.

### 2026-10-24 · Ritmo visual en landings generadas con IA
- **Cambio:** las landings completas creadas con IA alternan fondos entre secciones y cierran con una banda de llamado a la acción. Heredan el estilo, la tipografía, los colores y los botones flotantes de la landing. Detalle en [BUILDER.md](BUILDER.md).
- **Comprobado (local):** `ai.php` 38 y `landing-design.mjs` 34.

### 2026-10-24 · Ajustes del rediseño: imagen fija, llamado a la acción y pasos
- **Cambio:** imagen fija junto a textos largos; llamado a la acción como título, texto, precio y botón, centrado por defecto; pasos con número centrado. Además se corrigió la barra fija de compra, que podía no aparecer con un desplazamiento rápido. Detalle en [BUILDER.md](BUILDER.md).
- **Comprobado (local):** `landing-design.mjs` 39, `lead-success` 12, `builder`, `product-list`, `dropi-shipping` 20 y `ai.php` 38.

### Plantilla para la próxima actualización

```text
AAAA-MM-DD · Nombre del cambio
- Cambio: comportamiento final y archivos/guías afectados.
- Checklist: marcar solo lo concluido; mantener dependencias pendientes.
- Comprobado: comandos, entorno y resultados reales.
- Datos reales: migraciones, despliegue o acciones externas efectuadas, si hubo.
- Límites y siguiente paso: qué falta y qué acceso/decisión lo desbloquea.
```

El historial no sustituye la actualización de los apartados de estado actual. Cuando se complete un pendiente, actualizar su casilla y su explicación además de añadir el hito.
