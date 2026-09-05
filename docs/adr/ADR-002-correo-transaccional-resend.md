# ADR-002 — Correo transaccional con Gmail SMTP

## Estado

Aprobado por LÚMINA y actualizado el 5 de septiembre de 2026.

## Decisión

Gmail SMTP será el proveedor inicial para invitaciones, verificación y recuperación de contraseña de Better Auth. Se autentica exclusivamente con una contraseña de aplicación y nunca expone credenciales al navegador.

## Configuración

- `SMTP_HOST`, `SMTP_PORT` y `SMTP_SECURE`: transporte TLS de Gmail.
- `SMTP_USER`: cuenta remitente de LÚMINA.
- `SMTP_APP_PASSWORD`: secreto distinto de la contraseña personal.
- `EMAIL_FROM`: nombre y dirección visibles para el destinatario.
- En cualquier entorno sin credenciales, el envío falla de forma explícita.

## Consecuencias

- Gmail debe tener verificación en dos pasos y contraseña de aplicación.
- Un envío fallido impide considerar entregada una invitación.
- La invitación conserva estado, fecha de intento e identificador SMTP, pero nunca tokens ni contraseñas.
