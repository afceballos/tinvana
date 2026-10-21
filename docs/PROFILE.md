# Perfil y seguridad

El menú de cuenta, en la cabecera, permite abrir `/panel/perfil`, `/panel/seguridad` y cerrar sesión. Correo y usuario de acceso son de solo lectura: actualmente el usuario de acceso es el mismo correo, no existe un alias independiente.

El perfil guarda nombre y apellido obligatorios; teléfono y dirección son opcionales. El teléfono se normaliza a formato internacional y es solo un dato de contacto, sin verificación por SMS ni recuperación de cuenta. País, departamento/provincia, ciudad, dirección, indicaciones y código postal son datos privados del usuario, separados de la dirección de los leads. País, departamento/provincia y ciudad usan listas dependientes con búsqueda. Si una ubicación no aparece, permite escribirla manualmente. No se valida cobertura logística ni domicilio. Consulta GEOGRAPHY.md para fuentes y limitaciones.

La foto admite JPEG, PNG o WebP hasta 8 MB, con los límites de dimensiones del optimizador existente. PHP la decodifica y convierte a WebP de máximo 400 KB. Se almacena fuera de `public`, con identificador aleatorio, y solo el propietario autenticado puede leerla. Reemplazar o eliminar la foto retira el archivo anterior. No se admite SVG ni una URL remota.

El cambio de contraseña exige la actual y una nueva diferente, confirmada, con mínimo 12 caracteres en la interfaz y entre 12 y 72 bytes en PHP (límite del hash bcrypt). Se permite pegar y usar gestores de contraseñas. Hay cinco intentos por cuenta cada quince minutos; las contraseñas no se registran. Se cambia el hash, se regeneran sesión y CSRF y se incrementa una versión de sesión que invalida las demás sesiones al siguiente acceso autenticado. No incluye recuperación por email ni MFA.

Aplicar `php backend/bin/console.php migrate` para instalar `008_user_profile.sql`, y después compilar con `npm run build`. Los campos nuevos no modifican datos ni contraseñas existentes.

`node tests/profile.mjs` usa exclusivamente los usuarios temporales de `.tools/test-fixture.json` sobre PHP local 8081 y PostgreSQL de pruebas. Verifica persistencia, correo inmutable, CSRF, aislamiento, foto válida/inválida, formato WebP, eliminación, menú y formularios en escritorio/móvil, contraseña actual y revocación de otras sesiones. No ejecutarlo contra cuentas reales.

El nombre de la empresa (`company_name`) es opcional en registro y perfil, admite hasta 100 bytes y se guarda en `users.profile`. Se puede editar o borrar desde el perfil; no requiere otra migración ni se publica en las landings.
