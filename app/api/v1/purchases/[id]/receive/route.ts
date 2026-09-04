import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryLots,
  inventoryMovements,
  materials,
  outboxEvents,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
  warehouses,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';
import { weightedAverageCost } from '@/modules/inventario/domain/inventory-rules';

const input = z.object({
  number: z.string().trim().min(2).max(40),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.uuid(),
        quantity: z.number().positive(),
        lotCode: z.string().trim().min(1).max(80).optional(),
      }),
    )
    .min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'purchases', 'edit');
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
    const requestedIds = [
      ...new Set(parsed.data.lines.map((line) => line.purchaseOrderLineId)),
    ];
    if (requestedIds.length !== parsed.data.lines.length)
      throw new ApiInputError('DUPLICATE_PURCHASE_LINE', 400);
    const receiptId = crypto.randomUUID();
    const now = new Date();

    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'purchases.receive');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`purchase:${id}`}))`,
      );
      const [order] = await tx
        .select({ status: purchaseOrders.status })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .limit(1);
      if (!order) throw new ApiInputError('PURCHASE_ORDER_NOT_FOUND', 404);
      if (!['APPROVED', 'PARTIAL'].includes(order.status))
        throw new ApiInputError('PURCHASE_ORDER_NOT_RECEIVABLE', 409);
      const orderLines = await tx
        .select({
          id: purchaseOrderLines.id,
          materialId: purchaseOrderLines.materialId,
          orderedQuantity: purchaseOrderLines.orderedQuantity,
          receivedQuantity: purchaseOrderLines.receivedQuantity,
          unitCost: purchaseOrderLines.unitCost,
          materialStatus: materials.status,
        })
        .from(purchaseOrderLines)
        .innerJoin(materials, eq(purchaseOrderLines.materialId, materials.id))
        .where(
          and(
            eq(purchaseOrderLines.purchaseOrderId, id),
            inArray(purchaseOrderLines.id, requestedIds),
          ),
        );
      if (orderLines.length !== requestedIds.length)
        throw new ApiInputError('PURCHASE_LINE_NOT_FOUND', 404);
      if (orderLines.some((line) => line.materialStatus === 'INACTIVE'))
        throw new ApiInputError('MATERIAL_INACTIVE', 409);
      for (const requestLine of parsed.data.lines) {
        const orderLine = orderLines.find(
          (line) => line.id === requestLine.purchaseOrderLineId,
        )!;
        if (
          Number(orderLine.receivedQuantity) + requestLine.quantity >
          Number(orderLine.orderedQuantity)
        )
          throw new ApiInputError('PURCHASE_OVER_RECEIPT', 409);
      }
      const [warehouse] = await tx
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(
          and(eq(warehouses.code, 'PRINCIPAL'), eq(warehouses.active, true)),
        )
        .limit(1);
      if (!warehouse) throw new ApiInputError('WAREHOUSE_NOT_CONFIGURED', 409);
      for (const materialId of [
        ...new Set(orderLines.map((line) => line.materialId)),
      ].sort()) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${warehouse.id}:MATERIAL:${materialId}`}))`,
        );
      }
      await tx.insert(purchaseReceipts).values({
        id: receiptId,
        number: parsed.data.number,
        purchaseOrderId: id,
        warehouseId: warehouse.id,
        receivedAt: now,
        createdBy: actor.id,
      });

      for (const requestLine of parsed.data.lines) {
        const orderLine = orderLines.find(
          (line) => line.id === requestLine.purchaseOrderLineId,
        )!;
        const [material] = await tx
          .select({ currentCost: materials.standardCost })
          .from(materials)
          .where(eq(materials.id, orderLine.materialId))
          .limit(1);
        const [balance] = await tx
          .select({
            onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
          })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.warehouseId, warehouse.id),
              eq(inventoryMovements.materialId, orderLine.materialId),
            ),
          );
        let lotId: string | null = null;
        if (requestLine.lotCode) {
          const [existingLot] = await tx
            .select()
            .from(inventoryLots)
            .where(
              and(
                eq(inventoryLots.warehouseId, warehouse.id),
                eq(inventoryLots.lotCode, requestLine.lotCode),
              ),
            )
            .limit(1);
          if (existingLot && existingLot.materialId !== orderLine.materialId)
            throw new ApiInputError('LOT_BELONGS_TO_OTHER_ITEM', 409);
          if (existingLot) lotId = existingLot.id;
          else {
            const [createdLot] = await tx
              .insert(inventoryLots)
              .values({
                warehouseId: warehouse.id,
                materialId: orderLine.materialId,
                lotCode: requestLine.lotCode,
              })
              .returning({ id: inventoryLots.id });
            lotId = createdLot!.id;
          }
        }
        const movementId = crypto.randomUUID();
        await tx.insert(inventoryMovements).values({
          id: movementId,
          warehouseId: warehouse.id,
          lotId,
          materialId: orderLine.materialId,
          type: 'PURCHASE_RECEIPT',
          quantity: requestLine.quantity.toFixed(6),
          unitCost: orderLine.unitCost,
          sourceType: 'PURCHASE_RECEIPT',
          sourceId: receiptId,
          reason: `Recepción ${parsed.data.number}`,
          idempotencyKey: `${key}:${orderLine.id}`,
          createdBy: actor.id,
        });
        await tx.insert(purchaseReceiptLines).values({
          purchaseReceiptId: receiptId,
          purchaseOrderLineId: orderLine.id,
          receivedQuantity: requestLine.quantity.toFixed(6),
          inventoryMovementId: movementId,
        });
        await tx
          .update(purchaseOrderLines)
          .set({
            receivedQuantity: (
              Number(orderLine.receivedQuantity) + requestLine.quantity
            ).toFixed(6),
          })
          .where(eq(purchaseOrderLines.id, orderLine.id));
        const averageCost = weightedAverageCost(
          Number(balance?.onHand ?? 0),
          Number(material?.currentCost ?? 0),
          requestLine.quantity,
          Number(orderLine.unitCost),
        );
        await tx
          .update(materials)
          .set({
            standardCost: averageCost.toFixed(2),
            status: 'ACTIVE',
            updatedAt: now,
          })
          .where(eq(materials.id, orderLine.materialId));
        await tx.insert(outboxEvents).values({
          aggregateType: 'inventory_movement',
          aggregateId: movementId,
          eventType: 'PurchaseInventoryReceived',
          payload: {
            receiptId,
            materialId: orderLine.materialId,
            quantity: requestLine.quantity,
            unitCost: Number(orderLine.unitCost),
          },
        });
      }
      const refreshedLines = await tx
        .select({
          ordered: purchaseOrderLines.orderedQuantity,
          received: purchaseOrderLines.receivedQuantity,
        })
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, id));
      const status = refreshedLines.every(
        (line) => Number(line.received) >= Number(line.ordered),
      )
        ? 'COMPLETED'
        : 'PARTIAL';
      await tx
        .update(purchaseOrders)
        .set({ status, updatedAt: now })
        .where(eq(purchaseOrders.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PURCHASE_RECEIPT_CONFIRMED',
        entityType: 'purchase_receipt',
        entityId: receiptId,
        afterJson: {
          purchaseOrderId: id,
          number: parsed.data.number,
          lines: parsed.data.lines,
          status,
        },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'purchase_receipt',
        aggregateId: receiptId,
        eventType: 'PurchaseReceiptConfirmed',
        payload: { purchaseOrderId: id, number: parsed.data.number, status },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id: receiptId, purchaseOrderStatus: status } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id: receiptId }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
