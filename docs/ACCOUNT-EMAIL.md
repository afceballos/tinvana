# Registro, verificación y recuperación

## Funcionamiento

Login, registro y recuperación comparten el marco visual de acceso. La recuperación aparece junto al formulario de login, antes de su botón principal, y el registro debajo del botón. Registro y recuperación ofrecen un regreso claro al login. Reenviar verificación se muestra después de solicitar el correo, en un enlace vencido o como ayuda tras un error de login; no ocupa una tercera acción permanente en la pantalla inicial. En móvil, la cabecera de marca se compacta para dar prioridad al formulario.

- `/registro`: nombre, apellido y correo. Crea una cuenta sin verificar con rol `user`. No permite elegir permisos ni acceder a otros usuarios.
- `/verificar-correo`: el enlace permite crear y confirmar la contraseña; solo entonces se verifica el correo y se puede iniciar sesión. Así nadie puede establecer de antemano la contraseña de una cuenta registrada con el correo de otra persona.
- `/reenviar-verificacion`: pide otro enlace; el anterior deja de funcionar.
- `/recuperar-contrasena`: solicita un enlace para una cuenta verificada.
- `/restablecer-contrasena`: establece una nueva contraseña y revoca todas las sesiones previas. No inicia sesión automáticamente.

Verificación: **24 horas**. Recuperación: **30 minutos**. Los enlaces son aleatorios de 32 bytes, de un solo uso, y solo su SHA-256 se guarda en `account_tokens`. La cola almacena el enlace cifrado con AES-GCM y elimina ese contenido al enviar o cancelar. El frontend no recibe enlaces en las respuestas de solicitud. El token del enlace usa el fragmento `#token=`, que no se envía al servidor como URL; se retira de la barra de dirección al abrir la pantalla. Si recargas esa pantalla, vuelve a abrir el enlace del correo. El token solo se consume al enviar el formulario, para evitar que un escáner de enlaces active cuentas por abrir la URL.

CSRF, límites de intentos por IP y por correo, bloqueo transaccional de usuario/token y respuestas genéricas para correos existentes y desconocidos. No se registran contraseñas, enlaces ni mensajes de error completos del proveedor. La clave de cifrado debe mantenerse al migrar PostgreSQL. Las cuentas existentes al aplicar `009_account_email.sql` conservan su acceso; el administrador creado por CLI también se considera validado por el instalador.

## Alternativa sin buzón: Resend por HTTPS

No hace falta crear un buzón de correo para enviar mediante una API. Sí hace falta una cuenta del proveedor, una clave privada y verificar el dominio remitente en su DNS. Nunca inventes registros DNS: usa exactamente los proporcionados por el servicio. Mantén los registros existentes y configura SPF/DKIM y DMARC conforme a su documentación, sin reemplazar MX de correo entrante innecesariamente.

En `backend/.env`:

```dotenv
MAIL_TRANSPORT=resend
MAIL_FROM_ADDRESS=no-reply@zenzales.com
RESEND_API_KEY=
APP_URL=https://tu-dominio-de-la-plataforma
```

Destinatarios y enlaces se procesan en PHP. cURL usa exclusivamente `https://api.resend.com/emails`, verifica TLS, limita tiempos y no sigue redirecciones. El mismo ID de cola se reutiliza como `Idempotency-Key`; Resend conserva esas claves durante 24 horas. El logo apunta al archivo público de la marca en `APP_URL`. Mantén desactivado el seguimiento de clics y aperturas para estos mensajes de seguridad.

Fuentes oficiales: [envío por API](https://resend.com/docs/api-reference/emails/send-email), [verificación del dominio](https://resend.com/docs/dashboard/domains/introduction), [precios vigentes](https://resend.com/pricing). Las cuotas del plan gratuito pueden cambiar; revísalas al activar la cuenta.

## Alternativa con SMTP

```dotenv
MAIL_TRANSPORT=smtp
MAIL_FROM_ADDRESS=no-reply@zenzales.com
SMTP_HOST=
SMTP_PORT=587
SMTP_ENCRYPTION=tls
SMTP_USERNAME=
SMTP_PASSWORD=
```

Con TLS implícito usa puerto 465 y `SMTP_ENCRYPTION=smtps`. PHPMailer valida certificados; no se permite SMTP sin cifrado. Los correos incluyen HTML con estilos inline, una alternativa de texto y el logo incrustado mediante CID. Un mensaje aceptado por SMTP o API no garantiza llegada a bandeja principal; revisa rebotes y reputación en el proveedor.

## Cola y despliegue

```sh
php backend/bin/console.php migrate
npm run build
php backend/bin/console.php mail:work 20
```

Ejecuta `mail:work` cada minuto con cron y `maintenance` diariamente. La cola usa PostgreSQL, cinco intentos con espera progresiva, y descarta enlaces vencidos/usados. Sin configuración, las solicitudes devuelven 503 explícito y no crean cuentas pendientes ficticias ni afirman que se envió correo. La configuración no prueba que la clave sea válida: revisa el resultado del worker. SMTP puede duplicar un mismo correo si se acepta y se pierde la confirmación; el enlace sigue siendo de un solo uso. No se depende de Supabase Auth ni de servicios propietarios para autenticar.

El dominio público debe tener HTTPS y `APP_URL` debe ser fijo y confiable; nunca se construyen enlaces usando el header Host. En el túnel de pruebas, `APP_URL` debe coincidir con el túnel vigente tanto en PHP como en el worker. Reinicia el worker tras cambios de configuración/código. El equipo y túnel deben seguir encendidos para abrir los enlaces.

## Comprobaciones

`node tests/account-access.mjs`: PostgreSQL aislado, HTTP local 8084 y SMTP con TLS local 2525. Verifica registro/rol, CSRF, hash del token, rotación, expiración, uso único, cambio de contraseña, revocación de sesiones, no enumeración, límites, UI responsive, correo multipart con logo, rechazo y reintento SMTP. Las cuentas temporales se eliminan al terminar. Servidor: `backend/tests/account-router.php`; usa únicamente `.tools/test-env.json` con base `zenzales_test` en loopback.

`php backend/tests/account-resend.php`: transporte API interceptado y protegido por la misma configuración local, sin conectar con Resend. Comprueba destino fijo, TLS, estructura, logo, idempotencia y errores sin secretos.

La entrega a un buzón real y la verificación DNS quedan pendientes hasta disponer de una cuenta del proveedor. No se implementó SMS.
