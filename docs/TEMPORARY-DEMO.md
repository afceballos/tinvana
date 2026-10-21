# Enlace temporal HTTPS

Corrección verificada: el router del servidor temporal debe devolver el resultado del router PHP incluido para que los archivos estáticos se sirvan. Se detectó que el HTML respondía 200 pero JavaScript/CSS estaban vacíos; se corrigió y la comprobación ahora exige contenido y MIME adecuados. Edge renderizó el login público sin errores JavaScript; captura local `test-results/demo-login.png`.

La demostración usa un Quick Tunnel de Cloudflare hacia un servidor PHP separado en `127.0.0.1:8082`. Sirve el build de React, la API y las rutas públicas bajo el mismo origen. Vite 5173 y PHP local 8080 permanecen independientes.

La URL actual está en `.tools/demo-runtime.json`. El servidor lee ese origen como `APP_URL`, activa `APP_ENV=production`, cookies Secure/HttpOnly/SameSite Lax, oculta errores internos y envía `X-Robots-Tag: noindex, nofollow`. Los archivos de configuración, sesiones y tokens permanecen fuera de la raíz pública.

**Usa los datos reales de Supabase y las integraciones reales del usuario.** Los cambios, publicaciones, leads y envíos hechos desde la demostración persisten. Cada visitante puede ver páginas publicadas; el panel necesita login PHP. No compartas tus credenciales de administrador para enseñar únicamente una landing.

Un worker PHP separado consulta entregas pendientes cada 15 segundos. El webhook debe estar configurado/activo; una aceptación HTTP no confirma por sí sola la creación de contactos u oportunidades en GHL. No se enviaron leads ficticios para probar el servicio externo.

Las imágenes propias guardadas con localhost o un dominio temporal anterior se adaptan al `APP_URL` de la instancia al leer la landing, incluida la galería de bloques. No se reescribe la base de datos para abrir el túnel. Las URLs remotas de proveedores se conservan.

## Duración y cierre

El computador debe permanecer encendido, sin suspensión y con Internet. Cloudflare no garantiza disponibilidad de Quick Tunnels y el dominio cambia al abrir un túnel nuevo. Documentación: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

Para cerrar exclusivamente la demostración:

```powershell
& .tools/stop-demo.ps1
```

El script valida ejecutables y argumentos antes de cerrar túnel, PHP 8082 y worker; conserva los servidores locales. Los PID y logs están en `.tools/demo-*`, excluidos del repositorio. No subas `.tools` a un hosting ni publiques su contenido.

Para crear otro enlace, ejecuta `cloudflared tunnel --url http://127.0.0.1:8082 --protocol http2`, actualiza `.tools/demo-runtime.json` con la URL generada y reinicia PHP/worker con los helpers existentes. No conectes el túnel a Vite: el servidor PHP debe servir el build completo.

Se comprobaron desde HTTPS: frontend/recursos, cookies seguras, archivos privados 404, API sin sesión 401, sesión autorizada temporal, logout, integración Dropi real, catálogo, selección guardada, sitemap, dos landings publicadas y validación del formulario público sin guardar un lead. La entrega al servicio GHL externo no se verificó con un contacto de prueba.
