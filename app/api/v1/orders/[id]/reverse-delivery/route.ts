import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryMovements,
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
    const actor = await authorize(request.headers, 'orders', 'edit');
    await authorize(request.headers, 'inventory', 'adjust');
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
      await claimIdempotency(tx, key, 'orders.delivery.reverse');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`sales:${id}`}))`,
      );
      const [before] = await tx
        .select()
        .from(salesOrders)
        .where(eq(salesOrders.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('SALES_ORDER_NOT_FOUND', 404);
      if (before.status !== 'COMPLETED')
        throw new ApiInputError('ONLY_DELIVERED_ORDER_CAN_BE_REVERSED', 409);
      const originals = await tx
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.sourceType, 'SALES_ORDER'),
            eq(inventoryMovements.sourceId, id),
          ),
        );
      const ids = originals.map((row) => row.id);
      const existing = ids.length
        ? await tx
            .select({ id: inventoryMovements.id })
            .from(inventoryMovements)
            .where(inArray(inventoryMovements.reversalOfId, ids))
        : [];
      if (existing.length)
        throw new ApiInputError('DELIVERY_ALREADY_REVERSED', 409);
      for (const original of originals)
        await tx.insert(inventoryMovements).values({
          warehouseId: original.warehouseId,
          lotId: original.lotId,
          productVariantId: original.productVariantId,
          type: 'REVERSAL',
          quantity: (-Number(original.quantity)).toFixed(6),
          unitCost: original.unitCost,
          sourceType: 'SALE_DELIVERY_REVERSAL',
          sourceId: id,
          reversalOfId: original.id,
          reason: parsed.data.reason,
          idempotencyKey: `${key}:${original.id}`,
          createdBy: actor.id,
        });
      const lines = await tx
        .select({ id: salesOrderLines.id })
        .from(salesOrderLines)
        .where(eq(salesOrderLines.salesOrderId, id));
      for (const line of lines)
        await tx
          .update(inventoryReservations)
          .set({ releasedAt: null })
          .where(
            and(
              eq(inventoryReservations.sourceType, 'SALES_ORDER_LINE'),
              eq(inventoryReservations.sourceId, line.id),
            ),
          );
      const [after] = await tx
        .update(salesOrders)
        .set({ status: 'APPROVED', costOfGoods: '0', updatedAt: new Date() })
        .where(eq(salesOrders.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'SALES_DELIVERY_REVERSED',
        entityType: 'sales_order',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'sales_order',
        aggregateId: id,
        eventType: 'SalesDeliveryReversed',
        payload: { movementCount: originals.length },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'APPROVED' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'APPROVED' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
