export class InventoryRuleError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = 'InventoryRuleError';
    this.rule = rule;
  }
}

export function weightedAverageCost(
  currentQty: number,
  currentUnitCost: number,
  receivedQty: number,
  receivedUnitCost: number,
) {
  if (
    currentQty < 0 ||
    receivedQty <= 0 ||
    currentUnitCost < 0 ||
    receivedUnitCost < 0
  )
    throw new InventoryRuleError(
      'RN-INV-07',
      'Cantidades y costos inválidos para costo promedio.',
    );
  const totalQty = currentQty + receivedQty;
  return (
    Math.round(
      ((currentQty * currentUnitCost + receivedQty * receivedUnitCost) /
        totalQty) *
        100,
    ) / 100
  );
}

export function assertAvailableStock(
  onHand: number,
  reserved: number,
  requested: number,
) {
  if (requested <= 0)
    throw new InventoryRuleError(
      'RN-INV-03',
      'La cantidad solicitada debe ser positiva.',
    );
  if (onHand - reserved < requested)
    throw new InventoryRuleError('RN-INV-04', 'Stock disponible insuficiente.');
}

export function reversalQuantity(originalQuantity: number) {
  if (originalQuantity === 0)
    throw new InventoryRuleError(
      'RN-INV-02',
      'No se puede reversar un movimiento neutro.',
    );
  return -originalQuantity;
}
