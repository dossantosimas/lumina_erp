# ADR-001 — Plataforma y persistencia de la primera entrega

## Estado

Reemplazado por la decisión productiva del 2 de septiembre de 2026.

## Contexto

El Prompt Maestro exige PostgreSQL, pero `LUMINA_OS_PROMPT_BLUEPRINT_ERP.md` no es el Blueprint terminado: es un prompt para generarlo. No existen todavía el ERD definitivo ni las historias HU-011/HU-012 completas.

## Decisión

Se migra el monolito modular a Next.js App Router en Vercel, Neon PostgreSQL, Drizzle ORM y Better Auth. El despliegue de Sites/D1 permanece únicamente como referencia visual hasta el corte productivo y no recibe nuevas funciones.

## Consecuencias

- El código productivo ya no depende de Vinext, Cloudflare Workers ni D1.
- Los secretos se separan por entorno de Vercel.
- PostgreSQL es la única fuente de verdad y las operaciones irreversibles se representan con reversos.
- El Blueprint autoritativo vive en `docs/blueprint/LUMINA_OS_ERP_MASTER_BLUEPRINT.md`.
