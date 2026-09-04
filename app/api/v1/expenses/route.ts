import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  expenses,
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

const input = z.object({
  reference: z.string().trim().min(2).max(80),
  accountId: z.uuid(),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(300),
  amount: z.number().positive(),
  occurredAt: z.iso.datetime().optional(),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'expenses', 'view');
    return Response.json({
      data: await getDb()
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
        .orderBy(desc(expenses.occurredAt)),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'expenses', 'create');
    await authorize(request.headers, 'accounts', 'edit');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const id = crypto.randomUUID();
    const movementId = crypto.randomUUID();
    const occurredAt = parsed.data.occurredAt
      ? new Date(parsed.data.occurredAt)
      : new Date();
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'expenses.create');
      const [account] = await tx
        .select({ status: financialAccounts.status })
        .from(financialAccounts)
        .where(eq(financialAccounts.id, parsed.data.accountId))
        .limit(1);
      if (!account) throw new ApiInputError('FINANCIAL_ACCOUNT_NOT_FOUND', 404);
      if (account.status !== 'ACTIVE')
        throw new ApiInputError('FINANCIAL_ACCOUNT_INACTIVE', 409);
      await tx.insert(financialMovements).values({
        id: movementId,
        accountId: parsed.data.accountId,
        type: 'EXPENSE',
        amount: (-parsed.data.amount).toFixed(2),
        category: parsed.data.category,
        description: parsed.data.description,
        sourceType: 'EXPENSE',
        sourceId: id,
        occurredAt,
        createdBy: actor.id,
      });
      await tx.insert(expenses).values({
        id,
        reference: parsed.data.reference,
        accountId: parsed.data.accountId,
        category: parsed.data.category,
        description: parsed.data.description,
        amount: parsed.data.amount.toFixed(2),
        financialMovementId: movementId,
        occurredAt,
        createdBy: actor.id,
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'EXPENSE_CONFIRMED',
        entityType: 'expense',
        entityId: id,
        afterJson: {
          ...parsed.data,
          occurredAt: occurredAt.toISOString(),
          financialMovementId: movementId,
        },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'expense',
        aggregateId: id,
        eventType: 'ExpenseConfirmed',
        payload: {
          accountId: parsed.data.accountId,
          amount: parsed.data.amount,
          category: parsed.data.category,
        },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, financialMovementId: movementId } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json(
      { id, financialMovementId: movementId },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
