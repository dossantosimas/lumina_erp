import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  financialAccounts,
  financialMovements,
  idempotencyKeys,
  outboxEvents,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const patchInput = z
  .object({
    code: z.string().trim().min(2).max(30).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    type: z.enum(['CASH', 'BANK', 'WALLET', 'OTHER']).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'EMPTY_UPDATE');
const deactivateInput = z.object({ reason: z.string().trim().min(3).max(500) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'accounts', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = patchInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'accounts.update');
      const [before] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('ACCOUNT_NOT_FOUND', 404);
      const { active, ...changes } = parsed.data;
      const [after] = await tx
        .update(financialAccounts)
        .set({
          ...changes,
          status:
            active === undefined
              ? before.status
              : active
                ? 'ACTIVE'
                : 'INACTIVE',
        })
        .where(eq(financialAccounts.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'FINANCIAL_ACCOUNT_UPDATED',
        entityType: 'financial_account',
        entityId: id,
        beforeJson: before,
        afterJson: after,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'financial_account',
        aggregateId: id,
        eventType: 'FinancialAccountUpdated',
        payload: { id },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'accounts', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = deactivateInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'accounts.deactivate');
      const [before] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('ACCOUNT_NOT_FOUND', 404);
      const [movement] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(financialMovements)
        .where(eq(financialMovements.accountId, id));
      if (Number(before.openingBalance) !== 0 || (movement?.count ?? 0) > 0)
        throw new ApiInputError(
          'ACCOUNT_WITH_HISTORY_CANNOT_BE_DEACTIVATED',
          409,
        );
      const [after] = await tx
        .update(financialAccounts)
        .set({ status: 'INACTIVE' })
        .where(eq(financialAccounts.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'FINANCIAL_ACCOUNT_DEACTIVATED',
        entityType: 'financial_account',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'financial_account',
        aggregateId: id,
        eventType: 'FinancialAccountDeactivated',
        payload: { id },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'INACTIVE' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'INACTIVE' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
