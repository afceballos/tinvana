# Notificaciones flotantes

El panel usa un proveedor compartido para avisos de operaciones: login, catálogo, selección de productos, integraciones, webhook, plantilla, constructor, preview, imágenes y consultas. Los mensajes originales del backend se mantienen, presentados en tarjetas flotantes arriba a la derecha en escritorio y adaptadas al ancho disponible en móvil. No desplazan el formulario.

Cada tarjeta incluye icono, título, mensaje con interlineado y botón de cierre de 44 px. Éxitos se cierran a los 6,5 segundos; mensajes informativos a los 9 segundos. Errores y advertencias quedan hasta cerrar. La lectura pausa los temporizadores al pasar el ratón, enfocar con el teclado o cambiar de pestaña. Escape cierra una notificación enfocada. Mensajes idénticos activos se deduplican; se muestran hasta cuatro tarjetas simultáneas.

Los errores usan `role=alert`; otros mensajes usan `role=status`. No se mueve el foco al mostrar una tarjeta. El movimiento reducido desactiva entradas y salidas animadas. Un popover manual permite presentar las tarjetas en la capa superior del navegador; cuando hay un diálogo modal, el portal se aloja dentro de ese diálogo para mantener los botones accesibles. Al cerrar el diálogo regresa al documento.

La información permanente de contexto y el historial de entregas siguen en su sección: no se disparan notificaciones por leer registros históricos. Las validaciones nativas de campos requeridos no se sustituyen. Este cambio afecta al panel React; el formulario de las landings públicas conserva su estado de envío junto al formulario.

## Verificación

Build TypeScript/Vite completado. `tests/notifications.mjs` comprobó en Edge: posición flotante sin desplazar contenido, deduplicación, pausa al pasar el ratón, cierre automático de éxitos, errores persistentes, cierre con Escape, botones accesibles sobre diálogo nativo sin robar foco, pila con espaciado en móvil de 375 px y movimiento reducido. No hubo errores JavaScript. Se utilizó sesión temporal autorizada y respuestas de guardado controladas exclusivamente por la prueba; no se cambiaron datos en Supabase.

Capturas locales: `test-results/notification-error-desktop.png` y `test-results/notifications-mobile.png`. Actualización disponible en el build que sirve el túnel temporal.
