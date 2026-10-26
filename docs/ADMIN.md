# Superusuario, planes y permisos

Módulo de administración de cuentas. Migración PostgreSQL `019_accounts_plans.sql`; en MySQL/MariaDB, de la `020` a la `025`, con una sentencia por archivo.

## Roles

| Rol | Cómo se obtiene | Qué puede hacer |
|---|---|---|
| `user` | Registro público | Usa lo que permitan su plan y sus excepciones. |
| `admin` | `admin:create` (cuenta inicial) | Igual que `user`. Es un nombre histórico y no da permisos extra. |
| `superadmin` | **Solo por consola**: `php bin/console.php superadmin:grant correo@dominio` | Acceso total y la sección **Administración** del panel. |

- **Retirar el rol:** `superadmin:revoke correo@dominio` devuelve la cuenta a `admin`.
- **Efectos de los dos comandos:** cierran las sesiones abiertas de la cuenta y quedan en la auditoría con la fuente «consola».
- **Desde la web no se puede asignar ni retirar el rol, ni suspender a un superusuario.**
- **cPanel:** el cron de una sola vez es `/usr/bin/php -q -d register_argc_argv=1 /home/<usuario>/tinvana/bin/console.php superadmin:grant correo@dominio`.

## Funciones y límites

**Funciones** (claves que reconoce `Entitlements::FEATURES`):

| Clave | Función |
|---|---|
| `catalog` | Explorar y seleccionar productos |
| `landings` | Crear y editar landings |
| `publish` | Publicar landings |
| `ai` | Generar con IA |
| `orders` | Pedidos |
| `dropi_orders` | Envío y seguimiento en Dropi |
| `dropi_shipping` | Flete de Dropi en landings |
| `ghl` | Webhooks |
| `mail` | Correos de pedidos |
| `store` | Subdominio propio |
| `whatsapp` | Ventas por WhatsApp con IA (módulo en construcción por etapas; ver [WHATSAPP.md](WHATSAPP.md)) |
| `whatsapp_ai` | Agente de IA en WhatsApp. Límite asociado: `whatsapp_ai_conversations` (conversaciones atendidas por IA al mes, ilimitado por defecto). Los ajustes predeterminados del agente se editan en Valores globales. |

**Límites** (`Entitlements::LIMITS`; `null` significa ilimitado):

| Clave | Qué cuenta |
|---|---|
| `landings` | Landings creadas |
| `published_landings` | Publicadas a la vez |
| `products` | Productos seleccionados |
| `integrations` | Integraciones Dropi |

**Resolución:** cada capa reemplaza a la anterior solo en las claves que define; si no define una clave, hereda.
1. **Valores globales:** `app_settings.entitlements`. Sin fila, todo está activado y sin límites, que es el comportamiento anterior.
2. **Plan de la cuenta:** el asignado mientras no venza. Al vencer, o si no tiene, se usa el **plan predeterminado**; si no hay ninguno, solo los valores globales.
3. **Excepciones de la cuenta:** `users.entitlement_overrides`.

## Dónde se aplica

Todo se valida en el servidor; el panel solo oculta lo que el servidor rechazaría.

- **Rutas de la API:** `Api::handle` rechaza con 403 y un mensaje que nombra la función.
  - Funciones bloqueadas por completo: pedidos, envío a Dropi, generación con IA, catálogo de Dropi y subdominio.
  - Bloqueadas solo al escribir: landings, plantillas, webhooks y correos.
  - Publicar exige `publish`.
- **Límites:** se comprueban al crear una landing, al publicar una que no lo estaba, al seleccionar un producto nuevo y al añadir una integración.
- **Fuera de la API:**
  - **GHL:** si `ghl` está desactivado, `Leads::work` deja las entregas esperando una hora sin gastar intentos.
  - **Correos:** si `mail` está desactivado, `OrderMail::queue` no encola.
  - **Flete:** si `dropi_shipping` está desactivado, `DropiShipping::forLanding` no cotiza.
- **Panel:**
  - el menú oculta los módulos desactivados;
  - un enlace directo a un módulo desactivado muestra un aviso con el plan actual;
  - la sesión incluye `user.access` (plan, funciones, límites y uso) y se refresca como máximo una vez por minuto al navegar (`GET /api/access`).

## Suspensión

`users.status='suspended'`:
- **Sesiones:** se cierran en el acto (`session_version+1`).
- **Inicio de sesión:** responde 403 «Tu cuenta está suspendida», solo después de validar la contraseña.
- **Landings públicas:** la página, el formulario y el flete responden 404, y la landing sale del sitemap.
- **Datos:** no se borra nada. Al reactivar, todo vuelve.

## API de administración

`/api/admin/*` responde 404 a quien no sea superusuario. Las escrituras exigen CSRF y tienen un límite de 120 cada 10 minutos.

| Ruta | Uso |
|---|---|
| `GET /api/admin/summary` | Totales: cuentas, nuevas, suspendidas, sin verificar, landings y pedidos |
| `GET /api/admin/users?q=&status=&plan=&page=` | Cuentas con plan, estado, uso y último acceso |
| `GET/PUT /api/admin/users/{id}` | Detalle. `PUT` admite `status`, `plan_id`, `plan_expires_at` (`AAAA-MM-DD`, vence al final del día en Colombia), `overrides` y `note` |
| `GET/PUT /api/admin/entitlements` | Valores globales |
| `GET/POST /api/admin/plans`, `PUT/DELETE /api/admin/plans/{id}` | Planes. Solo puede haber un plan predeterminado. No se elimina un plan con cuentas asignadas ni el predeterminado. |
| `GET /api/admin/audit?page=` | Registro de cambios |

**Planes:** cada uno tiene nombre, descripción, precio entero, moneda, cobro (gratis, mensual, anual o pago único), beneficios a mostrar, orden, estado activo y sus reglas.

**Privacidad:** el panel no lee ni devuelve contraseñas, tokens, claves de IA ni URLs de webhook. `admin_audit` guarda quién cambió qué, sobre qué cuenta y el antes y después de los campos de administración.

## Pendiente para el cobro

- **Pasarela de pago:** conectar Wompi, Mercado Pago o Stripe para que el pago asigne `plan_id` y `plan_expires_at`.
- **Página pública de planes:** los datos de `highlights`, `price` y `period` ya existen para construirla.
- **Límites por uso mensual** (por ejemplo, generaciones con IA): requieren registrar el consumo; no están implementados.
