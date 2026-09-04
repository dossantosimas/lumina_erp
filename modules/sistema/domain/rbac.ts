export const ACTIONS = [
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
export type Action = (typeof ACTIONS)[number];
export type Permission = `${string}:${Action}`;
export const ROLE_CODES = [
  'ADMIN',
  'PRODUCTION',
  'SALES',
  'INVENTORY',
  'FINANCE',
  'PLANNING',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
export type RoleGrant = Readonly<{
  role: RoleCode;
  permissions: ReadonlySet<Permission>;
}>;

export function can(
  grants: readonly RoleGrant[],
  resource: string,
  action: Action,
): boolean {
  return grants.some(
    ({ role, permissions }) =>
      role === 'ADMIN' || permissions.has(`${resource}:${action}`),
  );
}

export function requirePermission(
  grants: readonly RoleGrant[],
  resource: string,
  action: Action,
): void {
  if (!can(grants, resource, action))
    throw new AuthorizationError(resource, action);
}

export class AuthorizationError extends Error {
  readonly code = 'RBAC_PERMISSION_DENIED';
  readonly resource: string;
  readonly action: Action;
  constructor(resource: string, action: Action) {
    super(`Permiso denegado: ${resource}:${action}`);
    this.name = 'AuthorizationError';
    this.resource = resource;
    this.action = action;
  }
}
