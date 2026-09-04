import { and, desc, eq, isNull, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  financialAccounts,
  financialMovements,
  idempotencyKeys,
  outboxEvents,
  payments,
  salesOrders,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const input = z.object({
  reference: z.string().trim().min(2).max(80),
  salesOrderId: z.uuid(),
  accountId: z.uuid(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'TRANSFER', 'CARD', 'OTHER']),
  occurredAt: z.iso.datetime().optional(),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'payments', 'view');
    const data = await getDb()
      .select({
        id: payments.id,
        reference: payments.reference,
        salesOrderId: payments.salesOrderId,
        account: financialAccounts.name,
        amount: payments.amount,
        method: payments.method,
        occurredAt: payments.occurredAt,
        reversedAt: payments.reversedAt,
      })
      .from(payments)
      .innerJoin(
        financialAccounts,
        eq(payments.accountId, financialAccounts.id),
      )
      .orderBy(desc(payments.occurredAt));
    return Response.json({ data });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'payments', 'create');
    await authorize(request.headers, 'accounts', 'view');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const paymentId = crypto.randomUUID();
    const movementId = crypto.randomUUID();
    const occurredAt = parsed.data.occurredAt
      ? new Date(parsed.data.occurredAt)
      : new Date();
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'payments.create');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`payment:${parsed.data.salesOrderId}`}))`,
      );
      const [order] = await tx
        .select({
          number: salesOrders.number,
          status: salesOrders.status,
          total: salesOrders.total,
        })
        .from(salesOrders)
        .where(eq(salesOrders.id, parsed.data.salesOrderId))
        .limit(1);
      if (!order) throw new ApiInputError('SALES_ORDER_NOT_FOUND', 404);
      if (!['APPROVED', 'COMPLETED'].includes(order.status))
        throw new ApiInputError('SALES_ORDER_NOT_PAYABLE', 409);
      const [account] = await tx
        .select({
          status: financialAccounts.status,
          currency: financialAccounts.currency,
        })
        .from(financialAccounts)
        .where(eq(financialAccounts.id, parsed.data.accountId))
        .limit(1);
      if (!account) throw new ApiInputError('FINANCIAL_ACCOUNT_NOT_FOUND', 404);
      if (account.status !== 'ACTIVE' || account.currency !== 'COP')
        throw new ApiInputError('FINANCIAL_ACCOUNT_NOT_AVAILABLE', 409);
      const [paid] = await tx
        .select({ total: sum(payments.amount) })
        .from(payments)
        .where(
          and(
            eq(payments.salesOrderId, parsed.data.salesOrderId),
            isNull(payments.reversedAt),
          ),
        );
      if (Number(paid?.total ?? 0) + parsed.data.amount > Number(order.total))
        throw new ApiInputError('PAYMENT_EXCEEDS_BALANCE', 409, {
          balance: Number(order.total) - Number(paid?.total ?? 0),
        });
      await tx.insert(financialMovements).values({
        id: movementId,
        accountId: parsed.data.accountId,
        type: 'INCOME',
        amount: parsed.data.amount.toFixed(2),
        category: 'SALES',
        description: `Pago ${parsed.data.reference} · pedido ${order.number}`,
        sourceType: 'PAYMENT',
        sourceId: paymentId,
        occurredAt,
        createdBy: actor.id,
      });
      await tx.insert(payments).values({
        id: paymentId,
        reference: parsed.data.reference,
        salesOrderId: parsed.data.salesOrderId,
        accountId: parsed.data.accountId,
        amount: parsed.data.amount.toFixed(2),
        method: parsed.data.method,
        financialMovementId: movementId,
        occurredAt,
        createdBy: actor.id,
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PAYMENT_RECEIVED',
        entityType: 'payment',
        entityId: paymentId,
        afterJson: {
          ...parsed.data,
          occurredAt: occurredAt.toISOString(),
          financialMovementId: movementId,
        },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'payment',
        aggregateId: paymentId,
        eventType: 'PaymentReceived',
        payload: {
          salesOrderId: parsed.data.salesOrderId,
          accountId: parsed.data.accountId,
          amount: parsed.data.amount,
        },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id: paymentId, financialMovementId: movementId } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json(
      { id: paymentId, financialMovementId: movementId },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
