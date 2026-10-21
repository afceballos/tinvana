# Lista de productos en las landings

En el constructor, usa **Agregar sección → Lista de productos**. Selecciona hasta 20 productos de tu cuenta y ordénalos con las flechas. Puedes cambiar el título, subtítulo, diseño en cuadrícula o compacto, fondo y espaciado; también ocultar, duplicar o mover la sección como cualquier otra.

Cada tarjeta muestra imagen, título y hasta 180 caracteres de descripción, sin HTML. Si tiene una landing publicada, usa su contenido comercial publicado y enlaza a esa página. En otro caso usa el nombre, descripción e imagen de la copia de Dropi guardada al seleccionar el producto, sin enlace. Los cambios comerciales todavía en borrador no aparecen en las tarjetas públicas. No se muestran precios de Dropi, proveedores, stock ni datos internos.

La lista conserva los productos elegidos y su orden; no añade automáticamente nuevas selecciones de Dropi. Los productos eliminados de la cuenta dejan de renderizarse. Los cambios publicados en las landings enlazadas aparecen al recargar la página. Si se despublica una de ellas, su tarjeta vuelve al contenido de Dropi sin enlace.

Guarda el borrador y publica los cambios para mostrar la sección al público. Una sección visible sin productos impide publicar. Al guardar una plantilla reutilizable, la selección se vacía para elegir productos en la siguiente landing.

La API valida la propiedad de todos los productos al guardar, previsualizar y publicar. El renderizador consulta solo productos del propietario de la landing y entrega únicamente los campos públicos de la tarjeta. No requiere importar el catálogo completo ni una migración de base de datos.

Validación realizada: compilación TypeScript/Vite; 8 comprobaciones unitarias del bloque y sus resúmenes; suite de 105 comprobaciones HTTP con PHP y PostgreSQL locales, incluyendo permisos entre cuentas y separación entre contenido publicado y borrador; prueba del constructor en navegador para selección, orden, guardado y recarga, publicación y tarjetas responsive. También pasaron las 69 pruebas PHP existentes y las 15 del encabezado. Los datos y las imágenes de prueba son fixtures aislados; no se enviaron solicitudes a Dropi ni leads al CRM para esta modificación.
