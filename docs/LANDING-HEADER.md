# Encabezado y menú de las landings

En el constructor, abre **Producto y página → Encabezado, logo y menú**. El fondo es oscuro (verde petróleo Zenzales por defecto), el logo es el original blanco y el encabezado permanece fijo al desplazarse. Puedes desactivar sticky o elegir otro fondo oscuro. PHP exige contraste suficiente con el menú blanco y valida los colores hexadecimales.

El modo automático genera enlaces de las secciones visibles en su orden, con Inicio para la presentación y título/nombre de cada sección para las demás. No incluye divisores. El modo personalizado permite elegir secciones, editar etiquetas y mover enlaces arriba/abajo. Los destinos usan UUID de bloques: editar títulos no cambia las anclas. Las secciones ocultas o eliminadas no generan enlaces públicos.

En escritorio hay enlaces directos; si hay más de seis se usa un desplegable para evitar saturar el encabezado. En tablet/móvil se usa Menú. Funciona sin JavaScript mediante detalles/anclas nativas. Con JavaScript, cierra el desplegable al seleccionar o pulsar Escape, marca la sección actual, mueve el foco al destino y ajusta el desplazamiento a la altura del encabezado. Respeta movimiento reducido y funciona en la preview del constructor sin intentar modificar el historial de su iframe aislado.

Puedes subir un logo PNG, JPEG o WebP de hasta 8 MB; el pipeline existente lo convierte a WebP con transparencia y máximo 400 KB. El logo no se mezcla con la galería del producto. También puedes usar una URL externa o restaurar el logo original. La imagen propia se autoriza por usuario/landing y participa en la validación de publicación; un logo solo usado en el header sigue siendo privado en borrador y público al publicar. La preview firmada incluye autorización temporal del logo.

El encabezado se guarda en `content.header`, dentro del JSONB existente; no hace falta una migración nueva. Las versiones publicadas guardan su copia independiente. Guarda borrador y pulsa Publicar cambios para aplicar tus ajustes a la página pública.

Las plantillas guardadas incluyen el fondo, sticky y enlaces; al aplicarlas se remapean IDs de enlaces a los bloques clonados. Los logos/imágenes propios subidos no se reutilizan automáticamente entre landings: selecciónalos o súbelos para cada una, como el resto de imágenes de las plantillas. Logos externos y configuración sí se conservan.

## Verificación

Build TypeScript/Vite completado, 69 pruebas PHP existentes y 15 nuevas validaciones del encabezado aprobadas. La suite aislada pasó 92 comprobaciones HTTP: guardado de menú, URL/color rechazados, logo transparente convertido, referencia desconocida rechazada, logo privado/preview/publicación/despublicación y plantilla con logo propio limpiado. No hizo solicitudes a Dropi/GHL externos ni insertó fixtures en Supabase.

`tests/header.mjs` revisa el HTTPS real con Edge: logo/fondo, sticky, anclas existentes, desplegable móvil, Escape, desplazamiento sin ocultar el destino, movimiento reducido, funcionamiento sin JavaScript y configuración del editor sin publicar cambios. Capturas en `test-results/header-desktop.png`, `header-menu-mobile.png` y `header-editor.png`.

Despliegue: incluye `backend/public/landing-header.css` y el runtime público recompilado. Vite utiliza proxy PHP para ese CSS en desarrollo.
