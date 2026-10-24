# Constructor modular Dropi + GHL

## Datos de Dropi opcionales

La biblioteca incorpora **Datos de Dropi** como sección número 19, con variantes cuadrícula, lista y acordeón. Permite mostrar u ocultar individualmente ID, SKU, categorías, stock total, proveedor, estado explícito de verificación, tipo y bodegas con ciudad/unidades. Los valores proceden exclusivamente del snapshot del producto guardado en el servidor, nunca de texto comercial introducido en el bloque. La selección persiste por landing y respeta la separación entre borrador y versión publicada.

Los datos ausentes se omiten; stock cero sí se muestra. Un plan premium no implica proveedor verificado. En los productos actuales consultados, Dropi no entrega un estado de verificación explícito. Solo se admite un `verification_status` explícito o un booleano `verified` cuando el upstream los proporcione; no se deduce del plan, nombre ni actividad. Actualizar desde Dropi refresca el borrador; volver a publicar actualiza la información pública. No se promete stock en tiempo real en una versión publicada.

Pruebas adicionales: 18 verificaciones PHP del mapeo, exclusión de campos privados, datos reales, stock cero, estado ausente y HTML escapado; Playwright confirma los ocho controles, ocultar/guardar/reabrir/publicar y desktop/tablet/móvil. Archivos principales: `Product.php`, `Blocks.php`, `LandingRenderer.php`, registro JSON, tipos/constructor y CSS. No requiere migración adicional.

## Uso

En **Mis productos → Editar landing** abre el constructor. El panel **Secciones** permite agregar, arrastrar, subir/bajar con teclado, ocultar, duplicar y eliminar bloques. Las propiedades incluyen variantes, fondo, alineación, proporción de imagen y espaciado. **Restaurar sección** recupera sus valores iniciales previa confirmación.

**Producto, imágenes y página** concentra nombre comercial, precio, cantidad, SEO, URL, portada y galería con carga WebP. Los mensajes de envío, entrega y pago se activan individualmente y comienzan ocultos. Los bloques no traen testimonios, descuentos, condiciones comerciales ni especificaciones inventadas.

**Plantillas** ofrece Minimalista, Venta completa, Kits, Producto técnico y En blanco. Son estructuras editables. También se pueden guardar diez estructuras propias por usuario. Las referencias a archivos privados subidos y productos relacionados se eligen nuevamente al aplicar una plantilla a otro producto.

La vista previa usa el mismo renderizador que la página pública y cambia entre 1200, 768 y 375 px. Seleccionar una sección en el lienzo abre sus propiedades. El editor adapta sus tres áreas a pestañas en tablet y móvil. El formulario de la vista previa está desactivado.

**Guardar borrador** conserva la configuración sin afectar la versión publicada. **Publicar cambios** reemplaza explícitamente la versión en vivo. Cambiar la URL, el precio o actualizar el producto desde Dropi tampoco cambia la publicación antes de volver a publicar. Se señalan cambios pendientes y se protege el cierre/recarga y la salida mediante enlaces del editor.

Las secciones con listas admiten hasta 20 elementos; una landing admite 50 bloques y 30 imágenes de galería. Se pueden guardar listas incompletas como borrador. Publicar exige completar u ocultar las listas obligatorias, respuestas FAQ, comentarios de testimonios y valores técnicos.

## Arquitectura y archivos

- `backend/blocks.json`: registro compartido de los 19 tipos y sus variantes/campos.
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

- 66 verificaciones PHP existentes; 99 del esquema, sanitización, variantes, compatibilidad y publicación, más 18 del bloque de datos de Dropi.
- 83 verificaciones HTTP de sesiones, PostgreSQL, medios y webhook TLS local, incluyendo cantidad y total.
- 35 verificaciones HTTP del constructor: creación, recuperación, listas, aislamiento de borrador/publicación/URL/precio, permisos, contenido seguro, plantillas y total confiable.
- Playwright + Edge: biblioteca de 18 tipos, plantillas, listas 1–20, restaurar/ocultar/duplicar/eliminar, drag & drop real, guardar/reabrir, publicar, dispositivo de preview, modal/foco/Escape, FAQ y fallo/reintento real del formulario.
- Pruebas de carga PNG → WebP, promoción de portada, orden persistido y archivos inválidos. Revisión de catálogo/paneles y movimiento reducido. Capturas en `test-results/` para desktop, tablet y móvil.
- Consulta real de lectura a Dropi: categorías y páginas de 25, 30 y 50 productos, filtro y segunda página.

Antes de migrar se verificó una copia de las tres landings y ajustes de plantilla: `.tools/builder-backup-20261009-211916.json`, SHA-256 `c1ff019ff83c3139a6408eeda528aa224af60021f02f1e1494ec2cf76d168c65`. La copia privada no se versiona. Git conserva el punto anterior `afa505e`. Revertir código no exige borrar las columnas aditivas ni sobrescribir contenido nuevo; cualquier restauración de datos debe hacerse desde la copia y con revisión de los cambios posteriores.

Para desplegar: PHP necesita `ext-dom` además de las extensiones existentes, ejecutar migraciones y `npm run build`. Distribuir `backend/blocks.json`, los nuevos PHP/CSS, `backend/public/app` y `backend/public/landing-assets`. `console.php check` comprueba DOM. No cambia la configuración de Dropi ni el destino del webhook.

La entrega real a una cuenta GHL y sus custom fields depende del webhook/workflow del negocio y no se ejecutó en pruebas. Para próximas iteraciones: historial de versiones, deshacer/rehacer, autosave con control de concurrencia, más variantes específicas y auditoría Lighthouse bajo la infraestructura final. Las métricas Core Web Vitals no se certifican con capturas locales.

## Precio sugerido de Dropi (2026-10-23)

En **Producto y página**, debajo del precio público, se muestra el precio sugerido que trae el producto de Dropi (`suggestedPrice`, campo `suggested_price` del catálogo), con el botón **Usar precio sugerido**. El botón copia ese valor al precio público y pasa a «En uso». Solo aparece si el producto lo trae. Es opcional y no cambia nada hasta guardar el borrador.

## Envío calculado por Dropi (2026-10-23)

Opción por landing: **Producto y página → Calcular el envío con Dropi según la ciudad del comprador** (`commerce.dropiShipping`, desactivada por defecto).

- **Formulario:** al elegir la ciudad, el formulario llama a `POST /p/{slug}/shipping` (CSRF y 60 consultas por hora por IP) y muestra **Envío** y **Total**. Las cifras aparecen en el resumen y en una línea junto al botón **Enviar solicitud**. Si Dropi no cotiza, se muestra «Se confirma al procesar el pedido» y el total sin envío.
- **Servidor:** `DropiShipping` llama a `orders/cotizaEnvioTransportadoraV2` con `EnvioConCobro=true` (los pedidos se envían contra entrega), `ValorDeclarado` = precio público × cantidad, el origen (DANE de la ciudad de la bodega del producto) y el destino (DANE de 5 dígitos completado a 8). Elige la transportadora más barata sin error y redondea hacia arriba a $1.000. Las respuestas se guardan 6 horas en `storage/cache/shipping`. El token y la transportadora no llegan al navegador.
- **Al enviar:** el servidor vuelve a cotizar sin confiar en el navegador. La consulta guarda `shipping_price`, `shipping_carrier`, `grand_total` y `shipping_source=dropi`, que también viajan en el webhook. El pedido nace con el envío prellenado; la cotización y la aceptación siguen siendo manuales.
- **Pruebas:** `php backend/tests/dropi-shipping.php` (9 comprobaciones) y `node tests/dropi-shipping.mjs` (20, con un Dropi simulado en 8444). Requiere el servidor de pruebas con `DROPI_QUOTE_URL=https://127.0.0.1:8444/integrations/orders/cotizaEnvioTransportadoraV2` y `HTTP_CA_BUNDLE`; esa variable solo se acepta fuera de producción y en `127.0.0.1`.

## Descubrimiento del cotizador

El contrato se confirmó con el comando de solo lectura `dropi:shipping-probe`, ejecutado por el usuario en producción el 2026-10-23.



Comando de descubrimiento, de solo lectura: `php bin/console.php dropi:shipping-probe [email] [dane_destino] [full]`. Con `full` hace solo la cotización contra entrega y lista las transportadoras en el orden que devuelve Dropi, con `distributionCompany` y los campos superiores. Sirve para buscar la preferencia de transportadora de la cuenta (por ejemplo, TCC para Antioquia). Usa la primera integración (la del email si se indica) y el último producto seleccionado. Imprime la estructura de la bodega y la ciudad de origen, y llama solo a `orders/cotizaEnvioTransportadoraV2` (con cuerpo vacío y con un cuerpo de ejemplo) y a `trajectory/bycity`. Muestra el estado HTTP, las claves y el mensaje de Dropi, con el token redactado. No usa `orders/myorders` ni crea nada. En GoDaddy se ejecuta una vez por cron con `-d register_argc_argv=1`.

**Resultado de la primera ejecución en producción (2026-10-23, reportado por el usuario):** `orders/cotizaEnvioTransportadoraV2` existe y acepta el cuerpo `{EnvioConCobro, ValorDeclarado, ciudad_remitente:{cod_dane}, ciudad_destino:{cod_dane}}`. Responde con `objects`, una entrada por transportadora (VELOCES, ENVIA, INTERRAPIDISIMO…). La ciudad de origen sale de la bodega del producto (`warehouse.city.cod_dane`, por ejemplo Cali `76001000`). El destino `11001` falló: Dropi usa el DANE de 8 dígitos (`11001000`). `trajectory/bycity` respondió vacío. El comando ahora completa los códigos de 5 dígitos con `000`, prueba contra entrega y pago anticipado y resume cada transportadora en una línea, para ver los campos del precio.

## Rediseño de las landings (2026-10-24)

Se usaron las skills `ui-ux-pro-max` (patrón de conversión con el llamado a la acción repetido, contraste, movimiento ligero y fijos sin solaparse) y `frontend-design`.

**Estilos** (`visual.theme`, elegibles en la plantilla y en cada landing):
- **Comercio moderno** (`modern`, por defecto): el producto sobre un «escenario» con halo del color de marca, precio grande y botón ancho.
- **Cálido** (`warm`): papel crema, titulares editoriales y tarjetas con la esquina doblada.
- **Audaz** (`bold`): presentación a todo color, bordes de 2 px y sombras sólidas; el botón se hunde al pulsarlo.

**Tipografía** (`visual.font`): Rubik, Montserrat, Fraunces o Space Grotesk. Son variables, solo latín, de 22 a 38 KB, y se alojan en `backend/public/landing-fonts/` (OFL). Solo se precarga la fuente elegida. Con Fraunces, el texto corrido usa la fuente del sistema.

**Color:**
- El servidor calcula el color del texto sobre el botón (`--on-primary`): blanco si alcanza 4,5:1 y, si no, casi negro.
- También detecta si el fondo es oscuro (`data-paper`), para invertir el texto y las tarjetas.
- Las paletas que eran solo el valor por defecto antiguo (`#193e35`/`#fafbf7` y `#06444a`/`#f4faf7`) se tratan como «sin color» y toman el nuevo valor por defecto, `#ff6a00`/`#fff8f1`.

**Llamado a la acción:**
- En la caja de compra, el precio va grande y el ahorro («Ahorras N%») se muestra solo con un precio anterior real y mayor.
- La cantidad va en una píldora y el botón tiene un destello cada pocos segundos.
- Los mensajes de envío y pago van como chips.
- La barra fija de compra (opción existente «Barra fija en móvil») aparece al pasar la presentación del producto.

**Botones flotantes:**
- **WhatsApp:** botón abajo a la derecha cuando hay número, con un pulso breve.
- **Compartir** (`visual.share`: nativo del celular, WhatsApp, Facebook y copiar enlace, todos opcionales): un `<details>` encima del de WhatsApp, que funciona sin JavaScript. En el celular, si la opción nativa está activa, abre directamente el menú del teléfono. Copiar el enlace confirma con «Enlace copiado».
- **Con la barra fija:** cuando aparece, los flotantes suben para no quedar encima.

**Cuadrículas sin huecos:** en las cuadrículas de tres columnas, una tarjeta sobrante ocupa toda la fila y dos sobrantes se la reparten (lo mismo en dos columnas en tablet). Aplica a ventajas, contenido, envíos, galería, productos relacionados y lista de productos.

**Movimiento:**
- Una entrada orquestada en la presentación.
- Aparición de secciones y elementos al hacer scroll (desplazamiento de 12–16 px, escalonado).
- Destello del botón y pulso de WhatsApp.
- Todo es CSS más un IntersectionObserver. El contenido es visible sin JavaScript (las animaciones solo se activan cuando el script marca `motion-ready`).
- Con `prefers-reduced-motion` no hay movimiento.

**Rendimiento:**
- `landing-runtime.js` bajó de 160 KB a 91 KB (29 KB comprimido). GSAP se reemplazó por CSS y la Web Animations API, también en la confirmación con el pájaro.
- Las landings ya no cargan `landing.css` ni `brand/brand.css`.
- Los recursos llevan `?v=` con la fecha de modificación, para que un despliegue no quede oculto tras la caché.

**Otros cambios:**
- El pie de página dice «Página creada con Tinvana».
- El logo por defecto del encabezado es el de Tinvana, sin parches en el navegador.
- Los testimonios muestran estrellas.
- El formulario de compra toma los colores de la landing.

**Archivos:** `backend/public/blocks.css` (reescrito), `LandingRenderer.php`, `Landing.php` (`THEMES`, `FONTS`, `SHARE`), `LandingHeader.php`, `src/landing-runtime.ts`, `src/lead-success.ts`, `src/TemplateStudio.tsx` (`DesignChoices`, compartido con el editor) y `src/Builder.tsx`.

**Pruebas:**
- `tests/landing-design.mjs` (33): estilos, contraste, cuadrícula, flotantes, compartir, ahorro, barra fija, scroll, sin JavaScript, movimiento reducido y peso del script.
- `tests/template-design.mjs` (6): plantilla y editor.
- Regresión aislada prueba por prueba, idéntica a la línea base previa al cambio: `builder-http`, `gallery`, `header`, `visual`, `geography` y `brand` ya fallaban antes en este entorno.

**Landings creadas con IA (2026-10-24):**
- **Configuración visual:** la IA solo escribe el contenido y elige tipos y variantes existentes. La landing conserva su estilo, tipografía, colores, WhatsApp y opciones de compartir, así que se ve con el diseño nuevo.
- **Ritmo de fondos:** al aplicar una landing completa generada, `AiLanding::rhythm` asigna el ritmo visual:
  - la presentación con el fondo de la página;
  - las secciones siguientes alternando blanco y el tono suave de marca;
  - el llamado a la acción final como banda del color de marca, centrada.
- **Una sola sección:** al regenerar una sección se conserva su estilo, como antes.
- **Pruebas:** `backend/tests/ai.php` (38) y `landing-design.mjs` (34, con captura del ritmo).

**Ajustes tras la revisión del usuario (2026-10-24):**
- **Imagen fija junto a textos largos** (desde 761 px):
  - aplica a la presentación del producto, imagen + texto, «Qué incluye» con imagen, galería con texto y el llamado a la acción con imagen;
  - la imagen queda fija bajo el encabezado mientras el texto avanza;
  - con texto corto, el texto se centra junto a la imagen.
- **Llamado a la acción:**
  - muestra título, texto y después el precio (con el ahorro real) y el botón que abre el formulario, sin la caja de compra ni la cantidad, que siguen en la presentación;
  - la banda siempre va centrada; tarjeta, mínimo e imagen siguen la alineación elegida en «Estilo y espaciado»;
  - los bloques nuevos de este tipo empiezan centrados.
- **Pasos de «Cómo se usa»:** en las variantes de pasos y cuadrícula, número centrado sobre el texto y línea punteada entre pasos. Las variantes verticales siguen siendo «numerada» y «línea de tiempo».
- **Barra fija de compra:** se calcula al hacer scroll y aparece siempre que la caja de compra de la presentación no está a la vista: ya pasada o todavía abajo por una descripción larga. Se oculta en el primer tramo de la página. Antes, con un desplazamiento rápido podía no aparecer.
- **Pruebas:** `landing-design.mjs` 39.
- **Corrección (reportada por el usuario):** en el editor, elegir una tipografía desplazaba la página hasta una zona vacía. Las tarjetas de opción no contenían su radio oculto, así que el navegador saltaba hasta él al enfocarlo. Ahora cada radio queda sobre su tarjeta. `template-design.mjs` (10) comprueba que elegir estilo, tipografía o compartir no desplaza la página ni el panel; sin la corrección, la prueba reproduce el salto.
