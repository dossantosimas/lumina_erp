import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  outboxEvents,
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
    const actor = await authorize(request.headers, 'purchases', 'approve');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const now = new Date();
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'purchases.approve');
      const changed = await tx
        .update(purchaseOrders)
        .set({
          status: 'APPROVED',
          approvedBy: actor.id,
          orderedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(purchaseOrders.id, id),
            eq(purchaseOrders.status, 'PENDING_APPROVAL'),
          ),
        )
        .returning({ id: purchaseOrders.id });
      if (changed.length !== 1)
        throw new ApiInputError('PURCHASE_ORDER_NOT_PENDING', 409);
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PURCHASE_ORDER_APPROVED',
        entityType: 'purchase_order',
        entityId: id,
        beforeJson: { status: 'PENDING_APPROVAL' },
        afterJson: { status: 'APPROVED', approvedAt: now.toISOString() },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'purchase_order',
        aggregateId: id,
        eventType: 'PurchaseOrderApproved',
        payload: { id },
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
