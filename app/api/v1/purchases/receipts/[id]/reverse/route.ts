import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryMovements,
  materials,
  outboxEvents,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
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
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'purchases.receipt.reverse');
      const [receipt] = await tx
        .select()
        .from(purchaseReceipts)
        .where(eq(purchaseReceipts.id, id))
        .limit(1);
      if (!receipt) throw new ApiInputError('PURCHASE_RECEIPT_NOT_FOUND', 404);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`purchase:${receipt.purchaseOrderId}`}))`,
      );
      const lines = await tx
        .select({
          purchaseOrderLineId: purchaseReceiptLines.purchaseOrderLineId,
          quantity: purchaseReceiptLines.receivedQuantity,
          movementId: purchaseReceiptLines.inventoryMovementId,
        })
        .from(purchaseReceiptLines)
        .where(eq(purchaseReceiptLines.purchaseReceiptId, id));
      const movementIds = lines.map((line) => line.movementId);
      const originals = await tx
        .select()
        .from(inventoryMovements)
        .where(inArray(inventoryMovements.id, movementIds));
      const existing = await tx
        .select({ id: inventoryMovements.id })
        .from(inventoryMovements)
        .where(
          and(
            inArray(inventoryMovements.reversalOfId, movementIds),
            isNull(inventoryMovements.productVariantId),
          ),
        );
      if (existing.length)
        throw new ApiInputError('PURCHASE_RECEIPT_ALREADY_REVERSED', 409);
      for (const original of originals)
        await tx.insert(inventoryMovements).values({
          warehouseId: original.warehouseId,
          lotId: original.lotId,
          materialId: original.materialId,
          type: 'REVERSAL',
          quantity: (-Number(original.quantity)).toFixed(6),
          unitCost: original.unitCost,
          sourceType: 'PURCHASE_RECEIPT_REVERSAL',
          sourceId: id,
          reversalOfId: original.id,
          reason: parsed.data.reason,
          idempotencyKey: `${key}:${original.id}`,
          createdBy: actor.id,
        });
      for (const line of lines)
        await tx
          .update(purchaseOrderLines)
          .set({
            receivedQuantity: sql`${purchaseOrderLines.receivedQuantity} - ${line.quantity}::numeric`,
          })
          .where(eq(purchaseOrderLines.id, line.purchaseOrderLineId));
      const orderLines = await tx
        .select({
          ordered: purchaseOrderLines.orderedQuantity,
          received: purchaseOrderLines.receivedQuantity,
        })
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, receipt.purchaseOrderId));
      const status = orderLines.every(
        (line) => Number(line.received) >= Number(line.ordered),
      )
        ? 'COMPLETED'
        : orderLines.some((line) => Number(line.received) > 0)
          ? 'PARTIAL'
          : 'APPROVED';
      await tx
        .update(purchaseOrders)
        .set({ status, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, receipt.purchaseOrderId));
      for (const materialId of [
        ...new Set(originals.map((row) => row.materialId).filter(Boolean)),
      ] as string[]) {
        const [value] = await tx
          .select({
            qty: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
            total: sql<string>`coalesce(sum(${inventoryMovements.quantity} * coalesce(${inventoryMovements.unitCost}, 0)), 0)`,
          })
          .from(inventoryMovements)
          .where(eq(inventoryMovements.materialId, materialId));
        if (Number(value?.qty) > 0)
          await tx
            .update(materials)
            .set({
              standardCost: (Number(value!.total) / Number(value!.qty)).toFixed(
                2,
              ),
              updatedAt: new Date(),
            })
            .where(eq(materials.id, materialId));
      }
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PURCHASE_RECEIPT_REVERSED',
        entityType: 'purchase_receipt',
        entityId: id,
        beforeJson: receipt,
        afterJson: { purchaseOrderStatus: status },
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'purchase_receipt',
        aggregateId: id,
        eventType: 'PurchaseReceiptReversed',
        payload: { purchaseOrderId: receipt.purchaseOrderId },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'REVERSED' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'REVERSED' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
