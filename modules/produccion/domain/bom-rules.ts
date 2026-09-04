export type BomLine = Readonly<{
  materialId: string;
  quantity: number;
  unit: string;
}>;
export type BomVersion = Readonly<{
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED';
  lines: readonly BomLine[];
}>;

export function nextBomVersion(
  current: BomVersion,
  replacementLines: readonly BomLine[],
): BomVersion {
  if (replacementLines.length === 0)
    throw new Error('RN-BOM-04: una BOM debe contener al menos una línea.');
  if (replacementLines.some((line) => line.quantity <= 0))
    throw new Error('RN-BOM-04: todas las cantidades deben ser positivas.');
  return Object.freeze({
    version: current.version + 1,
    status: 'DRAFT' as const,
    lines: Object.freeze(
      replacementLines.map((line) => Object.freeze({ ...line })),
    ),
  });
}

export function canStartProduction(
  bom: BomVersion,
  at: Date,
  validFrom?: Date,
  validTo?: Date,
) {
  return (
    bom.status === 'ACTIVE' &&
    (!validFrom || validFrom <= at) &&
    (!validTo || validTo >= at)
  );
}

export function theoreticalConsumption(
  bomQuantity: number,
  expectedYield: number,
  plannedQuantity: number,
  wastePct: number,
) {
  if (bomQuantity <= 0 || expectedYield <= 0 || plannedQuantity <= 0)
    throw new Error('RN-PRO-02: cantidades de producción inválidas.');
  return (bomQuantity * plannedQuantity * (1 + wastePct / 100)) / expectedYield;
}

export function assertCompletionSet(
  expectedMaterialIds: readonly string[],
  actual: readonly { materialId: string; quantity: number }[],
) {
  const actualIds = new Set(actual.map((line) => line.materialId));
  if (
    actual.some((line) => line.quantity <= 0) ||
    actualIds.size !== actual.length ||
    actualIds.size !== expectedMaterialIds.length ||
    expectedMaterialIds.some((id) => !actualIds.has(id))
  )
    throw new Error(
      'RN-PRO-03: el consumo real debe incluir exactamente los componentes del snapshot.',
    );
}
