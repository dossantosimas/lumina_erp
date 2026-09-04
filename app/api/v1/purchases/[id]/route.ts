import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  materials,
  outboxEvents,
  purchaseOrderLines,
  purchaseOrders,
  suppliers,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const updateInput = z.object({
  number: z.string().trim().min(2).max(40),
  supplierId: z.uuid(),
  lines: z
    .array(
      z.object({
        materialId: z.uuid(),
        quantity: z.number().positive(),
        unitCost: z.number().nonnegative(),
      }),
    )
    .min(1),
});
const cancelInput = z.object({ reason: z.string().trim().min(3).max(500) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'purchases', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = updateInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const materialIds = [
      ...new Set(parsed.data.lines.map((line) => line.materialId)),
    ];
    if (materialIds.length !== parsed.data.lines.length)
      throw new ApiInputError('DUPLICATE_MATERIAL', 400);
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'purchases.update');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`purchase:${id}`}))`,
      );
      const [before] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('PURCHASE_ORDER_NOT_FOUND', 404);
      if (before.status !== 'DRAFT')
        throw new ApiInputError('ONLY_DRAFT_CAN_BE_EDITED', 409);
      const [supplier] = await tx
        .select({ status: suppliers.status })
        .from(suppliers)
        .where(eq(suppliers.id, parsed.data.supplierId))
        .limit(1);
      if (!supplier || supplier.status !== 'ACTIVE')
        throw new ApiInputError('SUPPLIER_NOT_ACTIVE', 409);
      const materialRows = await tx
        .select({ id: materials.id, status: materials.status })
        .from(materials)
        .where(inArray(materials.id, materialIds));
      if (
        materialRows.length !== materialIds.length ||
        materialRows.some((row) => row.status === 'INACTIVE')
      )
        throw new ApiInputError('MATERIAL_NOT_ACTIVE', 409);
      const total = parsed.data.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitCost,
        0,
      );
      const [after] = await tx
        .update(purchaseOrders)
        .set({
          number: parsed.data.number,
          supplierId: parsed.data.supplierId,
          total: total.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, id))
        .returning();
      await tx
        .delete(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, id));
      await tx.insert(purchaseOrderLines).values(
        parsed.data.lines.map((line) => ({
          purchaseOrderId: id,
          materialId: line.materialId,
          orderedQuantity: line.quantity.toFixed(6),
          unitCost: line.unitCost.toFixed(2),
        })),
      );
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PURCHASE_ORDER_UPDATED',
        entityType: 'purchase_order',
        entityId: id,
        beforeJson: before,
        afterJson: { ...after, lines: parsed.data.lines },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'purchase_order',
        aggregateId: id,
        eventType: 'PurchaseOrderUpdated',
        payload: { id, total },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'purchases', 'cancel');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = cancelInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'purchases.cancel');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`purchase:${id}`}))`,
      );
      const [before] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('PURCHASE_ORDER_NOT_FOUND', 404);
      if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status))
        throw new ApiInputError('PURCHASE_ORDER_NOT_CANCELLABLE', 409);
      const [after] = await tx
        .update(purchaseOrders)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PURCHASE_ORDER_CANCELLED',
        entityType: 'purchase_order',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'purchase_order',
        aggregateId: id,
        eventType: 'PurchaseOrderCancelled',
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
