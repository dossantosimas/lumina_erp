import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryMovements,
  outboxEvents,
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
    const actor = await authorize(request.headers, 'inventory', 'adjust');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const db = getDb();
    const [original] = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, id))
      .limit(1);
    if (!original) throw new ApiInputError('MOVEMENT_NOT_FOUND', 404);
    if (original.type === 'REVERSAL')
      throw new ApiInputError('REVERSAL_CANNOT_BE_REVERSED', 409);
    if (!['OPENING', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(original.type))
      throw new ApiInputError('SOURCE_DOCUMENT_REVERSAL_REQUIRED', 409);
    const itemType = original.materialId ? 'MATERIAL' : 'PRODUCT';
    const itemId = original.materialId ?? original.productVariantId;
    if (!itemId) throw new ApiInputError('MOVEMENT_WITHOUT_ITEM', 409);
    const reversalId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await claimIdempotency(tx, key, 'inventory.movement.reverse');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${original.warehouseId}:${itemType}:${itemId}`}))`,
      );
      const [alreadyReversed] = await tx
        .select({ id: inventoryMovements.id })
        .from(inventoryMovements)
        .where(eq(inventoryMovements.reversalOfId, id))
        .limit(1);
      if (alreadyReversed)
        throw new ApiInputError('MOVEMENT_ALREADY_REVERSED', 409);
      const itemPredicate = original.materialId
        ? eq(inventoryMovements.materialId, original.materialId)
        : eq(inventoryMovements.productVariantId, original.productVariantId!);
      const [balance] = await tx
        .select({
          onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
        })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.warehouseId, original.warehouseId),
            itemPredicate,
          ),
        );
      const reversalQuantity = -Number(original.quantity);
      if (Number(balance?.onHand ?? 0) + reversalQuantity < 0)
        throw new ApiInputError('REVERSAL_WOULD_CREATE_NEGATIVE_STOCK', 409);
      await tx.insert(inventoryMovements).values({
        id: reversalId,
        warehouseId: original.warehouseId,
        lotId: original.lotId,
        materialId: original.materialId,
        productVariantId: original.productVariantId,
        type: 'REVERSAL',
        quantity: reversalQuantity.toFixed(6),
        unitCost: original.unitCost,
        sourceType: 'MOVEMENT_REVERSAL',
        sourceId: original.id,
        reversalOfId: original.id,
        reason: parsed.data.reason,
        idempotencyKey: key,
        createdBy: actor.id,
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'INVENTORY_MOVEMENT_REVERSED',
        entityType: 'inventory_movement',
        entityId: original.id,
        beforeJson: original,
        afterJson: { reversalId, quantity: reversalQuantity },
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'inventory_movement',
        aggregateId: reversalId,
        eventType: 'InventoryMovementReversed',
        payload: {
          originalId: original.id,
          itemType,
          itemId,
          quantity: reversalQuantity,
        },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id: reversalId, reversalOfId: original.id } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json(
      { id: reversalId, reversalOfId: original.id },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
