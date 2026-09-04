import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { permissions, rolePermissions, roles, userRoles } from '@/db/schema';

export type DashboardAccess = {
  catalog: boolean;
  inventory: boolean;
  production: boolean;
  sales: boolean;
  purchases: boolean;
  finance: boolean;
  users: boolean;
  audit: boolean;
  initialLoad: boolean;
};

export async function getDashboardAccess(
  userId: string,
): Promise<DashboardAccess> {
  const grants = await getDb()
    .select({
      role: roles.code,
      resource: permissions.resource,
      action: permissions.action,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, userId));
  const admin = grants.some((grant) => grant.role === 'ADMIN');
  const can = (resource: string, action = 'view') =>
    admin ||
    grants.some(
      (grant) => grant.resource === resource && grant.action === action,
    );
  return {
    catalog: can('catalog'),
    inventory: can('inventory'),
    production: can('production'),
    sales: can('orders'),
    purchases: can('purchases'),
    finance: can('accounts'),
    users: can('users'),
    audit: can('audit'),
    initialLoad: can('users', 'admin'),
  };
}
