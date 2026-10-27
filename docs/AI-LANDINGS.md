# Generación de landings con IA

## Activación

Cada usuario administra sus conexiones en **Panel → Integraciones de IA**. Puede guardar una clave de OpenAI y otra de Anthropic, probarlas, reemplazarlas, eliminarlas y elegir una conexión activa. La primera conexión guardada se activa si no había ninguna seleccionada. El formulario vacía el campo secreto al guardar y nunca vuelve a recuperar la clave desde el servidor.

PHP guarda las claves con AES-256-GCM en `ai_connections` (migración `006_ai_connections.sql`), vinculadas al usuario y al proveedor mediante datos autenticados. La clave maestra `TOKEN_ENCRYPTION_KEY` permanece fuera de PostgreSQL. No cambies esa clave al migrar el hosting. La API responde solo con estado, proveedor, modelo y fechas.

OpenAI utiliza Responses; Claude utiliza Messages. Cada llamada usa exclusivamente la conexión activa del propietario autenticado. Eliminar la conexión activa deja la generación desactivada, aunque exista otra guardada: el usuario debe seleccionarla. No existe fallback a claves globales ni a credenciales de otros usuarios. Si la conexión activa cambia después de abrir el asistente, se rechaza la solicitud con HTTP 409 para no cambiar silenciosamente la cuenta de consumo.

Para configurar el servicio en el hosting:

```dotenv
TOKEN_ENCRYPTION_KEY=CLAVE_MAESTRA_EXISTENTE
OPENAI_MODEL=gpt-4.1-mini
CLAUDE_MODEL=claude-haiku-5-5
AI_DAILY_LIMIT=10
```

Ejecuta `php backend/bin/console.php migrate` antes de servir esta versión. No se requiere Redis. PHP necesita cURL y TLS saliente hacia `api.openai.com` y `api.anthropic.com`. Los modelos son configurables en el backend, sin aceptar destinos ni modelos arbitrarios desde el navegador.

**Probar conexión** consulta el modelo con la clave propia, sin generar contenido. Confirma autenticación y acceso en ese momento; no garantiza saldo, cuota ni permisos futuros para generar. La comprobación se invalida al reemplazar la clave. Hay un límite de seis pruebas por usuario cada cinco minutos.

Las credenciales son claves de API, no email ni contraseña de ChatGPT o Claude. Los usuarios pueden obtenerlas en [OpenAI Platform](https://platform.openai.com/api-keys) y [Claude Platform](https://platform.claude.com/settings/keys). Deben revisar el acceso y la facturación de su cuenta del proveedor.

Para una instalación anterior con clave global OpenAI, el comando `php backend/bin/console.php ai:import email` importa `OPENAI_API_KEY` únicamente al usuario indicado, sin sobrescribir una conexión existente ni mostrar el secreto. Después de comprobar la conexión cifrada, retira esa variable del entorno. No se utiliza en las generaciones. La instalación actual ya migró la clave del administrador y retiró su copia global.

## Uso

En el constructor usa **Crear con IA**. Indica público, enfoque y tono. El **enfoque es obligatorio** y no tiene límite práctico de longitud (tope de seguridad de 60 000 bytes en el servidor). Cada landing guarda el último enfoque usado (`landing_pages.ai_brief`, PostgreSQL `026` / MySQL `042`): al volver a abrir el asistente o regenerar se precarga ese mismo; si lo cambias, se envía y se guarda el nuevo; si llega vacío, el servidor reutiliza el guardado. Puedes además guardar las preferencias para tus próximas landings, únicamente en tu cuenta. La IA propone los textos comerciales, SEO y bloques usando como fuentes: el nombre, la descripción guardada de Dropi (sin el antiguo corte de 60 frases; hasta 150 frases), sus categorías, los pares nombre/valor de atributos y variantes (nunca precios, costos, stock, SKU, proveedor, bodegas ni claves desconocidas), la descripción/características actuales del editor y el enfoque, cuyas frases entran como «Indicación del vendedor: …» (hasta 60). El vendedor responde por la veracidad de lo que escribe en el enfoque. No se vuelve a descargar el catálogo ni se consulta Dropi en esta operación.

La ventana presenta una vista previa privada, las fuentes citadas y notas sobre información faltante. Revisa la propuesta y marca la revisión para habilitar **Aplicar al borrador**. La aplicación sucede en el editor: debes guardar el borrador después. La publicación requiere la acción habitual **Publicar**. Generar, descartar o cerrar no cambia los datos guardados.

Para una sección compatible usa **Regenerar sección con IA** en sus propiedades. Mantiene ID, variante, estilo y visibilidad, el resto de los bloques, los metadatos y los campos comerciales de la página. Una generación completa conserva el precio público, galería, características, colores, WhatsApp, comercio y logo. Reasigna los enlaces personalizados del menú cuando el tipo de sección sigue existiendo; si ninguna coincide, usa menú automático.

Si el borrador cambia mientras llega una propuesta, el editor rechaza aplicarla sobre esos cambios. El original de Dropi y las copias publicadas no se sobrescriben.

## Validación y límites

El proveedor devuelve JSON Schema estricto mediante `text.format` en OpenAI y `output_config.format` en Claude; PHP vuelve a validar tipos, variantes, campos, fuentes y cantidades. IDs, marcado HTML e imágenes los controla PHP. El modelo solo puede elegir imágenes por índice de la galería actual, sin introducir URLs. Precio, tokens, proveedores, stock, leads, webhooks y JSON interno no se envían al proveedor.

Tipos permitidos para generación: presentación, beneficios, texto, lista, incluye, uso, galería, imagen y texto, ficha técnica, FAQ, precauciones y CTA. Testimonios, garantías/políticas, envíos, pagos, datos internos y selecciones de otros productos permanecen manuales. Los campos del enfoque orientan estilo, no autorizan inventar hechos.

Cada párrafo y elemento necesita referencias a fuentes existentes. Si la IA devuelve un párrafo o elemento sin fuente válida, **se quita solo ese contenido** (y las secciones que queden vacías) y se agrega una nota indicando cuánto se quitó; la propuesta completa solo falla si no queda ninguna sección respaldada. Esto permite revisar el respaldo, pero **no demuestra automáticamente que una paráfrasis sea verdadera**. El modelo puede equivocarse incluso con JSON válido. Comprueba características, beneficios, instrucciones y afirmaciones antes de publicar; las fuentes guardadas de Dropi también pueden contener errores. No hay garantía automática de exactitud ni de conversión comercial.

Límite predeterminado: 10 intentos por usuario durante una ventana de 24 horas y 2 por minuto. La reserva se realiza en PostgreSQL antes de contactar al proveedor y es atómica para el cupo diario. Los errores del proveedor también consumen un intento de la aplicación. Se limita la salida a 6.000 tokens y la respuesta a 1 MB; conexión hasta 10 segundos y solicitud hasta 90 segundos. No se hacen reintentos automáticos que puedan multiplicar cargos. Cerrar la ventana cancela la espera en el navegador, pero el proveedor puede terminar y cobrar la solicitud.

La cuota de la aplicación no es un límite monetario universal: el consumo depende del modelo y del tamaño del contenido. Configura y supervisa también los controles de consumo de tu cuenta en OpenAI o Anthropic.

Cada proveedor tiene un destino HTTPS fijo, verifica TLS, no sigue redirecciones y desactiva el almacenamiento de respuestas de OpenAI mediante `store:false`. Esto no constituye una promesa de ausencia de retención técnica por el proveedor. No se registran prompts, claves o textos de errores del proveedor. Se muestra el estado HTTP cuando falla, manteniendo la sesión del panel. Sin clave, falla explícitamente; no hay generación simulada en la aplicación.

## Hosting y pruebas

En producción usa PHP-FPM o un hosting con varios procesos: el servidor incorporado de PHP para pruebas atiende una solicitud a la vez y puede bloquear otras peticiones mientras la IA trabaja. Ajusta el timeout del hosting/proxy a más de 90 segundos. Cloudflare y tu hosting pueden tener límites propios.

Endpoints privados: `GET /api/ai/status`, `GET/PUT /api/ai/preferences`, `GET /api/landings/{id}/ai` (último enfoque de la landing), `POST /api/landings/{id}/ai` (guarda el enfoque usado; no modifica el contenido). Las escrituras requieren sesión, CSRF y propiedad de la landing. La API devuelve una propuesta, sin escribir sobre la landing.

Pruebas: `backend/tests/ai.php` valida propuestas y respuestas estructuradas sin servicios externos. `tests/ai-http.mjs` usa PHP en 8083 con `backend/tests/ai-router.php`, PostgreSQL `zenzales_test` y transportes de OpenAI y Claude interceptados exclusivamente en ese router de pruebas. `tests/ai-ui.mjs` comprueba el constructor y `tests/ai-connections-ui.mjs` la gestión de ambas conexiones en escritorio y móvil contra el mismo servidor. Los tests y el router no deben copiarse al directorio público ni habilitarse en producción.

El 14 de octubre de 2026 se verificó una generación real con OpenAI y `gpt-4.1-mini` usando una landing existente de la cuenta del administrador. PHP validó una propuesta de cuatro bloques (presentación, beneficios, precauciones y CTA), con 1.461 tokens de entrada y 623 de salida. No se guardó la propuesta ni se modificó la publicación. El 15 de octubre se migró esa clave a la conexión cifrada del administrador y se comprobó acceso real al modelo desde ella. Su copia global fue retirada. No se documenta su valor. Esta prueba confirma conexión y respuesta en ese momento, sin garantizar saldo futuro ni exactitud comercial de todos los textos.

Verificación completada: 35 comprobaciones PHP específicas de IA; 39 comprobaciones HTTP con transportes aislados de OpenAI y Claude (incluye errores, permisos y cuotas); generación, revisión, aplicación local, regeneración y descarte en navegador de escritorio y móvil; compilación TypeScript/Vite; 105 comprobaciones HTTP existentes y 69 pruebas PHP existentes. La corrección de las notificaciones al cerrar el asistente pasó también las pruebas del panel. El enlace temporal HTTPS sirve el build actualizado; sus recursos, protección de archivos privados, landings e imágenes públicas fueron comprobados.

Claude se validó con respuestas de prueba controladas y la documentación oficial; falta probar una conexión y generación real con una clave de Anthropic. No se crearon contactos externos ni se publicaron propuestas de IA durante estas pruebas.

Conexiones privadas: `GET /api/ai/connections`, `PUT/DELETE /api/ai/connections/{openai|anthropic}`, `POST /api/ai/connections/{proveedor}/test` y `/activate`. Todas las mutaciones requieren CSRF y actúan únicamente sobre el usuario de la sesión.

Referencias: [API de Claude](https://platform.claude.com/docs/en/api/overview), [Structured Outputs de Claude](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Claude Haiku](https://platform.claude.com/docs/en/models/haiku-5-5/overview), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [modelo GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
