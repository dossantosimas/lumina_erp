import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryMovements,
  outboxEvents,
  productionConsumptions,
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
    const actor = await authorize(request.headers, 'production', 'edit');
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
      await claimIdempotency(tx, key, 'production.reverse');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`production:${id}`}))`,
      );
      const [before] = await tx
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('PRODUCTION_ORDER_NOT_FOUND', 404);
      if (before.status !== 'COMPLETED')
        throw new ApiInputError(
          'ONLY_COMPLETED_PRODUCTION_CAN_BE_REVERSED',
          409,
        );
      const originals = await tx
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.sourceType, 'PRODUCTION_ORDER'),
            eq(inventoryMovements.sourceId, id),
          ),
        );
      const originalIds = originals.map((row) => row.id);
      const existing = originalIds.length
        ? await tx
            .select({ id: inventoryMovements.id })
            .from(inventoryMovements)
            .where(inArray(inventoryMovements.reversalOfId, originalIds))
        : [];
      if (existing.length)
        throw new ApiInputError('PRODUCTION_ALREADY_REVERSED', 409);
      for (const output of originals.filter((row) => row.productVariantId)) {
        const [stock] = await tx
          .select({
            qty: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
          })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.warehouseId, output.warehouseId),
              eq(inventoryMovements.productVariantId, output.productVariantId!),
            ),
          );
        if (Number(stock?.qty) < Number(output.quantity))
          throw new ApiInputError('PRODUCTION_OUTPUT_ALREADY_CONSUMED', 409);
      }
      for (const original of originals)
        await tx.insert(inventoryMovements).values({
          warehouseId: original.warehouseId,
          lotId: original.lotId,
          materialId: original.materialId,
          productVariantId: original.productVariantId,
          type: 'REVERSAL',
          quantity: (-Number(original.quantity)).toFixed(6),
          unitCost: original.unitCost,
          sourceType: 'PRODUCTION_REVERSAL',
          sourceId: id,
          reversalOfId: original.id,
          reason: parsed.data.reason,
          idempotencyKey: `${key}:${original.id}`,
          createdBy: actor.id,
        });
      await tx
        .delete(productionConsumptions)
        .where(eq(productionConsumptions.productionOrderId, id));
      const [after] = await tx
        .update(productionOrders)
        .set({
          status: 'IN_PROGRESS',
          completedQuantity: '0',
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(productionOrders.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCTION_ORDER_REVERSED',
        entityType: 'production_order',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'production_order',
        aggregateId: id,
        eventType: 'ProductionOrderReversed',
        payload: { movementCount: originals.length },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'IN_PROGRESS' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'IN_PROGRESS' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
