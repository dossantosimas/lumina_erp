import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCompletionSet,
  canStartProduction,
  nextBomVersion,
  theoreticalConsumption,
  type BomVersion,
} from '../../modules/produccion/domain/bom-rules.ts';

void test('RN-BOM-01/RN-BOM-02 editar crea una versión nueva sin mutar la vigente', () => {
  const active: BomVersion = {
    version: 2,
    status: 'ACTIVE',
    lines: [{ materialId: 'wax', quantity: 180, unit: 'g' }],
  };
  const next = nextBomVersion(active, [
    { materialId: 'wax', quantity: 185, unit: 'g' },
  ]);
  assert.equal(active.version, 2);
  assert.equal(active.lines[0]?.quantity, 180);
  assert.equal(next.version, 3);
  assert.equal(next.status, 'DRAFT');
});
void test('RN-BOM-04 rechaza una versión sin componentes', () => {
  assert.throws(
    () =>
      nextBomVersion(
        {
          version: 1,
          status: 'ACTIVE',
          lines: [{ materialId: 'wax', quantity: 1, unit: 'g' }],
        },
        [],
      ),
    /RN-BOM-04/,
  );
});
void test('RN-PRO-01 bloquea producción sin BOM vigente', () =>
  assert.equal(
    canStartProduction(
      {
        version: 1,
        status: 'DRAFT',
        lines: [{ materialId: 'wax', quantity: 180, unit: 'g' }],
      },
      new Date(),
    ),
    false,
  ));

void test('RN-PRO-02 escala el consumo teórico por rendimiento y merma', () => {
  assert.equal(theoreticalConsumption(180, 1, 10, 2), 1836);
});

void test('RN-PRO-03 exige todos los componentes del snapshot una sola vez', () => {
  assert.doesNotThrow(() =>
    assertCompletionSet(
      ['wax', 'wick'],
      [
        { materialId: 'wick', quantity: 10 },
        { materialId: 'wax', quantity: 1800 },
      ],
    ),
  );
  assert.throws(
    () =>
      assertCompletionSet(
        ['wax', 'wick'],
        [{ materialId: 'wax', quantity: 1800 }],
      ),
    /RN-PRO-03/,
  );
});
