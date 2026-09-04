export function reverseAmount(amount: number) {
  if (amount === 0)
    throw new Error('RN-FIN-03: no se reversa un movimiento neutro.');
  return -amount;
}

export function grossMargin(sales: number, costOfGoods: number) {
  const amount = sales - costOfGoods;
  return { amount, percentage: sales === 0 ? null : (amount / sales) * 100 };
}

export function accountBalance(
  openingBalance: number,
  movements: readonly number[],
) {
  return movements.reduce((total, amount) => total + amount, openingBalance);
}
