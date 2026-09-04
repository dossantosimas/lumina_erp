import { and, eq, isNull, sql } from 'drizzle-orm';
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
  warehouses,
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
    let costOfGoods = 0;
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'orders.deliver');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`sales:${id}`}))`,
      );
      const [order] = await tx
        .select({ status: salesOrders.status })
        .from(salesOrders)
        .where(eq(salesOrders.id, id))
        .limit(1);
      if (!order) throw new ApiInputError('SALES_ORDER_NOT_FOUND', 404);
      if (order.status !== 'APPROVED')
        throw new ApiInputError('SALES_ORDER_NOT_CONFIRMED', 409);
      const lines = await tx
        .select()
        .from(salesOrderLines)
        .where(eq(salesOrderLines.salesOrderId, id));
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
        const [reservation] = await tx
          .select()
          .from(inventoryReservations)
          .where(
            and(
              eq(inventoryReservations.sourceType, 'SALES_ORDER_LINE'),
              eq(inventoryReservations.sourceId, line.id),
              isNull(inventoryReservations.releasedAt),
            ),
          )
          .limit(1);
        if (
          !reservation ||
          Number(reservation.quantity) !== Number(line.quantity)
        )
          throw new ApiInputError('SALES_RESERVATION_INVALID', 409);
        const [stock] = await tx
          .select({
            onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
            value: sql<string>`coalesce(sum(${inventoryMovements.quantity} * coalesce(${inventoryMovements.unitCost}, 0)), 0)`,
          })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.warehouseId, warehouse.id),
              eq(inventoryMovements.productVariantId, line.productVariantId),
            ),
          );
        if (Number(stock?.onHand ?? 0) < Number(line.quantity))
          throw new ApiInputError('INSUFFICIENT_PRODUCT_STOCK', 409);
        const unitCost =
          Number(stock?.onHand ?? 0) > 0
            ? Number(stock?.value ?? 0) / Number(stock!.onHand)
            : 0;
        const movementId = crypto.randomUUID();
        costOfGoods += unitCost * Number(line.quantity);
        await tx.insert(inventoryMovements).values({
          id: movementId,
          warehouseId: warehouse.id,
          productVariantId: line.productVariantId,
          type: 'SALE_DELIVERY',
          quantity: (-Number(line.quantity)).toFixed(6),
          unitCost: unitCost.toFixed(2),
          sourceType: 'SALES_ORDER',
          sourceId: id,
          reason: parsed.data.reason,
          idempotencyKey: `${key}:${line.id}`,
          createdBy: actor.id,
        });
        await tx
          .update(salesOrderLines)
          .set({ unitCostSnapshot: unitCost.toFixed(2) })
          .where(eq(salesOrderLines.id, line.id));
        await tx
          .update(inventoryReservations)
          .set({ releasedAt: new Date() })
          .where(eq(inventoryReservations.id, reservation.id));
        await tx.insert(outboxEvents).values({
          aggregateType: 'inventory_movement',
          aggregateId: movementId,
          eventType: 'SalesInventoryDelivered',
          payload: {
            salesOrderId: id,
            productVariantId: line.productVariantId,
            quantity: Number(line.quantity),
            unitCost,
          },
        });
      }
      const changed = await tx
        .update(salesOrders)
        .set({
          status: 'COMPLETED',
          costOfGoods: costOfGoods.toFixed(2),
          updatedAt: new Date(),
        })
        .where(and(eq(salesOrders.id, id), eq(salesOrders.status, 'APPROVED')))
        .returning({ id: salesOrders.id });
      if (changed.length !== 1)
        throw new ApiInputError('SALES_ORDER_ALREADY_DELIVERED', 409);
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'SALES_ORDER_DELIVERED',
        entityType: 'sales_order',
        entityId: id,
        beforeJson: { status: 'APPROVED' },
        afterJson: { status: 'COMPLETED', costOfGoods },
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'sales_order',
        aggregateId: id,
        eventType: 'SalesOrderDelivered',
        payload: { costOfGoods },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'COMPLETED', costOfGoods } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'COMPLETED', costOfGoods });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
