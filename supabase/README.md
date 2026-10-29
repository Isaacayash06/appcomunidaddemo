# supabase/ — backend de referencia

Esquema (`migrations/`, `sql/`) y funciones edge (`functions/`) que usa la app.
Vienen de la app de Jabad Barcelona y **todavía no están parametrizadas por comunidad**
(fase 7 del plan). La demo no los necesita: funciona sin backend.

## Antes de usar esto con una comunidad real

1. Crear un proyecto Supabase **nuevo** para esa comunidad (no compartir datos entre comunidades).
2. Ejecutar `sql/supabase_setup_completo.sql` y después `migrations/` en orden.
3. En `migrations/20261016100000_notificaciones_automaticas.sql`, cambiar
   `https://TU-PROYECTO.supabase.co` por la URL del proyecto (si no, las notificaciones no llegan a ningún sitio).
4. Rellenar `integrations.*` en `community/<slug>.json`.
5. Secretos de las funciones (`supabase secrets set`):
   `OFFICE_EMAIL`, `EMAIL_FROM_CITAS`, `COMUNIDAD_DIRECCION`, `MIKVE_NOTIFY_EMAIL`,
   `NOTIF_PRUEBA_EMAILS`, `APNS_BUNDLE_ID`, más las claves de Resend, Stripe, FCM/APNs.

## Pendiente de parametrizar (textos de Jabad Barcelona dentro de las funciones)

No desplegar estas funciones tal cual en otra comunidad: llevan nombre, remitente, dominio y
dirección de Jabad Barcelona dentro de las plantillas de correo y de los avisos.

| Función | Qué hay que cambiar |
|---|---|
| `send-registration-email`, `notify-approval`, `notify-info-request` | nombre, remitente, dominio, contacto en el HTML del correo |
| `notify-mikve` | remitente y textos |
| `stripe-webhook` | remitente y enlace del pie |
| `notif-cron` | textos de felicitación; hora y calendario usan Barcelona (`_shared/tiempo.ts`, zona `Europe/Madrid`) |
| `notif-instant` | textos de ejemplo de los avisos |
| `send-push`, `_shared/push.ts` | `APNS_BUNDLE_ID` ya sale de variable de entorno; el valor por defecto es el de Jabad |

La idea para la fase 7: un único `_shared/comunidad.ts` que lea nombre, remitente, dominio,
zona horaria y ubicación de variables de entorno, y que todas las funciones usen.
