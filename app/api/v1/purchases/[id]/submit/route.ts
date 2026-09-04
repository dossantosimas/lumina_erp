import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  outboxEvents,
  purchaseOrderLines,
  purchaseOrders,
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
    const actor = await authorize(request.headers, 'purchases', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'purchases.submit');
      const [line] = await tx
        .select({ id: purchaseOrderLines.id })
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, id))
        .limit(1);
      if (!line) throw new ApiInputError('PURCHASE_ORDER_EMPTY', 409);
      const changed = await tx
        .update(purchaseOrders)
        .set({ status: 'PENDING_APPROVAL', updatedAt: new Date() })
        .where(
          and(eq(purchaseOrders.id, id), eq(purchaseOrders.status, 'DRAFT')),
        )
        .returning({ id: purchaseOrders.id });
      if (changed.length !== 1)
        throw new ApiInputError('PURCHASE_ORDER_NOT_DRAFT', 409);
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PURCHASE_ORDER_SUBMITTED',
        entityType: 'purchase_order',
        entityId: id,
        beforeJson: { status: 'DRAFT' },
        afterJson: { status: 'PENDING_APPROVAL' },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'purchase_order',
        aggregateId: id,
        eventType: 'PurchaseOrderSubmitted',
        payload: { id },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'PENDING_APPROVAL' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'PENDING_APPROVAL' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
