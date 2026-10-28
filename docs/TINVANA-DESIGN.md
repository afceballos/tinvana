# Identidad Tinbana

Cambio exclusivo de presentación. Los archivos PHP, las migraciones y `src/api.ts` se compararon byte a byte con una instantánea tomada antes del rediseño: sin cambios. Se conservaron endpoints, rutas, sesiones, contratos de mensajes del constructor, permisos y datos guardados. No se actualizó ninguna preferencia comercial existente en PostgreSQL.

## Sistema visual

- Naranja principal `#FF6A00`, secundario `#FFBA3D`, carbón `#1E1E1E`, crema `#FFF8F1` y borde `#FFE0CD`. Los valores hexadecimales del brief son la referencia.
- Montserrat de Google Fonts, pesos 400–800. Se descargó desde la API oficial de Google Fonts y se sirve con `@font-face` local para respetar la CSP existente sin modificar PHP. Fuente y licencia en `backend/public/brand/fonts/`.
- Assets originales de `Iconos y logos/`, copiados al directorio público de marca. `tinvana-light.svg` es una variante del SVG original con las letras claras para el fondo carbón; conserva la paloma. Favicon: símbolo SVG original.
- Tokens y componentes del panel en `src/tinvana.css`; estilos compartidos de logo, fuente y landings en `backend/public/brand/brand.css`. Los estilos públicos CSS permanecen como recursos estáticos.

## Movimiento

`BrandEntrance` muestra una entrada de paloma con GSAP, sin retrasar solicitudes ni cambiar el estado de autenticación. Las transiciones de pantallas respetan movimiento reducido. Los productos aparecen al entrar en el viewport mediante IntersectionObserver y GSAP, con limpieza al desmontar.

`OrigamiScene` carga Three.js dinámicamente solo en la bienvenida de escritorio y con movimiento permitido. Construye las facetas desde los puntos del SVG aportado. Tiene perspectiva, movimiento procedural y respuesta sutil al puntero. Limita DPR a 1.5, pausa fuera de pantalla o al ocultar la pestaña y libera geometrías, materiales, renderer, observadores y animaciones. Sin WebGL, en móvil o con movimiento reducido conserva el SVG estático.

## Alcance y compatibilidad

No se cambiaron colores o logos personalizados en base de datos. Los colores predeterminados anteriores se presentan con el nuevo tema mediante CSS/clases de presentación; otras preferencias personalizadas siguen funcionando. El controlador y HTML generado por PHP se conservaron. El runtime de las landings cambia visualmente el logo predeterminado, su texto alternativo, el favicon y el pie de plataforma. Sin JavaScript, algunos textos de marca del HTML original de PHP pueden conservar la identidad anterior. Los correos transaccionales generados exclusivamente por PHP no fueron modificados.

Los identificadores técnicos de mensajes `zenzales-*` y las rutas históricas no se renombraron: son contratos funcionales, no nombres visibles de marca. El proyecto permanece en su carpeta original.

## Verificación

- `npm run build`: TypeScript y ambos builds correctos. Three.js queda en un chunk separado. Persisten avisos de tamaño de bundle y assets públicos resueltos en runtime.
- `npm test` sobre PostgreSQL local aislado: 107 pruebas funcionales aprobadas.
- `node tests/tinvana-ui.mjs`: 24 comprobaciones durante este cambio, con login real local, formularios, navegación móvil, subida de imágenes, vista previa del constructor, selección de biblioteca, WebGL real y alternativa estática.
- Revisión de solo lectura sobre HTTPS público: acceso, registro, panel, biblioteca, editor y landing, sin errores JavaScript ni CSP. No se guardaron perfiles, landings o leads de usuarios reales.

Las pruebas usan `.tools/test-env.json` y fixtures locales existentes. La instantánea de integridad previa está en `.tools/tinvana-backend-baseline.json`, fuera del repositorio. No se desplegó mediante FTP a Hostinger ni se cambió su configuración pendiente de PostgreSQL.

Nota posterior: la eliminación de archivos fue solicitada y autorizada por separado, después del rediseño. Añade cambios puntuales en Media.php y Api.php, documentados en IMAGES.md. La verificación histórica de hashes solo se activa con CHECK_TINVANA_BASELINE=1; no aplica a nuevas funciones autorizadas.
