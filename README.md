# LÚMINA OS

Primera entrega funcional del ERP de LÚMINA Candle Studio.

## Alcance actual

- Dashboard operativo responsive con navegación por módulos.
- Identidad mediante sesión de ChatGPT/Sites, con modo demostración local.
- Modelo RBAC que separa usuarios físicos, roles funcionales y permisos.
- Auditoría preparada a nivel de esquema.
- Bus interno de eventos para el monolito modular.
- Registro rápido con confirmación humana explícita.

Los datos del dashboard son demostrativos. No se habilitan escrituras transaccivas de inventario, dinero o producción porque el documento disponible como Blueprint es un prompt y no contiene el ERD ni las reglas finales.

## Desarrollo

```bash
pnpm dev
pnpm test
pnpm build
```
