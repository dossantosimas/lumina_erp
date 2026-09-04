export class SalesRuleError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = 'SalesRuleError';
    this.rule = rule;
  }
}

export function assertReservable(
  onHand: number,
  reserved: number,
  requested: number,
) {
  if (requested <= 0 || onHand - reserved < requested)
    throw new SalesRuleError(
      'RN-VEN-01',
      'Stock disponible insuficiente para reservar.',
    );
}

export function assertDeliverable(
  status: string,
  reservationQuantity: number,
  orderedQuantity: number,
) {
  if (status !== 'APPROVED' || reservationQuantity !== orderedQuantity)
    throw new SalesRuleError(
      'RN-VEN-02',
      'El pedido no tiene una reserva completa confirmada.',
    );
}

export function assertPaymentAmount(
  orderTotal: number,
  alreadyPaid: number,
  amount: number,
) {
  if (amount <= 0 || alreadyPaid + amount > orderTotal)
    throw new SalesRuleError(
      'RN-FIN-01',
      'El pago supera el saldo pendiente del pedido.',
    );
}
