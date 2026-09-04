import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountBalance,
  grossMargin,
  reverseAmount,
} from '../../modules/finanzas/domain/financial-rules.ts';

void test('RN-FIN-03 un reverso compensa exactamente el movimiento', () =>
  assert.equal(reverseAmount(-25000), 25000));
void test('RN-FIN-04 margen porcentual es nulo sin ventas', () => {
  assert.deepEqual(grossMargin(0, 0), { amount: 0, percentage: null });
  assert.deepEqual(grossMargin(100000, 60000), {
    amount: 40000,
    percentage: 40,
  });
});
void test('RN-FIN-05 caja suma apertura y movimientos confirmados', () =>
  assert.equal(accountBalance(100000, [50000, -20000, 3000]), 133000));
