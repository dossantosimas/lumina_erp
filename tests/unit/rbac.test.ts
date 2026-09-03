import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorizationError, can, requirePermission, type RoleGrant } from '../../modules/sistema/domain/rbac.ts';

void test('HU-011: un usuario físico puede combinar varios roles funcionales', () => {
  const grants: RoleGrant[] = [{ role: 'SALES', permissions: new Set(['orders:create']) }, { role: 'FINANCE', permissions: new Set(['payments:view']) }];
  assert.equal(can(grants, 'orders', 'create'), true); assert.equal(can(grants, 'payments', 'view'), true);
});
void test('HU-012: administrador tiene control total', () => { assert.equal(can([{ role: 'ADMIN', permissions: new Set() }], 'audit', 'export'), true); });
void test('HU-012: una acción no concedida se rechaza', () => {
  const grants: RoleGrant[] = [{ role: 'PRODUCTION', permissions: new Set(['production:view']) }];
  assert.throws(() => requirePermission(grants, 'payments', 'approve'), AuthorizationError);
});
