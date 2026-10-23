# Formulario de contacto y dirección

Las landings públicas comparten el formulario actualizado. No hay que volver a generar ni publicar cada producto para añadir estos campos. La previsualización privada sigue sin aceptar leads.

Se solicitan nombre, apellido, email, teléfono, país de entrega, departamento, ciudad/municipio y dirección. El país de entrega está limitado inicialmente a **Colombia**. Apartamento/indicaciones y código postal son opcionales. Si se introduce código postal, debe tener seis dígitos y conserva ceros iniciales. No se infiere un código postal a partir del municipio, ni se verifica que una dirección exista físicamente.

El departamento filtra los municipios disponibles; al cambiarlo se borra la ciudad anterior. PHP valida la pertenencia del municipio al departamento utilizando una copia local del listado DIVIPOLA del DANE. El archivo incluye 1.122 municipios y otras áreas territoriales y 33 departamentos/distritos según la fuente, con datos fechados el 24/01/2025. Esto no confirma cobertura de transporte. Fuente, versión y licencia están en `backend/resources/geo/README.md`; la actualización del listado es explícita.

## Teléfono y país sugerido

El selector utiliza `intl-tel-input` con banderas reales, prefijos, buscador en español y selección adaptada a móvil. Se sirven sus recursos desde el propio dominio, sin CDN, sin llamadas a servicios externos de geolocalización y sin cargar el módulo adicional de validación de JavaScript. PHP valida los números mediante `giggsey/libphonenumber-for-php` y guarda el teléfono en E.164 (por ejemplo, `+573001234567`). La validación comprueba el patrón del número, no su existencia, titularidad ni disponibilidad en WhatsApp.

El país del teléfono es independiente del país de entrega: un teléfono internacional puede solicitar entrega en Colombia. Por defecto se preselecciona Colombia; el visitante siempre puede corregir la selección.

Con JavaScript, el `<select name="phone_country">` queda oculto detrás del selector de banderas y copia siempre su país. Un control obligatorio oculto e inválido bloquearía el envío sin mensaje (error de consola «An invalid form control with name='phone_country' is not focusable»). Por eso, si queda vacío, se corrige con el país de la bandera y se reenvía; si no hay país (por ejemplo, prefijo desconocido como `+999`), el campo Teléfono muestra «Selecciona el país de tu teléfono.». Prueba: `node tests/lead-phone-country.mjs` (6 comprobaciones; endpoint del lead simulado).

Un hosting detrás de un proxy fiable puede activar `TRUST_COUNTRY_HEADER=true` para usar `CF-IPCountry` como sugerencia inicial. Solo debe habilitarse si ese proxy controla la cabecera y el origen no acepta tráfico directo que la pueda falsificar. En el enlace temporal se habilita en su router específico, cuyo origen escucha exclusivamente en loopback tras Cloudflare Tunnel. En un hosting nuevo está deshabilitado por defecto. País desconocido, ausencia de cabecera o proveedor sin detección hacen que se use Colombia. La detección IP es aproximada; no se deduce el país a partir del idioma del navegador ni se solicitan coordenadas GPS.

## Persistencia y webhook

La migración `007_lead_address.sql` añade `delivery_address` (JSONB) y `phone_country` al lead. Los registros anteriores se conservan con campos nuevos nulos; no se les inventa una dirección. El panel privado muestra la dirección guardada en Consultas recibidas y mantiene la comprobación de propiedad de cada usuario.

El webhook recibe además de los datos actuales:

| Campo | Contenido |
|---|---|
| `phone` | Número normalizado con prefijo internacional |
| `phone_country` | País del número, ISO de dos letras |
| `country_code`, `country` | `CO`, `Colombia` |
| `department_code`, `state` | Código y nombre oficial del departamento |
| `city_code`, `city` | Código DIVIPOLA y nombre oficial del municipio |
| `address` | Dirección principal |
| `address_details` | Apartamento o indicaciones, si se proporcionan |
| `postal_code` | Seis dígitos o null |

El backend deriva los nombres de departamento y municipio a partir de sus códigos. El visitante no puede introducir nombres libres que suplanten esas ubicaciones. Los precios y datos de producto siguen viniendo de las copias del servidor. Se conserva la misma deduplicación y cola de reintentos; el lead se guarda antes de intentar el webhook.

En GHL debes mapear los campos nuevos en el workflow receptor, según `docs/GHL.md`. No se modificó el workflow externo ni se enviaron contactos de prueba al GHL real.

## Instalación y verificación

Ejecuta `composer install` en backend, `php backend/bin/console.php migrate` y `npm install`/`npm run build`. El build copia las banderas y su licencia a `backend/public/brand/phone`, y emite `landing-assets/landing-form.css`. Despliega esos archivos junto con el runtime; no basta con reemplazar solo el JS.

El formulario conserva opciones nativas y POST HTML para navegadores sin JavaScript. Con JavaScript filtra las ciudades y mejora el selector telefónico. El encabezado del modal permanece visible durante el desplazamiento y el país telefónico puede buscarse con teclado.

Pruebas realizadas: 20 comprobaciones de validación y geografía, 69 pruebas PHP existentes, 107 comprobaciones HTTP con sesiones reales/PHP/PostgreSQL y webhook TLS local (incluyendo dirección y teléfono normalizado), y navegador en escritorio/móvil para banderas, búsqueda, dependencia y reinicio de ciudades, formulario nativo, guardado y estado pendiente. Solo se guardaron leads en la base aislada de pruebas; no se ejecutó un envío real a GHL.

Referencias: [DIVIPOLA del DANE](https://www.datos.gov.co/Mapas-Nacionales/DIVIPOLA-C-digos-municipios/gdxc-w37w), [código postal colombiano](https://www.mintic.gov.co/portal/historico/w3-article-5529.html), [cabecera de país de Cloudflare](https://developers.cloudflare.com/network/ip-geolocation/), [selector telefónico](https://intl-tel-input.com/docs/options), [validación PHP](https://github.com/giggsey/libphonenumber-for-php).

Las ayudas complementarias del formulario se muestran mediante iconos «i», con acceso por foco, hover y toque; Escape y el desplazamiento cierran la ayuda. Los mensajes de validación y el consentimiento permanecen visibles. El selector telefónico usa un panel contenido en el diálogo, con búsqueda y scroll propios. El encabezado del pedido permanece separado del área desplazable del formulario.

Verificación de interfaz: `.tools/modal-ux-check.mjs` comprueba escritorio y móvil, límites del selector, tooltips y acceso al botón final tras insertar sugerencias de autocompletado simuladas. No envía leads. Esta prueba no ejecuta la extensión NordPass real; su comportamiento debe confirmarse en el navegador del usuario.

Los selectores de país de entrega, departamento y municipio ahora incluyen búsqueda y orden alfabético. La entrega sigue restringida a Colombia. El selector telefónico también está ordenado alfabéticamente, sin países preferentes. Consulta GEOGRAPHY.md.
