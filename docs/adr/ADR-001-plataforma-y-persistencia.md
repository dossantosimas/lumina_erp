# ADR-001 — Plataforma y persistencia de la primera entrega

## Estado

Aceptado para el prototipo funcional; pendiente de ratificación para producción.

## Contexto

El Prompt Maestro exige PostgreSQL, pero `LUMINA_OS_PROMPT_BLUEPRINT_ERP.md` no es el Blueprint terminado: es un prompt para generarlo. No existen todavía el ERD definitivo ni las historias HU-011/HU-012 completas.

## Decisión

Se conserva el monolito modular y se implementa la primera entrega en React/TypeScript con autenticación de plataforma y esquema relacional portable mediante Drizzle. La vista alojada usa D1/SQLite porque Sites no admite conexiones TCP directas a PostgreSQL. Ninguna operación transacciva de inventario, producción, compras, ventas o finanzas se persiste aún.

La migración a PostgreSQL será obligatoria antes del ERP productivo, una vez entregado el Blueprint autoritativo.

## Consecuencias

- La interfaz y el dominio RBAC pueden validarse desde ahora.
- El modelo separa usuario físico, rol y permiso.
- No se inventan reglas centrales ni efectos contables.
- El esquema deberá traducirse a PostgreSQL y ampliarse con el ERD definitivo.
