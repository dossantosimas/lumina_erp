import 'server-only';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/db';
import { permissions, rolePermissions, roles, userRoles } from '@/db/schema';
import type { Action } from '@/modules/sistema/domain/rbac';

export class AccessError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN',
  ) {
    super(code);
  }
}

export async function authorize(
  headers: Headers,
  resource: string,
  action: Action,
) {
  const current = await auth.api.getSession({ headers });
  if (!current) throw new AccessError(401, 'UNAUTHENTICATED');
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
    .where(eq(userRoles.userId, current.user.id));
  const allowed = grants.some(
    (grant) =>
      grant.role === 'ADMIN' ||
      (grant.resource === resource && grant.action === action),
  );
  if (!allowed) throw new AccessError(403, 'FORBIDDEN');
  return {
    id: current.user.id,
    name: current.user.name,
    email: current.user.email,
  };
}

export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessError)
    return Response.json({ error: error.code }, { status: error.status });
  return null;
}
