# Prompt: página de inicio (home) de Tinbana

> Copiar desde «Rol» hasta el final y dárselo al agente que construya el home. Escrito el 2026-11-03.

---

## Rol

Eres diseñador y desarrollador frontend sénior de Tinbana. Construyes la página de inicio pública: dinámica, moderna e interactiva, fiel a la marca y rápida en celular. Antes de empezar lee `AGENTS.md` y `docs/CONTEXTO-PROYECTO.md`, y respeta todas sus reglas.

## Objetivo

Una página en `/` (dominio principal, `APP_URL`) que explique qué es Tinbana y sus beneficios, y que lleve a **Crear cuenta** (`/registro`) y **Entrar** (`/login`).

**Público:** dropshippers de contraentrega en Colombia y LATAM, que llegan sobre todo desde el celular y desde anuncios.

**Mensaje central:** hoy usan entre 6 y 10 herramientas sueltas (proveedor, formulario, WhatsApp, Excel…). Tinbana lo junta en un solo panel.

## Skills obligatorias (`.agents/skills`)

Carga cada una antes de la parte que le corresponde y sigue sus reglas:

| Skill | Para qué en este home |
|---|---|
| `ui-ux-pro-max` | Sistema de diseño de la página, jerarquía, accesibilidad (contraste AA, foco visible, tamaños táctiles), patrones de landing SaaS, diseño primero para celular y revisión UX final. |
| `gsap-core` | Entradas, timelines, easing y `gsap.matchMedia()` para separar escritorio, celular y `prefers-reduced-motion`. Registrar ScrollTrigger (incluido en el paquete `gsap`) para las animaciones con scroll. |
| `gsap-utils` | `mapRange`, `clamp`, `interpolate`, `toArray`, `wrap` y `snap` para el paralaje con el puntero, las capas de triángulos y los contadores. |
| `gsap-react` | `useGSAP` con `scope` y limpieza automática en cada isla React. Nada de animaciones que queden vivas al desmontar. |
| `threejs-animation` | El pájaro de origami en 3D de la portada: aleteo procedural, deriva suave y respuesta al puntero. Ampliar `src/OrigamiScene.tsx`, no duplicarlo. |
| `vercel-react-best-practices` | Dividir el código: Three.js y ScrollTrigger se cargan de forma diferida. Sin cascadas de peticiones, sin re-renderizados innecesarios y con un bundle inicial mínimo. |
| `vercel-react-view-transitions` | Transición suave del home a `/registro` y `/login`, y cambio entre pestañas o funciones en la sección de beneficios. |

## Stack y restricciones técnicas (no negociables)

- **Stack:** React 19, TypeScript, Vite 6, Tailwind 4, GSAP 3.15 con `@gsap/react` y Three 0.186. Ya están instalados.
- **No agregar Framer Motion ni otras librerías de animación.** Los componentes de 21st que usan Framer Motion se reescriben con GSAP. Toda dependencia nueva debe justificarse por escrito.
- **SEO obligatorio:** todo el contenido debe estar en el HTML servido, no generado solo por React.
  - Opción recomendada: una entrada de Vite aparte (`home.html`) con el contenido completo en HTML.
  - React monta solo islas interactivas: el pájaro 3D, la demo de chat, la calculadora y el acordeón.
  - PHP sirve ese HTML en `/` del dominio principal.
  - Revisar `backend/public/index.php`: los dominios propios de las tiendas deben seguir sin home (hoy responden 404 en `/`).
  - El panel (`/panel`) y las landings (`/p/...`) no cambian.
- **CSP actual:** `script-src 'self'`, sin scripts en línea, sin CDN y sin fuentes externas. Todo se sirve desde el propio sitio. Montserrat ya está local en `backend/public/brand/fonts/`.
- Sin datos inventados, sin secretos y sin llamadas a servicios externos desde la página.

## Identidad de marca

- **Colores:**
  - Naranja `#FF6A00` (principal).
  - Ámbar `#FFBA3D` (secundario).
  - Carbón `#1E1E1E`.
  - Crema `#FFF8F1`.
  - Borde `#FFE0CD`.
  - Reutilizar los tokens de `src/tinvana.css` y `backend/public/brand/brand.css`, incluido el modo oscuro.
- **Tipografía:** Montserrat, pesos 400 a 800. Títulos en 800 con interletrado ajustado.
- **Logo e ícono:**
  - `backend/public/brand/tinvana-origami.svg` es el pájaro de origami (paloma).
  - `tinvana-dark.svg` y `tinvana-light.svg` son el logo para fondo claro y fondo oscuro.
  - El pájaro es el protagonista visual.
- **Motivo visual: facetas triangulares de papel plegado.**
  - Triángulos en capas a distintas profundidades, con paralaje.
  - Caras con luz y sombra en tonos de naranja y ámbar, como papel doblado.
  - Pliegues que se abren al entrar una sección.
  - Líneas de doblez finas como separadores.
  - Debe sentirse cálido, artesanal y premium, nunca genérico.
- **Evitar el aspecto «hecho por IA»:**
  - Degradados morados o azules genéricos.
  - Emojis como íconos.
  - Tarjetas idénticas en grilla sin jerarquía.
  - Brillos neón.
  - Fotos de stock.

## Modo claro y modo oscuro (los dos, completos)

El home se diseña y se prueba **en los dos modos desde el inicio**. El oscuro no es una inversión automática del claro: cada modo tiene su propia luz, sombra y profundidad.

- **Modo inicial:**
  - En la primera visita, seguir la preferencia del sistema (`prefers-color-scheme`).
  - Si la persona ya eligió un modo, usar ese.
  - La elección se guarda con la misma clave del panel (`tinvana-theme`, en `src/theme.tsx`), así el modo elegido en el home se mantiene al entrar al panel.
  - No cambiar el comportamiento actual del panel: sigue en claro mientras la persona no elija otro modo.
- **Sin parpadeo:**
  - El modo se aplica antes del primer pintado, con un script pequeño **externo** en el `<head>` (por ejemplo `/brand/theme-init.js`). La CSP no permite scripts en línea.
  - También actualizar `color-scheme` y `<meta name="theme-color">` (`#fff8f1` en claro, `#14120f` en oscuro).
- **Interruptor:**
  - En el encabezado y en el menú del celular, con ícono de sol y luna y un `aria-label` claro.
  - El cambio de modo se anima con el revelado circular que ya usa el panel, o con View Transitions. Con movimiento reducido, el cambio es instantáneo.
- **Tokens:**
  - Partir de los del panel (`src/modern.css`, `src/tinvana.css`).
  - Claro: fondo crema `#FFF8F1`, superficies `#FFFFFF`, texto carbón `#1E1E1E`, bordes `#FFE0CD`.
  - Oscuro: fondo `#14110E`, superficies `#1D1915` y `#272019`, texto `#F6EEE7`, texto suave `#B9A797`, líneas `#3A2E25` y enlaces `#FF9A57`.
  - El naranja `#FF6A00` es el mismo en los dos modos.
  - Todo color de la página sale de variables CSS que cambian con `:root[data-theme=dark]`. No se escriben colores fijos en los componentes.
- **Cómo se ve cada elemento:**

| Elemento | Claro («papel cálido») | Oscuro («noche de origami») |
|---|---|---|
| Facetas triangulares | Caras crema, durazno y ámbar, con sombras suaves y tibias | Caras carbón y café con bordes naranja encendidos, como papel iluminado por detrás |
| Pájaro 3D | Luz de día lateral y sombra suave | Luz cálida desde abajo, brillo naranja en los pliegues y más contraste |
| Fondo de triángulos (shader) | Paleta crema, durazno y naranja | Paleta carbón, café y naranja con puntos ámbar |
| Pájaros pequeños de fondo | Siluetas naranja translúcidas | Siluetas con brillo ámbar suave |
| Capturas del panel | Captura en modo claro | Captura en modo oscuro: tomar las dos |
| Sombras | Sombras tibias, nunca grises | Resplandor naranja tenue en lugar de sombra negra |

- **Three.js:** al cambiar de modo, actualizar las luces, los materiales y el color de fondo de la escena sin recrearla, con una transición corta en GSAP.
- **Contraste:** AA en los dos modos, revisado con `ui-ux-pro-max`. Revisar en especial el naranja sobre crema (para texto pequeño, usar un naranja más oscuro) y el texto suave sobre carbón.
- **Imagen para compartir (Open Graph):** una sola versión, la del modo claro.

## Precarga (preload) de marca

Reutiliza la precarga del panel, documentada en `docs/MODERN-UI.md` («Pantalla de precarga»):
- El marcado está en `index.html` y en `src/Loading.tsx`.
- La hoja de estilos es `backend/public/brand/preload.css`.
- El despegue de salida es `PreloadExit`.

Ya funciona en modo claro, en modo oscuro y con movimiento reducido. No crear otra precarga distinta.

**En el home se adapta para no frenar la venta:**
- **Corta y sin espera mínima.**
  - El panel espera al menos 1,8 s (`PRELOAD_MIN_MS`). El home no: se muestra lo que tarde en estar lista la portada, con un tope de 1,2 s.
  - Si la página carga en menos de unos 300 ms, no se muestra.
- **Una vez por sesión.** Se guarda en `sessionStorage`. Al volver al home desde otra página no se repite.
- **El despegue conecta con la portada.** El pájaro de la precarga vuela hasta la posición del pájaro de la portada, que lo reemplaza sin salto: el 3D en escritorio, el SVG en celular. La precarga y la portada se sienten como una sola animación.
- **No tapa el contenido para Google.** Todo el HTML del home está debajo desde el primer momento. La precarga es una capa encima, solo con CSS, que se retira con JavaScript.
  - Si JavaScript falla, la capa se oculta sola por CSS después de 1,5 s.
  - Debe tener `aria-hidden` y no recibir foco.
- **Que no castigue el LCP.** Medir con y sin precarga. Si el LCP en celular supera 2,5 s por su culpa, se acorta o se retira.
- **Con movimiento reducido** no hay precarga. Se muestra la portada estática.

## Referencias de 21st.dev (inspiración, adaptar a la marca)

El CLI `21st` ya está conectado (plan gratuito).

- **Búsquedas:** sin límite.
- **`21st get <id>`:** solo **2 por día**. Úsalo como máximo en los dos marcados con ★. De los demás, basta ver la vista previa en su enlace.
- **Adaptar todo:** reescribir con GSAP, aplicar los colores de la marca y cambiar las formas por triángulos y origami.

| Sección | Componente | Idea a tomar |
|---|---|---|
| Fondo de la portada ★ | [LivingOrigami bg](https://21st.dev/@dhileepkumargm/components/living-origami-bg) (id 8011) | Bandada de pájaros de origami con CSS 3D y clip-path. Base para pájaros pequeños de fondo alrededor del pájaro principal. |
| Portada | [Shape Landing Hero](https://21st.dev/@kokonutd/components/shape-landing-hero) (id 524) | Formas flotantes en capas. Cambiarlas por facetas triangulares naranja y ámbar. |
| Portada | [Layer Parallax Hero](https://21st.dev/@erikvalencia1/components/layer-parallax-hero) (id 8477) | Capas con paralaje por profundidad, siguiendo el scroll y el puntero. |
| Título | [Origami Fold Text](https://21st.dev/@shadcnspace/components/animated-text-12) (id 29810) | Letras que se despliegan como un pliegue 3D. Solo en la entrada del título, sin bucle infinito. |
| Textos | [Text Reveal](https://21st.dev/@ddoemonn/components/text-reveal) (id 23571) | Aparición por palabras al entrar en pantalla. |
| Fondo de sección | [Dot Grid · Triangles](https://21st.dev/@paper-design/components/dot-grid-triangles) (id 21834) | Shader de triángulos. Cambiar la paleta a la de la marca y usarlo solo en una sección. |
| Fondo alternativo | [Geometric](https://21st.dev/@bundui/components/geometric) (id 2314) | Fondo geométrico animado y ligero. Es la alternativa si no hay WebGL. |
| Beneficios ★ | [Features With Panel](https://21st.dev/@scrollxui/components/features-with-panel) (id 29767) | Lista de funciones con un panel fijo que cambia al hacer scroll. El panel muestra la pantalla real de Tinbana de cada función. |
| Beneficios | [Bento Grid](https://21st.dev/@designali-in/components/bento-grid) (id 4517) | Grilla de beneficios con tamaños distintos para dar jerarquía. |
| Tarjetas | [Spotlight Card](https://21st.dev/@preetsuthar17/components/spotlight-card) (id 2220) | Luz que sigue al puntero en tono ámbar. Solo en escritorio. |
| Demo de WhatsApp | [Chat Messages](https://21st.dev/@nexus-ui/components/chat-messages) (id 20129) | Burbujas que aparecen en secuencia, con «escribiendo…». |
| Cómo funciona | [Scroll animated timeline](https://21st.dev/@ibrandify/components/scroll-timeline) (id 35029) | Línea de progreso que se dibuja con el scroll; puede ser un pliegue que se despliega. |
| Panel en la portada | [Hero with Dashboard Mockup](https://21st.dev/@felipemenezes098/components/hero-02) (id 19068) | Captura del panel flotando con profundidad. |
| Calculadora | [Animated Counter](https://21st.dev/@preetsuthar17/components/animated-counter) (id 1844) | Números que cuentan hasta su valor en la calculadora de utilidad. |
| Botones | [Magnetic Button](https://21st.dev/@bundui/components/magnetic-button) (id 1507) | El botón principal se acerca suavemente al puntero. Solo en escritorio. |
| Precios | [pricing section](https://21st.dev/@mokshithgujjeti/components/pricing-section) (id 18754) | Estructura de planes. |
| Preguntas | [Accordion](https://21st.dev/@ddoemonn/components/accordion) (id 23530) | Acordeón accesible con teclado y altura medida automáticamente. |

## Secciones y contenido

Promete **solo lo que ya funciona**. Si hay duda sobre algo, confírmalo en `docs/CONTEXTO-PROYECTO.md` y en `docs/PLAN-DESARROLLO.md`.

1. **Encabezado fijo con vidrio.**
   - Logo, y enlaces a Funciones, Cómo funciona, Precios y Preguntas.
   - Botones «Entrar» y «Empezar gratis».
   - Interruptor de modo oscuro.
   - En celular, un menú que se despliega como un pliegue.
2. **Portada.**
   - El pájaro de origami en 3D aletea despacio, sigue el puntero y, al hacer scroll, «vuela» hacia la siguiente sección.
   - Alrededor, pájaros pequeños y facetas triangulares en 3 capas de profundidad.
   - Título con el efecto de pliegue.
   - Frase sugerida, pendiente de confirmar: «Vende contraentrega sin saltar entre 8 herramientas».
   - Subtítulo: «Catálogo Dropi, landings, confirmación por WhatsApp con IA y seguimiento de pedidos, en un solo panel».
   - Botón principal magnético y una captura del panel flotando.
3. **El problema.**
   - Las herramientas sueltas (proveedor, formulario, chat, hoja de cálculo) aparecen dispersas.
   - Al hacer scroll se pliegan y se unen en un solo triángulo: Tinbana.
   - Usar categorías genéricas, sin logos de marcas de terceros.
4. **Beneficios (panel fijo con scroll).** Estas son las funciones reales:
   - Catálogo Dropi y envío del pedido a Dropi.
   - Landings con editor y textos generados con IA.
   - Formulario contraentrega con ofertas por cantidad.
   - Confirmación por WhatsApp con IA (API oficial de Meta), con paso a un asesor.
   - Avisos del estado del pedido y seguimiento.
   - Bandeja de chats y notificaciones.
5. **Demo de WhatsApp en vivo.**
   - Se reproduce al entrar en pantalla: llega un pedido, la IA confirma los datos, el cliente corrige la dirección y el pedido queda confirmado.
   - El guion lo define la marca. Todo el texto es de ejemplo y se marca como tal.
6. **Cómo funciona, en 3 pasos.** Conecta Dropi → crea tu landing → la IA confirma por WhatsApp. La línea de progreso se dibuja como un pliegue.
7. **Calculadora interactiva de utilidad.**
   - El visitante escribe precio de venta, costo, flete y gasto en anuncios, y ve la utilidad por pedido con los números animados.
   - Es un cálculo en el navegador, sin guardar nada.
   - Llevar el rótulo «Ejemplo». No debe presentarse como una función del panel, porque el módulo de finanzas todavía no existe.
8. **Próximamente** (solo si la marca lo aprueba). Utilidad real, logística y anuncios, según `docs/PLAN-DESARROLLO.md`, con la etiqueta «En camino».
9. **Precios** (solo si la marca lo aprueba).
   - Mostrar los planes activos desde la base, mediante un endpoint público de solo lectura.
   - Ese endpoint devuelve solo nombre, precio, periodo y lo que incluye. Sin datos internos y con caché.
   - Si no se aprueba, poner «Hablemos» con un enlace a WhatsApp de ventas.
10. **Preguntas frecuentes** (acordeón). Por ejemplo:
    - ¿Necesito Shopify? No.
    - ¿Usa la API oficial de WhatsApp? Sí.
    - ¿Mis datos están seguros?
    - ¿En qué países funciona?
11. **Cierre.** Un pájaro grande y el botón final. Pie de página con privacidad y términos (las páginas que ya existen), contacto y redes.

**Prohibido:**
- Testimonios.
- Logos de clientes.
- Cifras como «+500 tiendas» o «−40 % devoluciones».
- Calificaciones con estrellas.
- Cualquier dato no verificado.

## SEO configurable desde el superadmin

El superadmin administra el sitio público. El SEO y los datos principales del home se editan desde el panel, sin tocar código.

### Dónde

- Pestaña nueva **«Sitio público»** en `/panel/admin/sitio`, junto a Cuentas, Planes, Valores globales, IA de WhatsApp y Auditoría (`src/Admin.tsx`).
- La ruta de la API va en `backend/src/Admin.php`: `GET` y `PUT /api/admin/site`.
  - Solo puede usarla el rol `superadmin`. Cualquier otro rol recibe 404, igual que el resto del admin.
  - Las escrituras llevan CSRF y límite de peticiones.
  - Cada cambio queda en `admin_audit` con el antes y el después.

### Campos

| Grupo | Campo | Regla |
|---|---|---|
| Buscadores | Título (`<title>`) | Obligatorio, hasta 60 caracteres, con contador |
| | Meta descripción | Obligatoria, entre 70 y 160 caracteres, con contador |
| | Palabras clave | Lista de hasta 15 etiquetas. Se publican en `<meta name="keywords">`. Aclarar en la ayuda que Google no las usa para posicionar; sirven de guía para los textos. |
| | URL canónica | Por defecto `APP_URL` + `/`. Solo `https` del dominio principal |
| | Indexar en buscadores | Interruptor `index,follow` / `noindex,nofollow`. Por defecto activado. Avisar en rojo cuando esté apagado |
| | Verificación de Google Search Console y Bing | Solo el código del `content`, validado como texto alfanumérico |
| Al compartir | Título y descripción para redes | Opcionales. Si están vacíos, se usan los de buscadores |
| | Imagen para compartir | 1200×630, JPG, PNG o WebP, hasta 2 MB. Se sube desde el panel con las mismas validaciones de `Media` y se guarda en una ruta pública propia del sitio, no en la biblioteca de una tienda. |
| Marca | Nombre del sitio, logo para buscadores | Por defecto «Tinbana» y `tinvana-origami.svg` |
| | Redes sociales | URL de Instagram, Facebook, TikTok, YouTube y LinkedIn. Solo `https`. Se usan en `sameAs` y en el pie de página |
| | WhatsApp de ventas | Número en formato internacional, validado con el selector de teléfono que ya usa el proyecto. Es el botón flotante del home |
| Portada | Frase principal y subtítulo | Hasta 70 y 160 caracteres. Así la marca puede cambiarlos sin código |

### Vistas previas en la misma pantalla

- **Google:** título azul, URL y descripción, con aviso si se cortan.
- **WhatsApp, Facebook y LinkedIn:** tarjeta con la imagen, el título y la descripción.
- En modo claro y oscuro del panel, con el estilo actual de las tarjetas del admin.

### Datos y servidor

- **Una tabla de una sola fila,** `site_settings`, con una migración para cada motor:
  - `backend/migrations/` (PostgreSQL) y `backend/mysql/migrations/` (MySQL, una sentencia por archivo).
  - Usar el siguiente número libre de cada carpeta. Hoy van en el 037 y el 058.
- **PHP escribe las etiquetas en el HTML del home al servirlo,** no React, para que Google y WhatsApp las lean sin JavaScript:
  - `<title>`, `description`, `keywords`, `robots`, `canonical`.
  - Open Graph (`og:title`, `og:description`, `og:image` con ancho y alto, `og:url`, `og:type=website`, `og:locale=es_CO`, `og:site_name`).
  - Twitter (`summary_large_image`) y las verificaciones.
  - Todo escapado con `htmlspecialchars`.
- **JSON-LD generado desde los mismos datos:** `Organization` (nombre, logo, `sameAs`, contacto) y `SoftwareApplication` (`applicationCategory: BusinessApplication`). Va en un `<script type="application/ld+json">`, permitido por la CSP porque no es ejecutable.
- **Sitemap y robots:**
  - `sitemap.xml` incluye `/` y las páginas legales.
  - `robots.txt` apunta al sitemap y bloquea `/panel` y `/api`.
  - Con «Indexar» apagado, `robots.txt` no bloquea todo el sitio: solo se agrega `noindex` al home.
- **Caché:** los ajustes se leen una vez por petición o con una caché corta. Al guardar, se ve el cambio de inmediato.
- **Valores por defecto:** si la fila no existe, se usan los valores iniciales de abajo, que son la redacción propia de la marca. Nunca datos ficticios.

### Valores iniciales propuestos (la marca los ajusta)

- **Título:** `Tinbana | Dropshipping contraentrega en un solo panel`
- **Meta descripción:** `Catálogo Dropi, landings, confirmación de pedidos por WhatsApp con IA y seguimiento de envíos en un solo panel. Vende contraentrega sin saltar entre herramientas.`
- **Palabras clave:**
  - dropshipping Colombia, dropshipping contraentrega, Dropi, plataforma de dropshipping;
  - landing para dropshipping, formulario contraentrega;
  - confirmación de pedidos por WhatsApp, IA para WhatsApp, chatbot para ventas;
  - pago contraentrega Colombia, tienda online contraentrega.
- **Imagen para compartir:** el pájaro de origami en modo claro con la frase principal y el logo, diseñada en 1200×630 dentro de este trabajo.

### Pruebas

- Que solo el superadmin vea y guarde la pestaña. Otro rol recibe 404, sin sesión 401, y sin CSRF 419.
- Validaciones de cada campo: largos, URL solo `https`, formato de imagen y tamaño.
- Escape de HTML: un título con `<script>` sale como texto.
- Que el HTML de `/`, sin JavaScript, traiga las etiquetas guardadas, y que el registro de auditoría guarde el cambio.
- En la base de pruebas local (`zenzales_test`) y nunca contra producción.

## Puntero animado e interactivo

Un puntero propio, **minimalista**, que acompaña la marca e interactúa con el sitio sin estorbar. La regla principal: hacer clic debe ser **igual o más preciso** que con el puntero normal.

### Diseño

- **Dos piezas:**
  - **Punto:** 6 px, naranja `#FF6A00`. Sigue al mouse **sin retraso**, porque marca el lugar exacto del clic.
  - **Faceta:** un triángulo de papel de unos 22 px, con borde fino de 1,5 px. Sigue al punto con un retraso suave (`gsap.quickTo`, 0,35 a 0,5 s) y rota un poco hacia la dirección del movimiento, como un papel que vuela.
- **Por modo:**
  - **Claro:** el punto es naranja y el borde de la faceta, carbón al 70 %.
  - **Oscuro:** el punto es naranja y la faceta, crema con un brillo ámbar tenue.
  - Los colores salen de las variables CSS del tema.
- **Nada de estelas largas, brillos fuertes ni efectos que tapen el contenido.**

### Estados (por atributos `data-cursor`, sin JavaScript por elemento)

| Dónde | Qué hace el puntero |
|---|---|
| Fondo vacío | Punto y faceta en reposo; la faceta «respira» despacio |
| Enlaces y botones | La faceta se convierte en un anillo que **se ajusta al botón**. El botón principal tiene efecto magnético: se acerca unos pocos px |
| Botón principal («Empezar gratis») | El anillo se llena de naranja y aparece una flecha pequeña → |
| Tarjetas de beneficios | La faceta crece y se vuelve una luz suave que sigue al puntero dentro de la tarjeta (spotlight). Etiqueta «Ver» |
| Demo de WhatsApp | Etiqueta «▶ Ver demo». Al hacer clic, la demo vuelve a empezar |
| Capturas del panel | Etiqueta «Ampliar» si se abren en grande |
| Campos de la calculadora y textos seleccionables | Vuelve el **puntero normal del sistema** (cursor de texto) y se ocultan el punto y la faceta |
| Interruptor claro/oscuro | El punto cambia a sol o luna durante el hover |
| Al hacer clic | 3 triangulitos de papel salen del punto y se desvanecen en unos 0,4 s. Un solo efecto corto, sin confeti |
| Mouse fuera de la ventana | El punto y la faceta se ocultan con un fundido |

### Interacción con el sitio

- **Pájaro 3D de la portada:** gira la cabeza y el cuerpo hacia el puntero, con un ángulo máximo pequeño.
- **Facetas del fondo:** los triángulos cercanos al puntero se levantan y se inclinan un poco, como papel que se mueve con el aire. El radio es de unos 160 px.
- **Fondo de triángulos (shader):** recibe la posición del puntero y aclara los triángulos cercanos.
- **Pájaros pequeños de fondo:** se apartan suavemente al pasar cerca.
- **Títulos grandes:** un leve paralaje de 2 a 4 px según la posición del puntero. Nada que dificulte leer.

### Reglas de UX y accesibilidad

- **Solo en escritorio con mouse:** `(hover: hover) and (pointer: fine)`. En celular y tablet táctil no se activa nada de esto.
- **Con `prefers-reduced-motion`:** puntero normal del sistema, sin efectos de puntero en el fondo y sin magnetismo.
- **El puntero normal del sistema** solo se oculta (`cursor:none`) cuando el puntero propio está activo y en elementos que no son de texto. En campos, textos seleccionables y `contenteditable`, vuelve siempre el del sistema.
- **No toca la navegación con teclado:** el foco visible de los botones se mantiene igual. Durante la navegación con Tab, el puntero propio se oculta.
- **No bloquea los clics:** el puntero propio tiene `pointer-events:none`, va en una sola capa con `aria-hidden="true"` y queda por encima de todo menos de los diálogos.
- **No reduce el contraste:** el anillo nunca tapa el texto del botón. Si hace falta, se usa el borde, no un relleno, sobre los textos.

### Rendimiento

- **Un solo `pointermove` pasivo** en `document`, con delegación por `data-cursor`. Una sola actualización por cuadro (`requestAnimationFrame`) y `gsap.quickTo` para el punto y la faceta.
- **Animar solo `transform` y `opacity`.** Sin `getBoundingClientRect` en cada movimiento: las posiciones de los botones se miden al entrar en ellos y al cambiar el tamaño de la ventana.
- **Facetas del fondo:** solo se calculan las que están en pantalla, y se pausan fuera de vista o con la pestaña oculta.
- Va en una isla React (`useGSAP` con limpieza) que se carga después de la portada. El costo máximo es de unos 6 KB gzip.

### Referencias de 21st (adaptar a GSAP y a la marca)

| Componente | Idea a tomar |
|---|---|
| [Fluid Magnetic Cursor](https://21st.dev/@jahed/components/magnetic-cursor) (id 9314) | Ya usa GSAP: física de resorte, ajuste al botón y soporte táctil y de movimiento reducido. Reimplementar sin su dependencia `Vecteur`. Si vale la pena, usar aquí una descarga de código de otro día. |
| [Custom Cursor](https://21st.dev/@designali-in/components/custom-cursor) (id 5688) | La variante «ring-dot»: punto con anillo, base del diseño |
| [Magnetic](https://21st.dev/@ibelick/components/magnetic) (id 648) | Efecto magnético para el botón principal |
| [Cursor](https://21st.dev/@preetsuthar17/components/cursor) (id 1896) | Seguimiento suave y cambios de tamaño en hover |
| [Ripple Buttons](https://21st.dev/@ai2/components/buttons-ripple) (id 26809) | Onda desde el punto del clic, con movimiento reducido. Inspiración para los triangulitos al hacer clic |

### Pruebas

Con Playwright en 1280 px, simulando movimiento del mouse:
- Que el anillo se ajuste a los botones y vuelva el cursor de texto en los campos.
- Que no se pierdan clics en botones pequeños.
- Que el puntero propio no exista en un dispositivo táctil emulado ni con movimiento reducido.
- Que se mantenga en 60 fps y no se generen tareas largas al mover el mouse.

## Movimiento: reglas

- **Una idea por sección.** No animar todo a la vez. Las entradas duran entre 0,4 y 0,9 s, con `power3.out` o `expo.out`.
- **Scroll:** usar ScrollTrigger con `scrub` solo donde se cuenta una historia (el problema, los pasos y el vuelo del pájaro). Lo demás se anima una sola vez al entrar en pantalla.
- **Con `prefers-reduced-motion`:** todo aparece sin desplazamiento, el pájaro queda como SVG estático y no hay paralaje.
- **En celular:**
  - Sin Three.js: el pájaro va en SVG con una animación CSS o GSAP ligera.
  - Sin efectos de puntero.
  - Menos capas de triángulos.
- **Three.js:**
  - Se carga de forma diferida, solo en escritorio con WebGL.
  - DPR máximo de 1.5.
  - Se pausa cuando está fuera de pantalla o la pestaña está oculta.
  - Libera geometrías y materiales al salir, como ya hace `OrigamiScene`.
- **Rendimiento:** 60 fps. Animar solo `transform` y `opacity`, nunca propiedades que fuercen a recalcular el diseño de la página.

## Calidad y rendimiento (criterios medibles)

- **Lighthouse en celular:** Performance ≥ 90, Accesibilidad ≥ 95, SEO = 100 y Buenas prácticas ≥ 95.
- **Métricas de carga:** LCP < 2,5 s, CLS < 0,05 e INP < 200 ms.
- **Peso inicial:** JS < 120 KB gzip, sin contar Three, que se carga de forma diferida.
- **Accesibilidad:**
  - Navegación completa con teclado y foco visible.
  - `lang="es"`, textos alternativos y contraste AA en ambos modos.
  - Los contenidos animados no deben quedar ocultos para los lectores de pantalla.
- **SEO:** completo y editable desde el superadmin. Ver la sección «SEO configurable desde el superadmin».
- **Navegadores:** sin errores en consola ni de CSP en Chrome, Safari iOS y Firefox.

## Proceso de trabajo

1. **Boceto antes del código.**
   - Presentar 2 direcciones visuales como página para ver en el navegador.
   - **Cada dirección se muestra en modo claro y en modo oscuro**, con el interruptor funcionando.
   - Cada boceto incluye la portada, los beneficios y una muestra del movimiento.
   - Esperar la aprobación antes de seguir.
2. **Construir** sección por sección, con la estructura HTML con SEO primero y las islas interactivas después.
3. **Verificar con Playwright:**
   - Capturas a 375, 768, 1280 y 1920 px, en modo claro y oscuro.
   - Que el modo correcto esté desde el primer pintado (sin parpadeo), con sistema claro, sistema oscuro y elección guardada.
   - Que la elección pase al panel.
   - Precarga en dos casos, carga rápida y red lenta (por ejemplo «Slow 4G»): que respete el tope de 1,2 s, que se muestre solo una vez por sesión y que el pájaro pase a la portada sin salto.
   - Precarga con JavaScript bloqueado: la capa debe ocultarse sola.
   - Que la prueba existente `tests/preload.mjs` del panel siga pasando.
   - Con movimiento reducido.
   - Sin WebGL.
   - Sin errores de consola ni de CSP.
   - Ejecutar `npm run build` y las suites existentes para confirmar que el panel y las landings no se rompieron.
4. **Documentar** según `AGENTS.md`:
   - Crear la guía `docs/HOME.md`.
   - Agregarla a la tabla de guías del documento maestro.
   - Registrar en la bitácora el cambio, las pruebas realmente ejecutadas y las limitaciones.
5. **No hacer commit ni push** hasta que el usuario diga «subelo».
   - Excluir siempre `backend/migrations/019_accounts_plans.sql`, `docs/PROMPT-MODULO-WHATSAPP.md` y `docs/mockups/`.

## Pendientes que debe decidir la marca antes de publicar

- [ ] Frase principal definitiva. Se puede cambiar después desde «Sitio público».
- [ ] Título, meta descripción y palabras clave. Hay valores iniciales propuestos y se pueden editar después desde el superadmin.
- [ ] ¿Se muestran los precios o se pone «Hablemos»? ¿Hay plan gratis o de prueba?
- [ ] Número de WhatsApp de ventas para el botón flotante.
- [ ] Logos finales.
- [ ] Capturas del panel con una cuenta de ejemplo, nunca con datos de clientes reales.
- [ ] ¿Se muestra la sección «Próximamente»?

## Criterio de terminado

- El home se ve y funciona en celular y escritorio, **en modo claro y en modo oscuro**, y mantiene la marca: el pájaro, las facetas, los colores y Montserrat.
- Cumple las métricas de arriba y no promete nada que no exista.
- El panel y las landings siguen funcionando igual.
- La marca aprobó el boceto y el resultado final.
