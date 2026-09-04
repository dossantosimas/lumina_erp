# ADR-002 — Correo transaccional con Resend

## Estado

Aprobado por LÚMINA el 2 de septiembre de 2026.

## Decisión

Resend será el proveedor de correo para invitaciones, verificación y recuperación de contraseña de Better Auth. La integración usa HTTPS desde el servidor y nunca expone `RESEND_API_KEY` al navegador.

## Configuración

- `EMAIL_FROM`: remitente de un dominio verificado.
- `RESEND_API_KEY`: secreto distinto para preview y producción.
- En desarrollo sin credenciales, el adaptador registra únicamente metadatos y omite el contenido del correo.

## Consecuencias

- El dominio remitente debe verificarse antes de las pruebas de aceptación.
- Un envío fallido impide considerar entregada una invitación.
- La auditoría registra la creación de la invitación, pero nunca tokens ni contraseñas.
