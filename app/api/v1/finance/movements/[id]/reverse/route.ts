import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  expenses,
  financialMovements,
  idempotencyKeys,
  outboxEvents,
  payments,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const input = z.object({ reason: z.string().trim().min(3).max(500) });
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const [candidate] = await getDb()
      .select({ sourceType: financialMovements.sourceType })
      .from(financialMovements)
      .where(eq(financialMovements.id, id))
      .limit(1);
    const actor =
      candidate?.sourceType === 'PAYMENT'
        ? await authorize(request.headers, 'payments', 'create')
        : candidate?.sourceType === 'EXPENSE'
          ? await authorize(request.headers, 'expenses', 'edit')
          : await authorize(request.headers, 'accounts', 'edit');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const reversalId = crypto.randomUUID();
    const now = new Date();
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'finance.movement.reverse');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`finance:${id}`}))`,
      );
      const [original] = await tx
        .select()
        .from(financialMovements)
        .where(eq(financialMovements.id, id))
        .limit(1);
      if (!original)
        throw new ApiInputError('FINANCIAL_MOVEMENT_NOT_FOUND', 404);
      if (original.type === 'REVERSAL')
        throw new ApiInputError('REVERSAL_CANNOT_BE_REVERSED', 409);
      const [existing] = await tx
        .select({ id: financialMovements.id })
        .from(financialMovements)
        .where(eq(financialMovements.reversalOfId, id))
        .limit(1);
      if (existing)
        throw new ApiInputError('FINANCIAL_MOVEMENT_ALREADY_REVERSED', 409);
      await tx.insert(financialMovements).values({
        id: reversalId,
        accountId: original.accountId,
        type: 'REVERSAL',
        amount: (-Number(original.amount)).toFixed(2),
        category: original.category,
        description: `Reverso: ${original.description}`,
        sourceType: 'FINANCIAL_REVERSAL',
        sourceId: original.id,
        reversalOfId: original.id,
        occurredAt: now,
        createdBy: actor.id,
      });
      if (original.sourceType === 'PAYMENT' && original.sourceId)
        await tx
          .update(payments)
          .set({ reversedAt: now })
          .where(eq(payments.id, original.sourceId));
      if (original.sourceType === 'EXPENSE' && original.sourceId)
        await tx
          .update(expenses)
          .set({ reversedAt: now })
          .where(eq(expenses.id, original.sourceId));
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'FINANCIAL_MOVEMENT_REVERSED',
        entityType: 'financial_movement',
        entityId: id,
        beforeJson: original,
        afterJson: { reversalId, amount: -Number(original.amount) },
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'financial_movement',
        aggregateId: reversalId,
        eventType: 'FinancialMovementReversed',
        payload: { originalId: id, amount: -Number(original.amount) },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id: reversalId, reversalOfId: id } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id: reversalId, reversalOfId: id }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
