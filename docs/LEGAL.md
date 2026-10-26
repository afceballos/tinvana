# Política de privacidad y términos y condiciones

Páginas públicas del dominio principal, generadas en el servidor por `backend/src/LegalPages.php` (sin sesión, sin JavaScript, caché pública de una hora):

- `/privacidad`: política de privacidad y tratamiento de datos (Ley 1581 de 2012, Decreto 1074 de 2015). Explica el doble papel de Tinvana (responsable de los datos de las tiendas, encargado de los datos de los clientes de cada tienda), los datos tratados, finalidades, terceros (Dropi, Meta/WhatsApp, OpenAI/Anthropic, webhooks/CRM, infraestructura), transferencias internacionales, derechos, plazos de consultas (10 + 5 días hábiles) y reclamos (15 + 8), eliminación de datos, conservación, seguridad, cookies y menores.
- `/terminos`: términos y condiciones de uso (servicio, cuenta, planes, responsabilidades de la tienda incluida la Ley 1480 de 2011, usos prohibidos, terceros, inteligencia artificial, propiedad intelectual, disponibilidad, responsabilidad, terminación, ley colombiana).

Ambas sirven como URL de política de privacidad, términos y eliminación de datos (`/privacidad#eliminacion`) en la app de Meta.

## Datos del responsable (`.env`, sin valores en el repositorio)

| Variable | Uso |
|---|---|
| `LEGAL_NAME` | Nombre o razón social. Si falta se muestra «Tinvana». |
| `LEGAL_ID` | NIT o documento. Si falta no se muestra. |
| `LEGAL_ADDRESS` | Domicilio. Si falta no se muestra. |
| `LEGAL_EMAIL` | Correo para solicitudes de datos. Si falta se usa `MAIL_FROM_ADDRESS`; conviene un buzón que se lea, no uno «no-reply». |

La fecha de actualización está en `LegalPages::UPDATED`; cámbiala al modificar el texto.

Los enlaces aparecen al pie de las pantallas de acceso (inicio de sesión, registro, recuperación) y el registro indica que crear la cuenta implica aceptar ambos documentos.

**Importante:** el texto es una base razonable redactada para Colombia, no asesoría legal; debe revisarlo un abogado antes de considerarlo definitivo.

## Comprobaciones

`node tests/legal-pages.mjs` (servidor local de pruebas): 17 comprobaciones de respuesta HTML sin sesión ni scripts, temas obligatorios, ausencia de marcadores, rechazo de POST, índice navegable en claro y oscuro, ajuste a móvil y enlaces desde inicio de sesión y registro.
