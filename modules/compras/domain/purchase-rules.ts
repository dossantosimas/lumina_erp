export class PurchaseRuleError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = 'PurchaseRuleError';
    this.rule = rule;
  }
}

export function assertCanSubmit(status: string, lineCount: number) {
  if (status !== 'DRAFT')
    throw new PurchaseRuleError(
      'RN-COM-01',
      'Sólo una orden borrador puede enviarse a aprobación.',
    );
  if (lineCount === 0)
    throw new PurchaseRuleError(
      'RN-COM-01',
      'La orden requiere al menos una línea.',
    );
}

export function assertCanApprove(status: string) {
  if (status !== 'PENDING_APPROVAL')
    throw new PurchaseRuleError(
      'RN-COM-02',
      'Sólo una orden pendiente puede aprobarse.',
    );
}

export function assertReceivable(
  status: string,
  ordered: number,
  received: number,
  requested: number,
) {
  if (!['APPROVED', 'PARTIAL'].includes(status))
    throw new PurchaseRuleError(
      'RN-COM-03',
      'La orden no está habilitada para recepción.',
    );
  if (requested <= 0 || received + requested > ordered)
    throw new PurchaseRuleError(
      'RN-COM-03',
      'La recepción supera la cantidad pendiente.',
    );
}
