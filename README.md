# LÚMINA OS ERP

ERP interno de LÚMINA Candle Studio, construido como monolito modular con Next.js App Router, Neon PostgreSQL, Drizzle ORM y Better Auth.

## Estado de la implementación

- Blueprint autoritativo y TOP 20: `docs/blueprint/LUMINA_OS_ERP_MASTER_BLUEPRINT.md`.
- Plantillas de importación verificadas: `outputs/01a064b1-64b4-7820-91dc-69c34005c144/`.
- Modelo PostgreSQL de 41 tablas y migraciones Drizzle generado.
- Better Auth con correo/contraseña, verificación, recuperación, rate limiting persistente y registro público deshabilitado.
- RBAC multirol aplicado en servidor y dashboard, con gestión administrativa de invitaciones y auditoría.
- Módulos operativos de catálogo/BOM, inventario, compras, producción, ventas y finanzas.
- Dashboard sin cifras demostrativas: ventas, caja, margen, operaciones abiertas, alertas y actividad según permisos.
- Carga inicial con descarga de plantilla y validación `.xlsx` sin escritura en PostgreSQL.
- Reglas unitarias de BOM inmutable, disponibilidad, reversos, costo promedio y validación de plantilla.
- Endpoint de salud: `GET /api/v1/health`.

La confirmación masiva de la carga inicial permanece cerrada hasta completar los datos reales y aprobar tres BOM, tal como exige el gate del Blueprint. La operación local puede probarse con PostgreSQL en Docker antes de migrar a Neon.

## Configuración local

1. Copiar `.env.example` a `.env.local` y completar los secretos.
2. Conectar PostgreSQL local (Docker) o una rama Neon separada para desarrollo.
3. Ejecutar `pnpm db:migrate`.
4. Crear el primer usuario administrador durante la ceremonia de bootstrap y confirmar que el registro público siga deshabilitado.
5. Ejecutar `pnpm dev`.

## Comandos

```bash
pnpm dev
pnpm db:generate
pnpm db:migrate
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm test:integration` usa la conexión de `.env.migrations.local`; sus escrituras se ejecutan dentro de transacciones con `ROLLBACK`, por lo que no deja datos de prueba.

En la aplicación, `/carga-inicial` permite descargar y validar la plantilla y `/usuarios` administra invitaciones, roles y auditoría.

## Despliegue

Vercel necesita, por entorno, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_APP_PASSWORD` y `EMAIL_FROM`. Gmail requiere verificación en dos pasos y una contraseña de aplicación; nunca debe usarse la contraseña normal de la cuenta. El sitio anterior de Sites/D1 no se modifica y queda como referencia visual hasta el corte productivo.
