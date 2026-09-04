# Runbook — Vercel, Neon y corte productivo

## 1. Entornos

Crear proyectos/bases separados para local, preview y producción. Nunca copiar el secreto de Better Auth entre entornos. Configurar la URL canónica exacta en `BETTER_AUTH_URL` y `NEXT_PUBLIC_APP_URL`.

## 2. Base de datos

1. Crear la base Neon y copiar la cadena pooled con SSL a `DATABASE_URL`.
2. Ejecutar `pnpm db:migrate` contra el entorno objetivo.
3. Confirmar `GET /api/v1/health` con estado `ok`.
4. Registrar y probar un procedimiento de restauración antes del corte.

## 3. Acceso inicial

Crear un único administrador de bootstrap con Better Auth, verificar su correo y asignarle el rol funcional `ADMIN`. Confirmar que el registro público devuelve rechazo. Las demás cuentas se crean mediante invitación administrativa y reciben un enlace para definir contraseña.

## 4. Datos iniciales

Completar y aprobar el workbook de importación. Validarlo desde `/carga-inicial`; la validación es de solo lectura y todo registro `PENDIENTE`, hoja ausente o referencia inválida bloquea el avance. Validar Vela Estándar 200g y dos BOM reales adicionales. Después, cargar catálogo, BOM, conteo físico, cuentas y saldos en preview.

## 5. Aceptación y corte

Ejecutar los recorridos compra–recepción, producción–consumo–lote, pedido–reserva–entrega–pago y reversos con un usuario de cada área. Al aprobar: fijar fecha/hora de corte, congelar registros paralelos, cargar saldos verificados, desplegar producción y conservar Sites en modo consulta.

## 6. Retroceso

Si falla una prueba crítica, impedir nuevas operaciones, conservar los movimientos ya confirmados, volver el dominio de producción al despliegue estable anterior y restaurar Neon sólo desde un punto verificado. Nunca borrar movimientos para “corregir” saldos.
