import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryReservations,
  outboxEvents,
  salesOrderLines,
  salesOrders,
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
    const actor = await authorize(request.headers, 'orders', 'cancel');
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
      await claimIdempotency(tx, key, 'orders.cancel');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`sales:${id}`}))`,
      );
      const [before] = await tx
        .select({ status: salesOrders.status })
        .from(salesOrders)
        .where(eq(salesOrders.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('SALES_ORDER_NOT_FOUND', 404);
      if (!['DRAFT', 'APPROVED'].includes(before.status))
        throw new ApiInputError('SALES_ORDER_NOT_CANCELLABLE', 409);
      const lineIds = await tx
        .select({ id: salesOrderLines.id })
        .from(salesOrderLines)
        .where(eq(salesOrderLines.salesOrderId, id));
      if (lineIds.length > 0)
        await tx
          .update(inventoryReservations)
          .set({ releasedAt: new Date() })
          .where(
            and(
              eq(inventoryReservations.sourceType, 'SALES_ORDER_LINE'),
              inArray(
                inventoryReservations.sourceId,
                lineIds.map((line) => line.id),
              ),
              isNull(inventoryReservations.releasedAt),
            ),
          );
      await tx
        .update(salesOrders)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(salesOrders.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'SALES_ORDER_CANCELLED',
        entityType: 'sales_order',
        entityId: id,
        beforeJson: before,
        afterJson: { status: 'CANCELLED' },
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'sales_order',
        aggregateId: id,
        eventType: 'SalesOrderCancelled',
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
