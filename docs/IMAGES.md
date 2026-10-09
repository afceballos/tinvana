# Imágenes de las landings

El editor permite subir JPEG, PNG o WebP. PHP comprueba el contenido real, rechaza SVG/GIF y archivos que no sean imágenes, decodifica y vuelve a generar un WebP sin copiar metadatos ni el archivo original. Las URLs de Dropi continúan siendo remotas: no se descarga todo el catálogo. Espacios y caracteres Unicode de sus nombres se codifican sin duplicar escapes existentes.

Límites: 8 MB de entrada por archivo, 16 megapíxeles y 8000 px por lado para limitar la memoria. Salida con lado máximo de 1600 px, calidad inicial 82 y máximo 400 KB. Si hace falta, reduce calidad y dimensiones hasta cumplir el peso. Máximo 30 imágenes en la galería y 60 archivos subidos por landing. La primera imagen de la lista es la principal. Después de subir o quitar una imagen, guarda la landing. Quitar de la galería no borra el archivo del almacenamiento.

Los archivos tienen nombres UUID, se guardan fuera del directorio público en `backend/storage/media` y sus datos en `media_assets`. La API de carga requiere sesión, CSRF y propiedad de la landing. `/media/{uuid}.webp` permite acceso al propietario, a una preview firmada vigente o al público cuando el archivo figura en la galería de una landing publicada. Al despublicar se vuelve a comprobar autorización; la caché pública de imágenes tiene un máximo de cinco minutos.

## Hosting y migración

Instala GD con soporte JPEG, PNG y WebP. El comando `check` lo comprueba. Configura PHP:

```ini
upload_max_filesize=8M
post_max_size=9M
memory_limit=256M
```

En Nginx configura `client_max_body_size 9m;`. Revisa también los límites de tu hosting/proxy. PHP necesita escritura en `backend/storage/media`; no la expongas como carpeta estática. Las rutas `/media/` deben resolverse mediante el controlador PHP igual que `/p/`. Reinicia PHP después de cambiar extensiones o límites.

La migración `004_media.sql` crea la tabla y revoca acceso a los roles HTTP de Supabase. Para migrar o restaurar, además de PostgreSQL y la clave de cifrado, copia `backend/storage/media` conservando los nombres UUID y permisos. Si cambia el dominio, actualiza las URLs de las imágenes propias guardadas en contenidos y snapshots de leads de manera explícita; no cambies las URLs remotas de Dropi.

Las pruebas usan archivos creados localmente: PNG de 2400×1200 convertido a WebP de 1600×800, límite de peso, archivo PHP disfrazado rechazado, carga multipart real, CSRF, aislamiento por usuario, preview firmada y acceso según publicación. No se realizó una revisión visual en navegador.
