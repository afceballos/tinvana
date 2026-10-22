# Carga y transiciones del panel

La pantalla inicial usa el sello de Zenzales, tarjetas flotantes y una órbita en los colores existentes. Se muestra durante la verificación real de sesión y desaparece al terminar; no añade pausas artificiales. Pasados siete segundos, informa que la conexión está tardando sin inventar porcentajes. El HTML inicial incluye una versión estática para cubrir la descarga de React.

Las pantallas de selección, consultas y constructor usan estados de carga compartidos. El catálogo muestra tarjetas con la estructura del contenido y un brillo suave. La consulta inicial de integraciones tiene su propio estado para evitar mostrar una selección vacía antes de cargar los datos.

La barra superior representa solicitudes API pendientes. Un contador se incrementa al iniciar cada consulta y disminuye siempre en `finally`, incluidos errores y cancelaciones. La barra aparece después de 180 ms para evitar destellos en respuestas rápidas; no pretende representar un porcentaje de descarga.

GSAP aplica entradas de 380 ms al login y al cambiar de sección; el catálogo conserva su entrada escalonada. `useGSAP` y `matchMedia` limpian efectos al cambiar de vista. Las animaciones de carga usan transformaciones CSS. `prefers-reduced-motion` desactiva movimientos repetitivos y entradas GSAP, manteniendo los mensajes visibles y accesibles.

Se usaron las instrucciones locales UI/UX Pro Max y GSAP React/Core. El buscador de UI/UX no pudo ejecutarse porque falta su módulo `core`; se utilizó como alternativa la guía estática `references/quick-reference.md`, sin persistir resultados de búsqueda no verificados.

## Verificación

Build TypeScript/Vite del panel y runtime público completado. `tests/motion.mjs` verifica con Edge y el enlace HTTPS real: escritorio, móvil de 375 px, espera prolongada, salida de carga al responder la sesión, movimiento reducido, tarjetas del catálogo, actividad de red y cambios de sección sin contenido invisible ni errores JavaScript. Las peticiones se retrasan para observar las cargas pero continúan hacia PHP/Dropi: no se sustituyen los datos. La sesión de revisión es temporal y se elimina al terminar. No se modifican productos ni se crean leads.

Capturas locales en `test-results/loading-desktop.png`, `loading-mobile.png`, `catalog-loading-desktop.png`, `catalog-loading-mobile.png` y `route-motion-mobile.png`. El build actualizado se sirve también en el enlace temporal; no requiere reiniciar el túnel.

## Capa moderna posterior

Las interacciones añadidas después (tarjetas, botones, barra lateral con píldora, diálogos, modo oscuro) están en [MODERN-UI.md](MODERN-UI.md). Respetan `prefers-reduced-motion` como el resto.

## Pantalla de carga: una sola disposición

El HTML inicial (`index.html` + `/brand/brand.css`) y `LoadingScreen` comparten la misma disposición: contenido centrado en vertical, logo arriba a la izquierda y pie abajo, ambos con posición absoluta. No reintroducir `justify-content:space-between` en `.startup-loader`: sacaba el contenido hacia arriba. `tests/preload.mjs` lo comprueba.
