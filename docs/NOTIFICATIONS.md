# Notificaciones flotantes

El panel usa un proveedor compartido para avisos de operaciones: login, catálogo, selección de productos, integraciones, webhook, plantilla, constructor, preview, imágenes y consultas. Los mensajes originales del backend se mantienen, presentados en tarjetas flotantes arriba a la derecha en escritorio y adaptadas al ancho disponible en móvil. No desplazan el formulario.

Cada tarjeta incluye icono, título, mensaje con interlineado y botón de cierre de 44 px. Éxitos se cierran a los 6,5 segundos; mensajes informativos a los 9 segundos. Errores y advertencias quedan hasta cerrar. La lectura pausa los temporizadores al pasar el ratón, enfocar con el teclado o cambiar de pestaña. Escape cierra una notificación enfocada. Mensajes idénticos activos se deduplican; se muestran hasta cuatro tarjetas simultáneas.

Los errores usan `role=alert`; otros mensajes usan `role=status`. No se mueve el foco al mostrar una tarjeta. El movimiento reducido desactiva entradas y salidas animadas. Un popover manual permite presentar las tarjetas en la capa superior del navegador; cuando hay un diálogo modal, el portal se aloja dentro de ese diálogo para mantener los botones accesibles. Al cerrar el diálogo regresa al documento.

La información permanente de contexto y el historial de entregas siguen en su sección: no se disparan notificaciones por leer registros históricos. Las validaciones nativas de campos requeridos no se sustituyen. Este cambio afecta al panel React; el formulario de las landings públicas conserva su estado de envío junto al formulario.

## Verificación

Build TypeScript/Vite completado. `tests/notifications.mjs` comprobó en Edge: posición flotante sin desplazar contenido, deduplicación, pausa al pasar el ratón, cierre automático de éxitos, errores persistentes, cierre con Escape, botones accesibles sobre diálogo nativo sin robar foco, pila con espaciado en móvil de 375 px y movimiento reducido. No hubo errores JavaScript. Se utilizó sesión temporal autorizada y respuestas de guardado controladas exclusivamente por la prueba; no se cambiaron datos en Supabase.

Capturas locales: `test-results/notification-error-desktop.png` y `test-results/notifications-mobile.png`. Actualización disponible en el build que sirve el túnel temporal.

## Colores por tipo y estilo moderno (sin borde lateral)

Las notificaciones flotantes y los mensajes en línea comparten una paleta definida en `modern.css` (variables `--ok-*`, `--info-*`, `--warn-*` y `--bad-*`, con versión para el tema oscuro). Cada tipo fija su tono con `--t-fg`, `--t-bg`, `--t-bd`, `--t-ic` y `--t-icon`:

| Tipo | Color | Dónde |
|---|---|---|
| Éxito | verde | `toast-success` |
| Error | rojo | `toast-error`, `.error`, `.lead-last-error`, aviso `p[role=alert]` de pedidos |
| Advertencia | ámbar | `toast-warning`, `.store-warning` |
| Información | azul | `toast-info`, `.notice`, `.builder-live-notice` |

Las notificaciones flotantes son tarjetas redondeadas con degradado tenue del tono, borde del mismo color, brillo suave y un chip de icono sólido; el título toma el color del tipo. Los mensajes en línea llevan un icono (máscara SVG) a la izquierda del texto y el mismo fondo y borde tonales. **Se eliminó el borde/barra lateral de color** (`.toast::before`, `border-left` de `.notice`, `.error`, `.builder-live-notice` y `.lead-last-error`) y las variables antiguas `--toast-accent/--toast-soft`. Un tipo nuevo solo necesita fijar las cinco variables `--t-*`. Los roles ARIA no cambian (`alert` para errores, `status` para el resto).

No se tocaron los estados de las páginas públicas (por ejemplo el estado del formulario de consultas), que siguen la identidad de cada landing. Prueba: `node tests/alerts.mjs` (18 comprobaciones, API simulada). `tests/notifications.mjs` apunta a una dirección de túnel externa que ya no existe y no se pudo ejecutar.
