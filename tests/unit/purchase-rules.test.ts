import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCanApprove,
  assertCanSubmit,
  assertReceivable,
} from '../../modules/compras/domain/purchase-rules.ts';

void test('RN-COM-01 exige borrador con líneas para solicitar aprobación', () => {
  assert.doesNotThrow(() => assertCanSubmit('DRAFT', 1));
  assert.throws(() => assertCanSubmit('DRAFT', 0), /al menos una línea/);
});

void test('RN-COM-02 sólo permite aprobar órdenes pendientes', () => {
  assert.doesNotThrow(() => assertCanApprove('PENDING_APPROVAL'));
  assert.throws(() => assertCanApprove('DRAFT'), /pendiente/);
});

void test('RN-COM-03 impide sobre-recepción', () => {
  assert.doesNotThrow(() => assertReceivable('PARTIAL', 10, 4, 6));
  assert.throws(() => assertReceivable('APPROVED', 10, 4, 7), /supera/);
});
