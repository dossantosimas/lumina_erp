import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  outboxEvents,
  productionOrders,
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
    const actor = await authorize(request.headers, 'production', 'cancel');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'production.cancel');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`production:${id}`}))`,
      );
      const [before] = await tx
        .select({ status: productionOrders.status })
        .from(productionOrders)
        .where(eq(productionOrders.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('PRODUCTION_ORDER_NOT_FOUND', 404);
      const changed = await tx
        .update(productionOrders)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(
          and(
            eq(productionOrders.id, id),
            inArray(productionOrders.status, ['DRAFT', 'IN_PROGRESS']),
          ),
        )
        .returning({ id: productionOrders.id });
      if (changed.length !== 1)
        throw new ApiInputError('PRODUCTION_ORDER_NOT_CANCELLABLE', 409);
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCTION_ORDER_CANCELLED',
        entityType: 'production_order',
        entityId: id,
        beforeJson: before,
        afterJson: { status: 'CANCELLED' },
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'production_order',
        aggregateId: id,
        eventType: 'ProductionOrderCancelled',
        payload: { previousStatus: before.status },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'CANCELLED' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'CANCELLED' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
