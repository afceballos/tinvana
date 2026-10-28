# Contexto y continuidad de Tinbana

Antes de trabajar, leer [docs/CONTEXTO-PROYECTO.md](docs/CONTEXTO-PROYECTO.md). Es el documento maestro del estado actual; después consultar las guías específicas que enlaza. Contrastar siempre el estado descrito con el código y las migraciones.

## Mantener la documentación

Después de cada cambio funcional, de configuración o despliegue relevante:

1. Actualizar los apartados afectados del documento maestro.
2. Marcar `[x]` solo lo implementado y comprobado al nivel indicado; conservar `[ ]` para pendientes. Separar implementación de verificación externa.
3. Registrar fecha, cambio, pruebas realmente ejecutadas, limitaciones y siguiente paso en su bitácora. No inventar fechas, resultados ni accesos.
4. Actualizar también la guía técnica del módulo cuando cambien contratos, instalación o comportamiento.
5. Mantener un único estado actual: corregir afirmaciones que quedaron obsoletas y conservar los resultados anteriores como históricos, sin presentarlos como pruebas nuevas.

## Reglas del proyecto

- Aplicación real y separada del catálogo original. No modificar el catálogo de referencia ni usar datos ficticios como fallback en producción.
- React/TypeScript/Vite/Tailwind/React Router; PHP 8.2+ para API, autenticación y rutas públicas; PostgreSQL estándar con PDO/pdo_pgsql. Supabase es proveedor PostgreSQL, no autenticación ni acceso directo desde React.
- Mantener aislamiento por propietario, CSRF y cifrado de secretos en servidor. Nunca copiar valores de `.env`, sesiones, tokens o contraseñas a documentación, repositorios, capturas ni respuestas.
- No ejecutar fixtures, helpers de reinicio ni pruebas de escritura contra Supabase o datos del usuario. Utilizar la base local aislada y retirar solo sus fixtures al terminar.
- No afirmar que un servicio externo funciona sin haberlo probado. Una confirmación local no crea una orden Dropi; un HTTP 2xx del webhook no acredita ejecución comercial en GHL.
- No reintentar a ciegas la creación de una orden externa con resultado desconocido.
- Preservar cambios ajenos existentes en el workspace; revisar el alcance antes de editar.
- El rediseño Tinbana fue visual. Las ampliaciones posteriores expresamente autorizadas incluyen eliminación segura de medios y las etapas de pedidos, correcciones y ofertas por cantidad; no interpretar la restricción histórica de frontend como prohibición general de esas ampliaciones.

Estas instrucciones no sustituyen las instrucciones del usuario ni las del entorno.
