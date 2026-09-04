import { asc, eq, sql } from 'drizzle-orm';
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

const input = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(120),
  type: z.enum(['CASH', 'BANK', 'WALLET', 'OTHER']),
  openingBalance: z.number().default(0),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'accounts', 'view');
    const data = await getDb()
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
      .orderBy(asc(financialAccounts.name));
    return Response.json({ data });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'accounts', 'create');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const id = crypto.randomUUID();
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'accounts.create');
      await tx.insert(financialAccounts).values({
        id,
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
        openingBalance: parsed.data.openingBalance.toFixed(2),
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'FINANCIAL_ACCOUNT_CREATED',
        entityType: 'financial_account',
        entityId: id,
        afterJson: parsed.data,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'financial_account',
        aggregateId: id,
        eventType: 'FinancialAccountCreated',
        payload: {
          code: parsed.data.code,
          openingBalance: parsed.data.openingBalance,
        },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
