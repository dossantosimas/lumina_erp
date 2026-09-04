import 'server-only';
import { asc, desc, eq, isNull, sql, sum } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  expenses,
  financialAccounts,
  financialMovements,
  payments,
  salesOrders,
} from '@/db/schema';

export async function getFinanceSnapshot() {
  const db = getDb();
  const [accountRows, movementRows, expenseRows, sales, costs, paid, spent] =
    await Promise.all([
      db
        .select({
          id: financialAccounts.id,
          code: financialAccounts.code,
          name: financialAccounts.name,
          type: financialAccounts.type,
          currency: financialAccounts.currency,
          openingBalance: financialAccounts.openingBalance,
          movementTotal: sql<string>`coalesce(sum(${financialMovements.amount}), 0)`,
          balance: sql<string>`${financialAccounts.openingBalance} + coalesce(sum(${financialMovements.amount}), 0)`,
          status: financialAccounts.status,
        })
        .from(financialAccounts)
        .leftJoin(
          financialMovements,
          eq(financialMovements.accountId, financialAccounts.id),
        )
        .groupBy(financialAccounts.id)
        .orderBy(asc(financialAccounts.name)),
      db
        .select({
          id: financialMovements.id,
          account: financialAccounts.name,
          type: financialMovements.type,
          amount: financialMovements.amount,
          category: financialMovements.category,
          description: financialMovements.description,
          sourceType: financialMovements.sourceType,
          reversalOfId: financialMovements.reversalOfId,
          occurredAt: financialMovements.occurredAt,
        })
        .from(financialMovements)
        .innerJoin(
          financialAccounts,
          eq(financialMovements.accountId, financialAccounts.id),
        )
        .orderBy(desc(financialMovements.occurredAt))
        .limit(100),
      db
        .select({
          id: expenses.id,
          reference: expenses.reference,
          account: financialAccounts.name,
          category: expenses.category,
          description: expenses.description,
          amount: expenses.amount,
          occurredAt: expenses.occurredAt,
          reversedAt: expenses.reversedAt,
        })
        .from(expenses)
        .innerJoin(
          financialAccounts,
          eq(expenses.accountId, financialAccounts.id),
        )
        .orderBy(desc(expenses.occurredAt))
        .limit(50),
      db
        .select({ value: sum(salesOrders.total) })
        .from(salesOrders)
        .where(eq(salesOrders.status, 'COMPLETED')),
      db
        .select({ value: sum(salesOrders.costOfGoods) })
        .from(salesOrders)
        .where(eq(salesOrders.status, 'COMPLETED')),
      db
        .select({ value: sum(payments.amount) })
        .from(payments)
        .where(isNull(payments.reversedAt)),
      db
        .select({ value: sum(expenses.amount) })
        .from(expenses)
        .where(isNull(expenses.reversedAt)),
    ]);
  const salesTotal = Number(sales[0]?.value ?? 0);
  const costOfGoods = Number(costs[0]?.value ?? 0);
  const expenseTotal = Number(spent[0]?.value ?? 0);
  return {
    accounts: accountRows,
    movements: movementRows,
    expenses: expenseRows,
    metrics: {
      cash: accountRows.reduce(
        (total, account) => total + Number(account.balance),
        0,
      ),
      collected: Number(paid[0]?.value ?? 0),
      sales: salesTotal,
      costOfGoods,
      expenses: expenseTotal,
      grossMargin: salesTotal - costOfGoods,
      operatingResult: salesTotal - costOfGoods - expenseTotal,
    },
  };
}
