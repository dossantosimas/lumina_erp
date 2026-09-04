import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  categories,
  permissions,
  rolePermissions,
  roles,
  systemSettings,
  units,
  warehouses,
} from '../db/schema.ts';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL es obligatoria.');
const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);

const roleSeeds = [
  ['ADMIN', 'Administrador'],
  ['PRODUCTION', 'Producción'],
  ['SALES', 'Ventas'],
  ['INVENTORY', 'Inventario'],
  ['FINANCE', 'Finanzas'],
  ['PLANNING', 'Planeación'],
] as const;
const resources = [
  'users',
  'catalog',
  'bom',
  'inventory',
  'purchases',
  'production',
  'customers',
  'orders',
  'payments',
  'expenses',
  'accounts',
  'audit',
] as const;
const actions = [
  'view',
  'create',
  'edit',
  'approve',
  'cancel',
  'adjust',
  'export',
  'simulate',
  'recalculate',
  'admin',
] as const;

const roleGrants: Record<(typeof roleSeeds)[number][0], readonly string[]> = {
  ADMIN: ['*:*'],
  PRODUCTION: [
    'catalog:view',
    'bom:view',
    'inventory:view',
    'production:view',
    'production:create',
    'production:edit',
    'production:approve',
    'production:cancel',
  ],
  SALES: [
    'catalog:view',
    'inventory:view',
    'customers:view',
    'customers:create',
    'customers:edit',
    'orders:view',
    'orders:create',
    'orders:edit',
    'orders:approve',
    'orders:cancel',
    'payments:view',
    'payments:create',
    'accounts:view',
  ],
  INVENTORY: [
    'catalog:view',
    'inventory:view',
    'inventory:create',
    'inventory:edit',
    'inventory:adjust',
    'inventory:export',
    'purchases:view',
    'purchases:create',
    'purchases:edit',
    'purchases:approve',
    'purchases:cancel',
  ],
  FINANCE: [
    'catalog:view',
    'orders:view',
    'payments:view',
    'payments:create',
    'expenses:view',
    'expenses:create',
    'expenses:edit',
    'accounts:view',
    'accounts:create',
    'accounts:edit',
    'accounts:export',
    'audit:view',
  ],
  PLANNING: [
    'catalog:view',
    'bom:view',
    'inventory:view',
    'inventory:export',
    'purchases:view',
    'production:view',
    'customers:view',
    'orders:view',
    'payments:view',
    'expenses:view',
    'accounts:view',
    'audit:view',
    'production:simulate',
    'accounts:recalculate',
  ],
};

await db.transaction(async (tx) => {
  await tx.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();
  await tx
    .insert(warehouses)
    .values({ code: 'PRINCIPAL', name: 'Almacén principal' })
    .onConflictDoNothing({ target: warehouses.code });
  await tx
    .insert(units)
    .values([
      { code: 'g', name: 'Gramo', dimension: 'MASS' },
      { code: 'kg', name: 'Kilogramo', dimension: 'MASS' },
      { code: 'ml', name: 'Mililitro', dimension: 'VOLUME' },
      { code: 'l', name: 'Litro', dimension: 'VOLUME' },
      { code: 'und', name: 'Unidad', dimension: 'COUNT' },
    ])
    .onConflictDoNothing({ target: units.code });
  await tx
    .insert(categories)
    .values({ name: 'Velas', slug: 'velas' })
    .onConflictDoNothing({ target: categories.slug });
  await tx
    .insert(roles)
    .values(roleSeeds.map(([code, name]) => ({ code, name, system: true })))
    .onConflictDoNothing({ target: roles.code });
  await tx
    .insert(permissions)
    .values(
      resources.flatMap((resource) =>
        actions.map((action) => ({ resource, action })),
      ),
    )
    .onConflictDoNothing({
      target: [permissions.resource, permissions.action],
    });
  const savedRoles = await tx
    .select({ id: roles.id, code: roles.code })
    .from(roles)
    .where(
      inArray(
        roles.code,
        roleSeeds.map(([code]) => code),
      ),
    );
  const allPermissions = await tx
    .select({
      id: permissions.id,
      resource: permissions.resource,
      action: permissions.action,
    })
    .from(permissions);
  for (const savedRole of savedRoles) {
    const grants = roleGrants[savedRole.code as keyof typeof roleGrants];
    const selected =
      savedRole.code === 'ADMIN'
        ? allPermissions
        : allPermissions.filter((permission) =>
            grants.includes(`${permission.resource}:${permission.action}`),
          );
    if (selected.length) {
      await tx
        .insert(rolePermissions)
        .values(
          selected.map((permission) => ({
            roleId: savedRole.id,
            permissionId: permission.id,
          })),
        )
        .onConflictDoNothing();
    }
  }
});
await pool.end();
console.info(
  'Semillas base aplicadas: configuración, almacén, roles y permisos.',
);
