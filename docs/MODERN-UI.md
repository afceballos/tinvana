# Capa visual moderna: movimiento, modo oscuro y plantilla de marca

Referencia de inspiración: la demo pública Kofra (`demo.codeandchill.store/kofra`), de la que se tomaron ideas de interacción, no su código ni su marca: barra lateral flotante con píldora activa deslizante, encabezado de vidrio, cambio de tema con revelado circular (View Transitions), sombras en capas, resplandor ambiental y curvas de movimiento con rebote suave. Los colores, tipografías y logos siguen siendo los de Tinvana.

Alcance: solo frontend del panel. No cambia API, autenticación, base de datos, rutas ni los textos de las landings publicadas.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `src/modern.css` | Tokens de movimiento, tema oscuro manual, resplandor ambiental, barra lateral flotante y píldora, encabezado de vidrio, tarjetas, botones, campos, diálogos, avisos y revelado por scroll. Se carga al final. |
| `src/dark.css` | **Generado** por `node scripts/generate-dark.mjs`: reglas oscuras para los colores claros fijos del resto de hojas. No editar a mano; volver a generarlo si cambian los CSS del panel. |
| `src/theme.tsx` | `initTheme`, `useTheme`, `ThemeToggle` e `initPointerGlow`. |
| `src/TemplateStudio.tsx`, `src/template-studio.css` | Nueva pantalla «Plantilla de marca». |
| `tests/modern.mjs` | Prueba con API simulada (sin base de datos). |

## Modo oscuro

- El tema se guarda en `localStorage` (`tinvana-theme`); sin preferencia se sigue el sistema (`prefers-color-scheme`) y se actualiza si el sistema cambia. Si el almacenamiento no está disponible, funciona sin recordar.
- Se aplica `data-theme` en `<html>` antes de renderizar React. La pantalla de carga HTML inicial usa la preferencia del sistema; quien eligió el tema manualmente en contra de su sistema puede ver un destello breve.
- El interruptor está en el encabezado y en el login. Usa `role="switch"` y `aria-checked`. Con `prefers-reduced-motion` el cambio es inmediato, sin revelado circular.
- Las landings públicas, su vista previa en el constructor y la maqueta de la plantilla de marca **no** cambian con el tema: representan la página publicada.

## Movimiento

Tarjetas con elevación y zoom suave de imagen, brillo que sigue al puntero (solo punteros finos), botones con brillo y pulsación elástica, campos con halo de enfoque, diálogos y avisos con entrada elástica, barra lateral con píldora activa que se desliza (`useEffect` en `Shell` mide el enlace activo y mueve `--pill-y/--pill-h`), resplandor ambiental lento y revelado de paneles al hacer scroll con `animation-timeline: view()` (mejora progresiva). Todo usa `transform` y `opacity`. `prefers-reduced-motion` desactiva el resplandor, los desplazamientos y las animaciones nuevas. Las entradas GSAP existentes (`MotionView`, catálogo, login) se conservan.

## Barra lateral y scrolls

La barra lateral no hace scroll: logo y «Mi espacio» arriba y «Contraer menú» abajo quedan fijos, y solo la lista de opciones (`nav`) se desplaza, con la barra oculta (`scrollbar-width:none`). Aparece un desvanecido arriba y/o abajo cuando hay más opciones en esa dirección (`data-fade-top/bottom` calculado en `Shell`, animado con `@property --ft/--fb`), y la opción activa se mantiene visible al cambiar de ruta. En alturas menores de 800 px se oculta el mensaje «Dale vuelo…» para dar espacio al menú. El resto de áreas con scroll (constructor, listas, diálogos, tablas) usan una barra fina y translúcida que se acentúa al pasar el cursor, con variante para modo oscuro (`--sb-thumb`, `--sb-thumb-hover`; solo propiedades estándar `scrollbar-width`/`scrollbar-color`).

## Listas compactas: productos, consultas y pedidos

Inspiradas en la demo Kofra (tarjetas de resumen, chips con contadores, filas densas con avatar y estado, panel lateral de detalle y tarjeta tipo factura). Solo presentación: las llamadas a la API, los textos accesibles y las clases usadas por las pruebas existentes (`.selected-row`, `.order-total`, etc.) se conservan. Piezas compartidas en `src/compact.tsx` y `src/compact.css`.

- **Mis productos** (`src/MyProducts.tsx`): cuadrícula de tarjetas con imagen 4:3, estado superpuesto (Publicada, Borrador, Seleccionado), nombre en dos líneas, ID y precio Dropi, botón principal «Crear/Editar landing» y acciones de icono («Precios por cantidad», «Actualizar datos Dropi», «Quitar selección») con nombre accesible. Chips por estado con contadores y búsqueda por nombre o ID, ambos en el cliente sobre la selección ya cargada.
- **Consultas** (`src/Leads.tsx`): tarjetas de resumen y chips por estado de envío, calculados **solo sobre la página cargada** (la API pagina de 1 en 1 sin filtros por estado), filas con avatar de iniciales y detalle como panel lateral derecho.
- **Pedidos** (`src/Orders.tsx`): tarjetas de resumen de la página, chips de estado que usan el mismo filtro de servidor que antes (`status`), y filas compactas. La ficha del pedido añade un resumen tipo factura con comprador, dirección, fechas, partida (cantidad, precio, importe), envío y total, más la historia como línea de tiempo. La cotización, la aceptación, la corrección, la cancelación y la preparación para Dropi no cambiaron.
- **Fila clicable:** en Consultas y Pedidos toda la fila abre el detalle. El botón es solo una flecha con nombre accesible («Abrir pedido», «Ver detalle de …») que extiende su zona de clic con `::after`; por eso en `.cx-open` se anulan `transform` y `filter`, que encogerían esa zona al pasar o pulsar.
- **No incluido por no existir datos en el sistema:** instrucciones de pago, enlaces de cobro, recordatorios o acciones tipo «marcar pagado» de la referencia. Un pedido sigue sin enviarse a Dropi.

## Plantilla de marca

Sigue editando los mismos cuatro valores (`primaryColor`, `backgroundColor`, `buttonText`, `whatsapp`) con el mismo `GET/PUT /api/template-settings`; no hay campos nuevos en servidor. Añade paletas listas, selector de color con entrada hexadecimal, aviso de contraste del texto blanco del botón (las landings usan texto blanco sobre el color principal; el aviso es orientativo y no bloquea guardar), vista previa en vivo escritorio/móvil con botón de WhatsApp cuando el número es válido, y barra inferior con estado «Todo guardado»/«Cambios sin guardar» y «Descartar». Guardar sin cambios sigue permitido. La vista previa es aproximada: no ejecuta el renderizador PHP.

## Verificación

- `npm run build` aprobado.
- `node tests/modern.mjs`: 17 comprobaciones (tema y plantilla de marca) con API simulada.
- `node tests/compact.mjs`: 27 comprobaciones con API simulada: tarjetas, filtros y búsqueda de productos, creación de landing, contadores y filtro de consultas, panel lateral, filas y chips de pedidos con filtro de servidor, resumen tipo factura, paneles de cotización y preparación conservados, línea de tiempo, clic en cualquier parte de la fila, sin desbordamiento a 1440 y 390 px y sin errores de JavaScript.
- Capturas locales con datos simulados en claro y oscuro (`test-results/`).
- **Sin verificar:** datos reales de producción en estas pantallas; las pruebas existentes con base local (`tests/orders.mjs`, `order-editing.mjs`, `tinvana-ui.mjs`, `motion.mjs`, `brand.mjs`) no se ejecutaron en esta etapa aunque se conservaron sus selectores; despliegue en GoDaddy.

## Tarjeta «Webhook actual»

Sustituye la tarjeta plana con borde izquierdo de color por una tarjeta redondeada con brillo suave de marca: icono de envío, nombre del proveedor, chip de estado (*Activo* con punto pulsante, o *Pausado*) y la URL en un recuadro propio. Estilos en `modern.css` (sección «Webhook actual»), con variables de tema, por lo que el tema oscuro se adapta solo; el punto pulsante se detiene con `prefers-reduced-motion`. Se retiraron las reglas antiguas `.webhook-current` y `.webhook-address` de `style.css`, `premium.css` y `tinvana.css`, y se regeneró `dark.css`. Prueba: `node tests/webhook-card.mjs` (13 comprobaciones, API simulada).

## Integraciones Dropi con el estilo de Conexión GHL (2026-10-23)

`src/DropiIntegrations.tsx` (reexportado desde `pages.tsx`) reutiliza la estructura de `WebhookSettings`:

- **Encabezado:** eyebrow y título, con una píldora que cuenta las integraciones configuradas.
- **Tarjeta por integración:** `webhook-current`, con logo, chip «Configurada» y el token representado en el recuadro punteado (nunca se muestra).
- **Acciones:** **Probar conexión** y **Reemplazar token**; el formulario de reemplazo se abre dentro de la tarjeta.
- **Alta de integraciones:** **Añadir otra integración** despliega el formulario `editor-form`. Si no hay ninguna, se muestra directamente «Conectar Dropi».
- **Tabla final:** explica qué hace el servidor con el token. A diferencia de la de GHL, no tiene ancho mínimo (`.dropi-uses`) y se ajusta al móvil.

No cambia la API ni el comportamiento. Prueba: `node tests/dropi-integrations-ui.mjs` (10 comprobaciones, API simulada); también pasan `webhook-card.mjs` 13 y `modern.mjs` 17.

## Estilo de tarjetas unificado en IA, perfil y contraseña (2026-10-23)

Integraciones de IA, Editar perfil y Cambiar contraseña usan las mismas piezas que Conexión GHL e Integraciones Dropi:

- **`webhook-current`:** degradado y brillo de fondo.
- **`webhook-head`:** icono naranja en degradado, eyebrow y título.
- **`webhook-state`:** chip con punto de estado.
- **`webhook-url`:** recuadro punteado para el dato clave.

En cada pantalla:

- **IA:** cada proveedor muestra «En uso / Configurada / Sin conectar» y la clave cifrada con su fecha de comprobación. El aviso de usar clave de API toma el tono informativo azul.
- **Tu tienda:** chip «Activa / Sin subdominio» y el subdominio guardado en el recuadro.
- **Foto de perfil y Datos de la cuenta:** cabeceras con icono.
- **Contraseña:** icono de candado (nuevo `lock` en `ui.tsx`) y chip «Sesión protegida».

Se conservan títulos, textos y lógica. Pasan `store-address.mjs` 20, `alerts.mjs` 18, `modern.mjs` 17, `compact.mjs` 27, `webhook-card.mjs` 13, `dropi-integrations-ui.mjs` 10 y `profile.mjs`. Revisadas además Plantilla, Consultas, Pedidos, Mis productos y Mis archivos, que ya tenían el estilo moderno.
