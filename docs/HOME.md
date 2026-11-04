# Página de inicio pública (home)

Home de Tinbana en `/` del dominio principal (`APP_URL`). Los subdominios de las tiendas siguen respondiendo 404 en `/`. El encargo completo está en [PROMPT-HOME.md](PROMPT-HOME.md).

## Archivos

| Archivo | Qué hace |
|---|---|
| `home.html` | Segunda entrada de Vite. Todo el contenido y las etiquetas SEO van en el HTML (sin depender de JavaScript). Entre `<!--tb:seo-->` y `<!--/tb:seo-->` quedan los valores por defecto, que el superadmin podrá reemplazar (etapa 2). |
| `src/home/main.tsx` | Tema, menú, precarga, animaciones (GSAP y ScrollTrigger con `gsap.matchMedia`) e islas React. |
| `src/home/home.css` | Tokens de modo claro («papel cálido») y oscuro («noche de origami») y estilos. Todo color sale de variables. |
| `src/home/facets.ts` | Triángulos de papel en 3 capas, con paralaje al hacer scroll y elevación cerca del puntero. |
| `src/home/cursor.ts` | Puntero propio: punto exacto más faceta con retraso. Estados por `data-cursor` y efecto magnético con `data-magnetic`. |
| `src/home/ChatDemo.tsx` | Demo de confirmación por WhatsApp. Se reproduce al entrar en pantalla y un clic la repite. |
| `src/home/Calculator.tsx` | Calculadora de utilidad por pedido, marcada como «Ejemplo». Solo calcula en el navegador. |
| `src/OrigamiScene.tsx` | Pájaro 3D compartido con el panel. Nuevas propiedades opcionales `area` y `tilt`; el panel no cambia. |
| `backend/public/brand/home-init.js` | Corre en `<head>` antes del primer pintado (archivo externo por la CSP): aplica el modo y decide si se muestra la precarga. |
| `backend/public/brand/preload.css` | Misma precarga del panel, con la variante `.home-preload` al final. |
| `backend/public/index.php` | `/` sirve `app/home.html` con `Cache-Control: public, max-age=300`. |

## Comportamiento

- **Modo de color:**
  - En la primera visita, sigue el sistema. Si la persona ya eligió, usa su elección.
  - Se guarda con la clave del panel (`tinvana-theme`), así que la elección pasa al panel. Para quien nunca eligió, el panel sigue abriendo en claro.
  - El cambio de modo se anima con un revelado circular (View Transitions), salvo con movimiento reducido.
- **Precarga:**
  - Se muestra una vez por sesión (`sessionStorage`) y nunca con movimiento reducido.
  - Aparece solo si la carga pasa de 300 ms, y tiene un tope de 1,2 s.
  - Al terminar, el pájaro vuela hasta el pájaro de la portada.
  - Por CSS se oculta sola a los 1,5 s si el script no llega. Si el script llega tarde, no la vuelve a mostrar y se salta la entrada de la portada.
- **Movimiento:**
  - Títulos que se despliegan como un pliegue.
  - Herramientas sueltas que se pliegan en el pájaro: sección fijada con scroll, solo en escritorio.
  - Funciones que siguen al scroll y línea de pasos que se dibuja.
  - El pájaro sube al bajar la página.
  - Sin efectos con movimiento reducido.
- **Puntero:**
  - Solo con mouse y con movimiento permitido.
  - En los campos vuelve el cursor de texto.
  - Al navegar con Tab se oculta.
  - Al hacer clic salen 3 triangulitos.
- **Pájaro 3D:** solo en escritorio con WebGL. En celular y con movimiento reducido se usa el SVG.

## Verificación (2026-11-03, local)

- **Build:** `npm run build` sin errores. Inicial del home: 24,5 KB gzip del home más 100 KB gzip del bloque compartido (React y GSAP). Three.js (192 KB gzip) se carga aparte, solo en escritorio.
- **Comprobaciones de Playwright:** 14 pasaron, en una vista previa local con la base de pruebas.
  - Demo de chat completa.
  - Puntero sobre el botón principal y cursor de texto en los campos.
  - Calculadora.
  - Movimiento reducido: sin precarga, puntero normal, portada visible y chat completo.
  - Sin JavaScript: contenido, `h1`, meta descripción y chat estático presentes, y precarga oculta.
  - Red lenta: la precarga se va por CSS 1,8 s después del primer pintado.
  - Segunda carga: sin precarga.
- **Capturas:** 1440 px y 390 px, en claro y oscuro. Sin errores de consola y sin scroll horizontal.
- **Suites del panel:** `npm test` 107, `preload` 25, `store-router` 20, `admin` 39 y `errors-session` 15 (con `SESSION_LIFETIME=8`).
  - `account-access` no se ejecutó, porque necesita su propio servidor en el puerto 8084.

**Sin medir:** Lighthouse y las métricas de carga (LCP, CLS e INP).

## Pendiente

- [ ] **Etapa 2:** pestaña «Sitio público» del superadmin (SEO, redes, WhatsApp de ventas, frase y subtítulo), escritura de etiquetas por PHP, `sitemap.xml` con `/` y `robots.txt`.
- [ ] **Imagen para compartir** de 1200×630.
- [ ] **Fuentes:** Montserrat se sirve en TTF, unos 176 KB por peso. Convertirla a WOFF2 con un subconjunto latino aligera mucho la carga en celular y también afecta al panel.
- [x] **Logos:** ya dicen «TINBANA» (2026-11-04). Se reemplazó el contenido y se conservaron los nombres de archivo `tinvana-*`.
- [ ] **Aleteo procedural del pájaro 3D:** hoy flota, se inclina hacia el puntero y vuela con el scroll, pero no mueve las alas.
- [ ] **Decisiones de la marca:**
  - Precios.
  - Sección «En camino»: hoy se muestra, marcada como no disponible.
  - Botón flotante de WhatsApp.
  - Frase principal.
