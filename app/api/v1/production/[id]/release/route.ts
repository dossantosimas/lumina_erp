import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryMovements,
  outboxEvents,
  productionOrders,
  warehouses,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const snapshotSchema = z.object({
  lines: z
    .array(
      z.object({
        materialId: z.uuid(),
        theoreticalQuantity: z.number().positive(),
      }),
    )
    .min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'production', 'approve');
    await authorize(request.headers, 'inventory', 'view');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const now = new Date();
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'production.release');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`production:${id}`}))`,
      );
      const [order] = await tx
        .select({
          status: productionOrders.status,
          bomSnapshot: productionOrders.bomSnapshot,
        })
        .from(productionOrders)
        .where(eq(productionOrders.id, id))
        .limit(1);
      if (!order) throw new ApiInputError('PRODUCTION_ORDER_NOT_FOUND', 404);
      if (order.status !== 'DRAFT')
        throw new ApiInputError('PRODUCTION_ORDER_NOT_DRAFT', 409);
      const snapshot = snapshotSchema.safeParse(order.bomSnapshot);
      if (!snapshot.success)
        throw new ApiInputError('BOM_SNAPSHOT_INVALID', 409);
      const [warehouse] = await tx
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(
          and(eq(warehouses.code, 'PRINCIPAL'), eq(warehouses.active, true)),
        )
        .limit(1);
      if (!warehouse) throw new ApiInputError('WAREHOUSE_NOT_CONFIGURED', 409);
      for (const line of [...snapshot.data.lines].sort((a, b) =>
        a.materialId.localeCompare(b.materialId),
      )) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${warehouse.id}:MATERIAL:${line.materialId}`}))`,
        );
        const [balance] = await tx
          .select({
            onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
          })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.warehouseId, warehouse.id),
              eq(inventoryMovements.materialId, line.materialId),
            ),
          );
        if (Number(balance?.onHand ?? 0) < line.theoreticalQuantity)
          throw new ApiInputError('INSUFFICIENT_MATERIAL_STOCK', 409, {
            materialId: line.materialId,
            required: line.theoreticalQuantity,
            available: Number(balance?.onHand ?? 0),
          });
      }
      const changed = await tx
        .update(productionOrders)
        .set({ status: 'IN_PROGRESS', startedAt: now, updatedAt: now })
        .where(
          and(
            eq(productionOrders.id, id),
            eq(productionOrders.status, 'DRAFT'),
          ),
        )
        .returning({ id: productionOrders.id });
      if (changed.length !== 1)
        throw new ApiInputError('PRODUCTION_ORDER_NOT_DRAFT', 409);
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCTION_ORDER_RELEASED',
        entityType: 'production_order',
        entityId: id,
        beforeJson: { status: 'DRAFT' },
        afterJson: { status: 'IN_PROGRESS', startedAt: now.toISOString() },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'production_order',
        aggregateId: id,
        eventType: 'ProductionOrderReleased',
        payload: { id },
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
