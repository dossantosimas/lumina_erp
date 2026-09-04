import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateInitialImport } from '../modules/sistema/domain/initial-import-validation.ts';

void test('la plantilla oficial se puede leer y bloquea registros pendientes', async () => {
  const buffer = await readFile(
    new URL(
      '../public/plantillas/LUMINA_OS_Plantillas_Importacion.xlsx',
      import.meta.url,
    ),
  );
  const result = await validateInitialImport(buffer);
  assert.equal(result.summary.length, 11);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes('PENDIENTE')));
});
