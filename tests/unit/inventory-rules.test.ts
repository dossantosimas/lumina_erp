import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAvailableStock,
  InventoryRuleError,
  reversalQuantity,
  weightedAverageCost,
} from '../../modules/inventario/domain/inventory-rules.ts';

void test('RN-INV-07 calcula costo promedio ponderado', () =>
  assert.equal(weightedAverageCost(10, 1000, 5, 1600), 1200));
void test('RN-INV-04 impide sobreventa considerando reservas', () =>
  assert.throws(() => assertAvailableStock(10, 4, 7), InventoryRuleError));
void test('RN-INV-02 un reverso compensa exactamente el movimiento', () =>
  assert.equal(reversalQuantity(12.5), -12.5));
