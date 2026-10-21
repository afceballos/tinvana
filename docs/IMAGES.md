# Imágenes de las landings

El editor permite subir JPEG, PNG o WebP. PHP comprueba el contenido real, rechaza SVG/GIF y archivos que no sean imágenes, decodifica y vuelve a generar un WebP sin copiar metadatos ni el archivo original. Las URLs de Dropi continúan siendo remotas: no se descarga todo el catálogo. Espacios y caracteres Unicode de sus nombres se codifican sin duplicar escapes existentes.

Límites: 8 MB de entrada por archivo, 16 megapíxeles y 8000 px por lado para limitar la memoria. Salida con lado máximo de 1600 px, calidad inicial 82 y máximo 400 KB. Si hace falta, reduce calidad y dimensiones hasta cumplir el peso. Máximo 30 imágenes en la galería y 2000 archivos guardados por cuenta. La primera imagen de la lista es la principal. Después de subir o quitar una imagen, guarda la landing. Quitar de la galería no borra el archivo del almacenamiento.

Los archivos tienen nombres UUID, se guardan fuera del directorio público en `backend/storage/media` y sus datos en `media_assets`. La API de carga requiere sesión y CSRF, y verifica también la propiedad de la landing cuando se sube desde el editor. `/media/{uuid}.webp` permite acceso al propietario, a una preview firmada vigente o al público cuando el archivo figura en el contenido de una landing publicada. Al despublicar se vuelve a comprobar autorización; la caché pública de imágenes tiene un máximo de cinco minutos.

## Hosting y migración

Instala GD con soporte JPEG, PNG y WebP. El comando `check` lo comprueba. Configura PHP:

```ini
upload_max_filesize=8M
post_max_size=9M
memory_limit=256M
```

En Nginx configura `client_max_body_size 9m;`. Revisa también los límites de tu hosting/proxy. PHP necesita escritura en `backend/storage/media`; no la expongas como carpeta estática. Las rutas `/media/` deben resolverse mediante el controlador PHP igual que `/p/`. Reinicia PHP después de cambiar extensiones o límites.

La migración `004_media.sql` crea la tabla y revoca acceso a los roles HTTP de Supabase. Para migrar o restaurar, además de PostgreSQL y la clave de cifrado, copia `backend/storage/media` conservando los nombres UUID y permisos. Si cambia el dominio, actualiza las URLs de las imágenes propias guardadas en contenidos y snapshots de leads de manera explícita; no cambies las URLs remotas de Dropi.

Las pruebas usan archivos creados localmente: PNG de 2400×1200 convertido a WebP de 1600×800, límite de peso, archivo PHP disfrazado rechazado, carga multipart real, CSRF, aislamiento por usuario, preview firmada y acceso según publicación. La biblioteca también tiene comprobaciones de navegador en escritorio y móvil.

## Biblioteca por cuenta y mes

La migración `010_media_library.sql` permite subir imágenes sin una landing, conserva el nombre original como etiqueta y cambia la relación de origen a `ON DELETE SET NULL`. Reutilizar una imagen de la misma cuenta no duplica el archivo. El archivo permanece aunque se retire de una galería o se elimine su landing de origen.

`/panel/archivos` ofrece búsqueda por nombre, meses y páginas de 24 resultados. Las subidas nuevas se guardan en `backend/storage/media/{usuario}/{año}/{mes}/{uuid}.webp`, usando UTC. Los archivos anteriores continúan leyéndose desde su ubicación original; se muestran en el mes de su fecha de creación y con un nombre generado cuando no existe nombre histórico. No se mueven ni se pierden sus URLs. Copiar todo el árbol de almacenamiento durante backups o migraciones.

La API privada `GET /api/media?month=YYYY-MM&search=texto&page=1` filtra siempre por usuario autenticado. `POST /api/media` usa sesión y CSRF; `GET /api/media/{id}/download` verifica propietario y entrega la versión WebP, no el original. Los selectores de biblioteca aparecen en galería, bloques con imagen y logo del encabezado. Las fotos privadas de perfil siguen separadas, y las imágenes remotas de Dropi no se importan.

Copiar una URL no la publica: solo se sirve sin sesión si la imagen figura en el contenido de una landing publicada del propietario. Puede reutilizarse en otra landing del mismo usuario y en previews firmadas de esa cuenta. Para usar una imagen privada en otro servicio, descargarla y subirla allí. No se incluyen subidas de PDF, documentos o ejecutables.

`node tests/media-library.mjs` comprueba cargas, estructura mensual, archivos anteriores, aislamiento, descarga, reutilización entre landings, previews, publicación y navegador en la base local aislada.

El selector de biblioteca usa tarjetas clicables con borde y marca de selección. El clic aplica la imagen inmediatamente al editor; Listo o Escape solo cierran la ventana. Para galerías admite selección múltiple y un segundo clic quita la imagen. Logo e imágenes individuales permiten una selección. Los cambios se conservan al reabrir el selector y siguen necesitando guardar el borrador de la landing.

## Selección y eliminación

Mis archivos usa tarjetas compactas clicables, con marca y borde de selección, menú individual para abrir/descargar/copiar enlace y selección múltiple persistente al cambiar de página o filtro. Seleccionar página afecta solo los 24 resultados visibles. Límite de 100 archivos por operación. El diálogo de eliminación enfoca Cancelar; Escape cancela sin enviar la solicitud.

`DELETE /api/media` acepta `{ "ids": ["uuid"] }`. Requiere sesión y CSRF, valida pertenencia de todos los IDs antes de borrar y limita 30 operaciones por hora por usuario. IDs duplicados y mayúsculas se normalizan. Un ID ajeno o inexistente rechaza el lote completo con 404, sin borrar otros archivos.

La respuesta incluye `deleted` y `blocked`. Se eliminan solo archivos sin referencias; se conservan los usados en contenido guardado de landings, snapshots publicados, consultas recibidas y plantillas. El lote puede tener resultado parcial y la interfaz muestra las imágenes conservadas con su motivo. Una imagen retirada del borrador puede seguir protegida por la versión publicada. Los enlaces externos y las ediciones del constructor sin guardar no pueden detectarse.

Los archivos se apartan temporalmente en el mismo directorio privado durante la transacción; se restauran si falla y se purgan al confirmar los cambios. Una interrupción del proceso o fallo de permisos puede dejar un archivo privado con sufijo `.deleting-{uuid}` para limpieza administrativa, sin acceso público ni fila activa en biblioteca. Las transacciones de guardado de landing y de eliminación usan bloqueos de propietario para coordinar cambios concurrentes; publicar ya verifica las referencias dentro de su transacción. No hubo cambios de esquema.

`node tests/media-delete.mjs`: 28 comprobaciones de permisos, CSRF, lote mixto, borradores, snapshots publicados, consultas, plantillas, borrado físico, confirmación, cancelación, teclado y diseño responsive en archivos locales temporales. Las 107 pruebas HTTP generales también pasaron.
