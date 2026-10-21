# Selectores de ubicación

Perfil: países y territorios del catálogo mundial (250), con provincia y ciudad dependientes. Landings: entrega exclusivamente en Colombia, con departamentos y municipios del DANE. Los países del teléfono son independientes del país de residencia o entrega y se ordenan alfabéticamente en ambos formularios.

Los selectores comparten búsqueda sin distinción de tildes/mayúsculas y orden alfabético en español. Soportan flechas, Enter, Escape, foco visible, lector de pantalla, una lista compacta con scroll y carga incremental de resultados cuando la lista es larga. Escape cierra primero la lista, conservando el modal del pedido. En perfil, cambiar el país limpia provincia, ciudad y código postal; cambiar la provincia limpia la ciudad. Las peticiones obsoletas se cancelan.

La lista nativa del formulario público se conserva para HTML sin JavaScript y para validación y envío de los campos originales. No se cambian códigos DIVIPOLA ni el payload de leads. Perfil guarda el ISO2 de país, nombres y, al elegir del catálogo, `state_code`/`city_code`; PHP comprueba la relación y obtiene los nombres del catálogo, ignorando nombres enviados que contradigan un ID. Los perfiles anteriores conservan sus nombres y se reconcilian con las listas al abrirlos.

El catálogo mundial es una copia versionada de [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database), versión `v4.0-export.51` (12-10-2026), bajo ODbL 1.0. Los datos de Colombia son una fuente separada DANE CC BY-SA 4.0. Las licencias, transformación y descargas están disponibles en `/datos-geograficos`. El perfil permite entrada manual si una provincia/ciudad no aparece, sin afirmar que esté validada por el catálogo. No se verifican domicilio, código postal internacional ni cobertura logística. No se prometen todas las localidades del mundo ni actualizaciones automáticas.

La copia depurada pesa aproximadamente 5,6 MB en total, dividida por país. No requiere claves de terceros, conexiones externas en ejecución ni importar ciudades a PostgreSQL. El navegador solo pide países, provincias del país y ciudades de una provincia. Endpoints públicos de solo lectura y con caché:

```
GET /api/geography/countries
GET /api/geography/states?country=US
GET /api/geography/cities?country=US&state=1416
```

Los IDs son propios de la fuente y no se deben interpretar como ISO de subdivisión. En Colombia se conservan los códigos DANE. No se admiten rutas/URLs arbitrarias ni nombres de archivo proporcionados por el cliente.

Para reconstruir explícitamente la copia, descargar el archivo fijado en `backend/resources/geo/world/README.md` a `.tools/world-geo.json.gz`, conservar la licencia como `.tools/world-geo-LICENSE` y ejecutar `py -3 scripts/prepare-geography.py`. Revisar las diferencias de datos antes de sustituir una versión con IDs existentes. La copia está incluida en el código: no es necesario descargarla para instalar ni para compilar el frontend.

`node tests/geography.mjs` comprueba APIs públicas, relaciones de IDs, guardado de perfil mundial, fallback manual, selectores en escritorio/móvil, búsqueda por tildes, teclado, limpieza de dependencias, Colombia en landings y guardado del lead con su municipio. Requiere PHP 8081 y PostgreSQL local aislado de pruebas; no envía consultas a un webhook real. Las pruebas generales HTTP siguen comprobando login, permisos, publicación y payload del webhook.
