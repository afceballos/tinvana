# Rediseño Zenzales

## Auditoría y dirección

React 19 + TypeScript + Vite 6 + Tailwind 4; API, sesiones, SEO y landings públicas en PHP; PostgreSQL. Se conservan las rutas y el flujo selección → borrador → edición → publicación → consulta → entrega GHL. El modal del panel selecciona productos; el formulario de contacto vive en la landing pública. No se mezclan esas responsabilidades.

Identidad conservada: bosque `#193e35`, lima `#e7efc7`. Superficies `#f5f7f4` y blanco, texto secundario `#596b63`, borde `#dce4df`. Tipografía local Segoe UI Variable/Segoe UI, sin solicitudes de fuentes externas. Jerarquía de radios 8/16/24 px y ritmo 4/8/12/16/24/32 px. La composición distintiva es el espacio de selección verde bosque con portada lima; el contenido de producto permanece sobrio para comparar datos.

`src/premium.css` define tokens y presentación; `src/ui.tsx` centraliza iconos SVG, transiciones de ruta y entrada del catálogo. Se reutilizan los formularios, paneles, estados, API y tipos originales. El CSS base conserva los estilos estructurales y premium aplica el sistema actual.

## Skills aplicadas

- **frontend-design**: dirección revisada antes de construir, paleta de marca, composición propia, fotografía protagonista y segunda revisión de capturas.
- **ui-ux-pro-max**: leídos SKILL, quick-reference y pro-rules; búsquedas de sistema marketplace, foco de modal y ciclo de vida React. Los resultados automáticos de paleta morada/índigo no correspondían a la marca y se descartaron; se aplicaron las recomendaciones pertinentes de contraste, teclado, tamaño táctil, responsive y cleanup.
- **gsap-core / gsap-react**: `useGSAP` con scope, `matchMedia`, cleanup, animación solo de transform/opacity y salida del modal con `contextSafe`.
- Se inspeccionaron las skills del proyecto: gsap-core, gsap-react, gsap-utils y ui-ux-pro-max. gsap-utils no se requiere en esta implementación. frontend-design se leyó de la instalación global. La skill computer-use se consultó; su runtime nativo no está habilitado y no había navegador CUA disponible. La validación solicitada se ejecutó con Playwright y Edge local.

## Comportamiento

- Sidebar contraíble en escritorio y drawer móvil con Escape, foco contenido y fondo bloqueado. Sidebar cerrado `inert`, enlace para saltar al contenido y foco visible.
- Catálogo responsive, galería proporcionada, precios reales, categorías reales, selección y confirmación, skeletons y chips removibles. Búsqueda original con debounce de 350 ms.
- Modal nativo con nombre accesible, galería, selección, apertura/cierre GSAP, Escape, restauración del foco y bloqueo de scroll.
- Todos los formularios y pantallas comparten superficies, botones y estados. Landing pública con galería seleccionada, contacto destacado y estados de envío; conserva CSRF, idempotencia y payload.
- GSAP: transición de vista de 320 ms, entrada de tarjetas de 350 ms con stagger total de 220 ms, modal 300/160 ms. Movimiento reducido desactiva la animación. CSS resuelve hover y feedback simples. No se añadió ScrollTrigger sin una necesidad de navegación o lectura.

## Cambio acotado de catálogo

El panel anterior mostraba 32 productos y consultaba 50 a Dropi. Ahora el query opcional `pageSize` admite 25/30/50 y comienza en 25; el offset es `(page-1)*pageSize`. La comprobación real encontró que Dropi devuelve 40 al pedir 50: `Dropi::catalog` obtiene dos ventanas de 25 para completar 50 y evitar saltos de productos. `category` se valida y se mapea a `category_id`, ya admitido por el transporte Dropi. Los cuatro órdenes anteriores se conservan. Sin total fiable, `hasNext` significa página completa y puede conducir a una página vacía al final exacto. No se inventa un contador global.

No había filtros de rango de precio en la interfaz original. No se inventaron parámetros de precio no verificados ni un filtro local que aparentara filtrar todo el catálogo. Este punto puede ampliarse cuando se confirme el contrato upstream.

## Validación y límites

- Build TypeScript/Vite y 66 pruebas PHP aprobados.
- 82 comprobaciones HTTP con sesiones PHP, PostgreSQL local y receptor TLS local aprobadas. No se enviaron consultas a GHL real.
- `tests/visual.mjs` usa login real del fixture local y respuestas de catálogo simuladas solo en el navegador; nunca se añaden datos de ejemplo a la aplicación. Revisa 1440/768/375 px y landscape, pantallas secundarias, filtros, modal y movimiento reducido. Capturas en `test-results/`.
- Dropi real comprobado desde PHP usando la integración cifrada del administrador: 30 categorías, páginas de 25/30/50 (50 tras corregir el límite upstream), segunda página de 25 y consulta de una categoría aceptada (0 resultados para esa categoría). No se cambiaron registros ni se imprimieron credenciales. Repetir desde la red del hosting.
- No se afirma una entrega a GHL externo ni mediciones de Core Web Vitals de producción. El formulario público visual usa un envío interceptado y la suite HTTP verifica el payload contra un receptor TLS local.

## Próximos pasos recomendados

### Editor visual de imágenes

La carga de imágenes se rediseñó en `src/ImageUpload.tsx` y `src/media.css`: recuadros punteados con botón +, selección múltiple y arrastrar/soltar, portada independiente, miniaturas de galería, promoción a principal, orden anterior/siguiente y eliminación. La estructura persistida sigue siendo `content.images`; el primer elemento es la portada. Al cambiar la portada se conserva la anterior como imagen adicional. Los enlaces externos continúan disponibles en un desplegable avanzado.

Se conservan las validaciones PHP, la conversión WebP y el límite de 30 imágenes. Se muestran progreso por archivos completados, errores y confirmaciones. Guardar/previsualizar/publicar se bloquean mientras se cargan imágenes para evitar guardar una galería incompleta. `tests/gallery.mjs` verifica cargas PNG reales a WebP, orden, portada, eliminación, persistencia tras guardar/recargar y responsive a 1440/768/375 px. Capturas `test-results/gallery-*.png`.

Verificar el catálogo y categorías con Dropi real, confirmar mapping/deduplicación en GHL, medir LCP/CLS/INP con imágenes reales en hosting y considerar separar las rutas del panel en chunks si el crecimiento lo requiere.
