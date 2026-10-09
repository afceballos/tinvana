# Constructor modular Dropi + GHL

## Uso

En **Mis productos → Editar landing** abre el constructor. El panel **Secciones** permite agregar, arrastrar, subir/bajar con teclado, ocultar, duplicar y eliminar bloques. Las propiedades incluyen variantes, fondo, alineación, proporción de imagen y espaciado. **Restaurar sección** recupera sus valores iniciales previa confirmación.

**Producto, imágenes y página** concentra nombre comercial, precio, cantidad, SEO, URL, portada y galería con carga WebP. Los mensajes de envío, entrega y pago se activan individualmente y comienzan ocultos. Los bloques no traen testimonios, descuentos, condiciones comerciales ni especificaciones inventadas.

**Plantillas** ofrece Minimalista, Venta completa, Kits, Producto técnico y En blanco. Son estructuras editables. También se pueden guardar diez estructuras propias por usuario. Las referencias a archivos privados subidos y productos relacionados se eligen nuevamente al aplicar una plantilla a otro producto.

La vista previa usa el mismo renderizador que la página pública y cambia entre 1200, 768 y 375 px. Seleccionar una sección en el lienzo abre sus propiedades. El editor adapta sus tres áreas a pestañas en tablet y móvil. El formulario de la vista previa está desactivado.

**Guardar borrador** conserva la configuración sin afectar la versión publicada. **Publicar cambios** reemplaza explícitamente la versión en vivo. Cambiar la URL, el precio o actualizar el producto desde Dropi tampoco cambia la publicación antes de volver a publicar. Se señalan cambios pendientes y se protege el cierre/recarga y la salida mediante enlaces del editor.

Las secciones con listas admiten hasta 20 elementos; una landing admite 50 bloques y 30 imágenes de galería. Se pueden guardar listas incompletas como borrador. Publicar exige completar u ocultar las listas obligatorias, respuestas FAQ, comentarios de testimonios y valores técnicos.

## Arquitectura y archivos

- `backend/blocks.json`: registro compartido de los 18 tipos y sus variantes/campos.
- `src/types.ts`, `src/block-registry.ts`: esquema TypeScript, valores iniciales, clonación con UUID nuevos y plantillas.
- `src/Builder.tsx`, `src/builder.css`: editor, listas, drag & drop nativo y flechas accesibles, biblioteca, propiedades, guardado explícito y vista previa con debounce de 300 ms.
- `src/RichEditor.tsx`: edición enriquecida limitada, pegado como texto y enlaces HTTP/HTTPS. El servidor es la frontera de confianza.
- `backend/src/Blocks.php`: validación, compatibilidad con contenido antiguo y sanitización mediante DOM con una lista permitida de elementos/atributos. No acepta scripts, embeds ni estilos arbitrarios.
- `backend/src/LandingRenderer.php`, `backend/public/blocks.css`: renderizado SSR compartido de bloques, variantes, SEO, modal de solicitud y galería con zoom.
- `backend/src/Landing.php`, `Api.php`, `backend/public/index.php`: persistencia, publicación transaccional, rutas y permisos de medios según la versión publicada.
- `backend/src/Leads.php`: cantidad y total derivados del producto/precio publicado, con validación del servidor y la idempotencia existente.
- `src/landing-runtime.ts`, `vite.landing.config.ts`: bundle público independiente con GSAP, cantidades, galería, FAQ y envío del formulario. No carga React en la landing pública.

Cada bloque tiene `id`, `type`, `visible`, `variant`, `style` y `data`. El orden del array es el orden de lectura/publicación. Los estilos son enumeraciones cerradas. Una sección nueva se registra en el JSON, se implementa en el renderizador y se añade a los tipos/plantillas si corresponde.

La migración aditiva `005_landing_builder.sql` introduce `published_content`, `published_product_snapshot` y `published_slug`; copia la versión actual de las páginas publicadas. `content` y `product_snapshot` siguen siendo los borradores originales. El contenido antiguo se adapta a hero + características sin perder textos, imágenes, SEO ni las 30 características admitidas antes. No se elimina contenido original.

## Compra y GHL

Todos los CTA de compra abren un único `<dialog>` nativo con foco contenido, Escape, cierre accesible, restauración del foco y bloqueo de scroll. La cantidad se comparte entre CTA y actualiza resumen, total y campo oculto antes del envío. No existe un carrito ni un checkout paralelo.

Se mantiene el formulario propio y la cola de webhooks existentes, con CSRF, honeypot e idempotencia. Los valores enviados desde el navegador para precios/identificadores no se consideran confiables. El servidor obtiene los datos de la versión publicada. Se preservan las claves anteriores del payload y se añaden `quantity`, `unit_price`, `total`, `dropi_id` y `category`. Estas son claves del JSON de integración; no se inventaron identificadores de custom fields de GHL. Su mapeo pertenece al workflow real del negocio.

La confirmación informa solicitud guardada y estado real de entrega. Una consulta en cola no se presenta como un pedido pagado ni como entrega CRM confirmada. Se conservan reintentos del worker y trazabilidad existentes. Ningún test envía solicitudes a GHL ni genera pedidos reales.

## Diseño, skills y movimiento

Se conservan bosque `#193e35`, lima `#e7efc7`, superficies claras y la tipografía local. `frontend-design` se leyó de `C:/Users/andre/.agents/skills/frontend-design/SKILL.md`: composiciones editoriales, jerarquía de precio, fotografía protagonista, biblioteca visual y segunda revisión de capturas. Las skills locales `ui-ux-pro-max`, `gsap-core` y `gsap-react` se aplicaron a foco, controles táctiles, responsive, movimiento reducido y limpieza de animaciones. No se incorporaron librerías de componentes adicionales.

GSAP anima hero, aparición de beneficios/instrucciones con stagger, contenido FAQ, apertura/cierre del modal y confirmación. Las animaciones usan opacity/transform, `matchMedia` y cleanup; un IntersectionObserver activa las entradas al aparecer. CSS resuelve hover y estados sencillos. No se usa ScrollTrigger donde no aporta claridad. La vista previa desactiva las entradas para no interferir con selección y edición.

La referencia Puente360 se examinó como jerarquía de contenido: kit, razones, instrucciones, galería, ficha, precauciones, envío/pago, FAQ y cierre comercial. No se copiaron sus afirmaciones de envío, tiempos ni opiniones.

## Validación y despliegue

- 66 verificaciones PHP existentes; 96 del esquema, sanitización, variantes, compatibilidad y publicación.
- 83 verificaciones HTTP de sesiones, PostgreSQL, medios y webhook TLS local, incluyendo cantidad y total.
- 35 verificaciones HTTP del constructor: creación, recuperación, listas, aislamiento de borrador/publicación/URL/precio, permisos, contenido seguro, plantillas y total confiable.
- Playwright + Edge: biblioteca de 18 tipos, plantillas, listas 1–20, restaurar/ocultar/duplicar/eliminar, drag & drop real, guardar/reabrir, publicar, dispositivo de preview, modal/foco/Escape, FAQ y fallo/reintento real del formulario.
- Pruebas de carga PNG → WebP, promoción de portada, orden persistido y archivos inválidos. Revisión de catálogo/paneles y movimiento reducido. Capturas en `test-results/` para desktop, tablet y móvil.
- Consulta real de lectura a Dropi: categorías y páginas de 25, 30 y 50 productos, filtro y segunda página.

Antes de migrar se verificó una copia de las tres landings y ajustes de plantilla: `.tools/builder-backup-20261009-211916.json`, SHA-256 `c1ff019ff83c3139a6408eeda528aa224af60021f02f1e1494ec2cf76d168c65`. La copia privada no se versiona. Git conserva el punto anterior `afa505e`. Revertir código no exige borrar las columnas aditivas ni sobrescribir contenido nuevo; cualquier restauración de datos debe hacerse desde la copia y con revisión de los cambios posteriores.

Para desplegar: PHP necesita `ext-dom` además de las extensiones existentes, ejecutar migraciones y `npm run build`. Distribuir `backend/blocks.json`, los nuevos PHP/CSS, `backend/public/app` y `backend/public/landing-assets`. `console.php check` comprueba DOM. No cambia la configuración de Dropi ni el destino del webhook.

La entrega real a una cuenta GHL y sus custom fields depende del webhook/workflow del negocio y no se ejecutó en pruebas. Para próximas iteraciones: historial de versiones, deshacer/rehacer, autosave con control de concurrencia, más variantes específicas y auditoría Lighthouse bajo la infraestructura final. Las métricas Core Web Vitals no se certifican con capturas locales.
