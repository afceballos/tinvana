# Identidad visual ZenZales

Referencia revisada: https://zenzales.com/ el 13 de octubre de 2026. Se inspeccionó la página pública y sus estilos calculados en Edge: los títulos visibles usan **Comfortaa**, los textos/botones **Lato**, el texto principal verde petróleo **#06444A**, el acento verde **#2DB276** y la menta **#C5E9D9**. La configuración general de su constructor también incluye Inter, pero las fuentes efectivas de la página son Comfortaa/Lato; se usaron estas últimas.

El panel aplica esa paleta a navegación, botones, fondos, estados y pantalla de carga. Se mantienen blancos sobre verde petróleo en las acciones principales para dar contraste. Los títulos usan Comfortaa y el contenido Lato. En tarjetas compactas de catálogo se conserva Lato para leer nombres largos.

## Logo y archivos

El usuario suministró `logo.png`: PNG transparente blanco/verde de 500×500. Se copió sin modificar bytes a `backend/public/brand/logo-white.png`; no se retocó ni se generó una versión alternativa. El logo completo se presenta sobre fondos oscuros en login y sidebar. Para espacios compactos, CSS muestra la parte del símbolo del mismo archivo. En la pantalla de carga y el encabezado público se acompaña de la palabra ZenZales sobre fondo claro.

`backend/public/brand/brand.css` define fuentes locales y utilidades compartidas del logo. `src/brand.css` define tokens y ajustes del panel. Las fuentes regular/bold se descargaron de Google Fonts y se sirven desde `/brand/fonts/`, con `font-display:swap`. Sus licencias OFL están incluidas junto a los archivos. No se solicitan fuentes a Google durante el uso de la plataforma.

Las landings públicas reciben el logo de cabecera y la tipografía compartida mediante el CSS de marca. Su contenido, precios y colores comerciales guardados permanecen en PostgreSQL; la actualización no migra ni sobrescribe esos datos.

## Despliegue y verificación

Incluye siempre toda la carpeta `backend/public/brand` junto al build. La raíz pública PHP sirve `/brand/*`; Vite usa un proxy a PHP para esas rutas en desarrollo. El aviso del build sobre `/brand/brand.css` indica que este CSS estático se resolverá desde PHP en ejecución; la prueba de navegador comprobó que se entrega correctamente.

`tests/brand.mjs` verificó con Edge y HTTPS real: hash del logo copiado, colores calculados, fuentes locales cargadas, login desktop/móvil, sidebar completo y símbolo al contraer, menú móvil sin desbordamiento, logo y títulos en una landing publicada, ausencia de peticiones de fuentes externas y de errores JavaScript. La sesión de revisión fue temporal, eliminada al terminar; no se modificaron productos ni leads.

Capturas en `test-results/brand-login-desktop.png`, `brand-login-mobile.png`, `brand-panel-desktop.png`, `brand-navigation-mobile.png` y `brand-public-landing.png`.
