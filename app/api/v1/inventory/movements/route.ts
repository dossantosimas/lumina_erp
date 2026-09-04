import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  inventoryLots,
  inventoryMovements,
  materials,
  outboxEvents,
  productVariants,
  warehouses,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const input = z.object({
  itemType: z.enum(['MATERIAL', 'PRODUCT']),
  itemId: z.uuid(),
  operation: z.enum(['OPENING', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative().nullable().default(null),
  lotCode: z.string().trim().min(1).max(80).optional(),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'inventory', 'adjust');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const db = getDb();
    const [warehouse] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.code, 'PRINCIPAL'), eq(warehouses.active, true)))
      .limit(1);
    if (!warehouse) throw new ApiInputError('WAREHOUSE_NOT_CONFIGURED', 409);
    const item =
      parsed.data.itemType === 'MATERIAL'
        ? await db
            .select({ id: materials.id, status: materials.status })
            .from(materials)
            .where(eq(materials.id, parsed.data.itemId))
            .limit(1)
        : await db
            .select({ id: productVariants.id, status: productVariants.status })
            .from(productVariants)
            .where(eq(productVariants.id, parsed.data.itemId))
            .limit(1);
    if (!item[0]) throw new ApiInputError('INVENTORY_ITEM_NOT_FOUND', 404);
    if (item[0].status === 'INACTIVE')
      throw new ApiInputError('INVENTORY_ITEM_INACTIVE', 409);

    const movementId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await claimIdempotency(tx, key, 'inventory.movement.create');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${warehouse.id}:${parsed.data.itemType}:${parsed.data.itemId}`}))`,
      );
      const itemPredicate =
        parsed.data.itemType === 'MATERIAL'
          ? eq(inventoryMovements.materialId, parsed.data.itemId)
          : eq(inventoryMovements.productVariantId, parsed.data.itemId);
      const [balance] = await tx
        .select({
          onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
          movementCount: sql<number>`count(*)::int`,
        })
        .from(inventoryMovements)
        .where(
          and(eq(inventoryMovements.warehouseId, warehouse.id), itemPredicate),
        );
      if (
        parsed.data.operation === 'OPENING' &&
        Number(balance?.movementCount) > 0
      )
        throw new ApiInputError('OPENING_ALREADY_RECORDED', 409);
      const signedQuantity =
        parsed.data.operation === 'ADJUSTMENT_OUT'
          ? -parsed.data.quantity
          : parsed.data.quantity;
      if (Number(balance?.onHand ?? 0) + signedQuantity < 0)
        throw new ApiInputError('INSUFFICIENT_STOCK', 409);

      let lotId: string | null = null;
      if (parsed.data.lotCode) {
        const [existingLot] = await tx
          .select()
          .from(inventoryLots)
          .where(
            and(
              eq(inventoryLots.warehouseId, warehouse.id),
              eq(inventoryLots.lotCode, parsed.data.lotCode),
            ),
          )
          .limit(1);
        if (existingLot) {
          const matches =
            parsed.data.itemType === 'MATERIAL'
              ? existingLot.materialId === parsed.data.itemId
              : existingLot.productVariantId === parsed.data.itemId;
          if (!matches)
            throw new ApiInputError('LOT_BELONGS_TO_OTHER_ITEM', 409);
          lotId = existingLot.id;
        } else {
          const [createdLot] = await tx
            .insert(inventoryLots)
            .values({
              warehouseId: warehouse.id,
              lotCode: parsed.data.lotCode,
              materialId:
                parsed.data.itemType === 'MATERIAL' ? parsed.data.itemId : null,
              productVariantId:
                parsed.data.itemType === 'PRODUCT' ? parsed.data.itemId : null,
            })
            .returning({ id: inventoryLots.id });
          lotId = createdLot?.id ?? null;
        }
      }
      await tx.insert(inventoryMovements).values({
        id: movementId,
        warehouseId: warehouse.id,
        lotId,
        materialId:
          parsed.data.itemType === 'MATERIAL' ? parsed.data.itemId : null,
        productVariantId:
          parsed.data.itemType === 'PRODUCT' ? parsed.data.itemId : null,
        type: parsed.data.operation,
        quantity: signedQuantity.toFixed(6),
        unitCost: parsed.data.unitCost?.toFixed(2) ?? null,
        sourceType:
          parsed.data.operation === 'OPENING'
            ? 'INITIAL_COUNT'
            : 'MANUAL_ADJUSTMENT',
        reason: parsed.data.reason,
        idempotencyKey: key,
        createdBy: actor.id,
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'INVENTORY_MOVEMENT_CREATED',
        entityType: 'inventory_movement',
        entityId: movementId,
        afterJson: { ...parsed.data, quantity: signedQuantity },
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'inventory_movement',
        aggregateId: movementId,
        eventType: 'InventoryMovementCreated',
        payload: {
          itemType: parsed.data.itemType,
          itemId: parsed.data.itemId,
          quantity: signedQuantity,
        },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id: movementId } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id: movementId }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
