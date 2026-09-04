import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryMovements,
  inventoryReservations,
  outboxEvents,
  salesOrderLines,
  salesOrders,
  warehouses,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'orders', 'approve');
    await authorize(request.headers, 'inventory', 'view');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'orders.confirm');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`sales:${id}`}))`,
      );
      const [order] = await tx
        .select({ status: salesOrders.status })
        .from(salesOrders)
        .where(eq(salesOrders.id, id))
        .limit(1);
      if (!order) throw new ApiInputError('SALES_ORDER_NOT_FOUND', 404);
      if (order.status !== 'DRAFT')
        throw new ApiInputError('SALES_ORDER_NOT_DRAFT', 409);
      const lines = await tx
        .select()
        .from(salesOrderLines)
        .where(eq(salesOrderLines.salesOrderId, id));
      if (lines.length === 0) throw new ApiInputError('SALES_ORDER_EMPTY', 409);
      const [warehouse] = await tx
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(
          and(eq(warehouses.code, 'PRINCIPAL'), eq(warehouses.active, true)),
        )
        .limit(1);
      if (!warehouse) throw new ApiInputError('WAREHOUSE_NOT_CONFIGURED', 409);
      for (const variantId of [
        ...new Set(lines.map((line) => line.productVariantId)),
      ].sort())
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${warehouse.id}:PRODUCT:${variantId}`}))`,
        );
      for (const line of lines) {
        const [stock] = await tx
          .select({
            onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
          })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.warehouseId, warehouse.id),
              eq(inventoryMovements.productVariantId, line.productVariantId),
            ),
          );
        const [reserved] = await tx
          .select({
            quantity: sql<string>`coalesce(sum(${inventoryReservations.quantity}), 0)`,
          })
          .from(inventoryReservations)
          .where(
            and(
              eq(inventoryReservations.warehouseId, warehouse.id),
              eq(inventoryReservations.productVariantId, line.productVariantId),
              isNull(inventoryReservations.releasedAt),
            ),
          );
        if (
          Number(stock?.onHand ?? 0) - Number(reserved?.quantity ?? 0) <
          Number(line.quantity)
        )
          throw new ApiInputError('INSUFFICIENT_PRODUCT_STOCK', 409, {
            productVariantId: line.productVariantId,
            requested: Number(line.quantity),
            available:
              Number(stock?.onHand ?? 0) - Number(reserved?.quantity ?? 0),
          });
        await tx.insert(inventoryReservations).values({
          warehouseId: warehouse.id,
          productVariantId: line.productVariantId,
          sourceType: 'SALES_ORDER_LINE',
          sourceId: line.id,
          quantity: line.quantity,
        });
      }
      const changed = await tx
        .update(salesOrders)
        .set({ status: 'APPROVED', updatedAt: new Date() })
        .where(and(eq(salesOrders.id, id), eq(salesOrders.status, 'DRAFT')))
        .returning({ id: salesOrders.id });
      if (changed.length !== 1)
        throw new ApiInputError('SALES_ORDER_NOT_DRAFT', 409);
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'SALES_ORDER_CONFIRMED',
        entityType: 'sales_order',
        entityId: id,
        beforeJson: { status: 'DRAFT' },
        afterJson: {
          status: 'APPROVED',
          reservedLines: lines.map((line) => line.id),
        },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'sales_order',
        aggregateId: id,
        eventType: 'SalesOrderConfirmed',
        payload: { lineCount: lines.length },
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
