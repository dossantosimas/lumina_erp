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
  productionConsumptions,
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
import { assertCompletionSet } from '@/modules/produccion/domain/bom-rules';

const input = z.object({
  completedQuantity: z.number().positive(),
  outputLotCode: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(3).max(500),
  consumptions: z
    .array(z.object({ materialId: z.uuid(), quantity: z.number().positive() }))
    .min(1),
});
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
    const actor = await authorize(request.headers, 'production', 'edit');
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
    const completedAt = new Date();
    const outputMovementId = crypto.randomUUID();
    let outputUnitCost = 0;

    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'production.complete');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`production:${id}`}))`,
      );
      const [order] = await tx
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, id))
        .limit(1);
      if (!order) throw new ApiInputError('PRODUCTION_ORDER_NOT_FOUND', 404);
      if (order.status !== 'IN_PROGRESS')
        throw new ApiInputError('PRODUCTION_ORDER_NOT_IN_PROGRESS', 409);
      if (parsed.data.completedQuantity > Number(order.plannedQuantity))
        throw new ApiInputError('OUTPUT_EXCEEDS_PLANNED_QUANTITY', 409);
      const snapshot = snapshotSchema.safeParse(order.bomSnapshot);
      if (!snapshot.success)
        throw new ApiInputError('BOM_SNAPSHOT_INVALID', 409);
      try {
        assertCompletionSet(
          snapshot.data.lines.map((line) => line.materialId),
          parsed.data.consumptions,
        );
      } catch {
        throw new ApiInputError('CONSUMPTION_SET_MISMATCH', 409);
      }
      const [warehouse] = await tx
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(
          and(eq(warehouses.code, 'PRINCIPAL'), eq(warehouses.active, true)),
        )
        .limit(1);
      if (!warehouse) throw new ApiInputError('WAREHOUSE_NOT_CONFIGURED', 409);
      for (const itemKey of [
        ...parsed.data.consumptions.map(
          (line) => `MATERIAL:${line.materialId}`,
        ),
        `PRODUCT:${order.productVariantId}`,
      ].sort())
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${warehouse.id}:${itemKey}`}))`,
        );

      let totalCost = 0;
      for (const actual of parsed.data.consumptions) {
        const [material] = await tx
          .select({ cost: materials.standardCost, status: materials.status })
          .from(materials)
          .where(eq(materials.id, actual.materialId))
          .limit(1);
        if (!material || material.status === 'INACTIVE')
          throw new ApiInputError('MATERIAL_INACTIVE', 409, {
            materialId: actual.materialId,
          });
        const [balance] = await tx
          .select({
            onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
          })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.warehouseId, warehouse.id),
              eq(inventoryMovements.materialId, actual.materialId),
            ),
          );
        if (Number(balance?.onHand ?? 0) < actual.quantity)
          throw new ApiInputError('INSUFFICIENT_MATERIAL_STOCK', 409, {
            materialId: actual.materialId,
            required: actual.quantity,
            available: Number(balance?.onHand ?? 0),
          });
        const movementId = crypto.randomUUID();
        const unitCost = Number(material.cost ?? 0);
        totalCost += actual.quantity * unitCost;
        await tx.insert(inventoryMovements).values({
          id: movementId,
          warehouseId: warehouse.id,
          materialId: actual.materialId,
          type: 'PRODUCTION_CONSUMPTION',
          quantity: (-actual.quantity).toFixed(6),
          unitCost: material.cost,
          sourceType: 'PRODUCTION_ORDER',
          sourceId: id,
          reason: parsed.data.reason,
          idempotencyKey: `${key}:material:${actual.materialId}`,
          createdBy: actor.id,
        });
        const theoretical = snapshot.data.lines.find(
          (line) => line.materialId === actual.materialId,
        )!.theoreticalQuantity;
        await tx.insert(productionConsumptions).values({
          productionOrderId: id,
          materialId: actual.materialId,
          theoreticalQuantity: theoretical.toFixed(6),
          actualQuantity: actual.quantity.toFixed(6),
          inventoryMovementId: movementId,
        });
        await tx.insert(outboxEvents).values({
          aggregateType: 'inventory_movement',
          aggregateId: movementId,
          eventType: 'ProductionMaterialConsumed',
          payload: {
            productionOrderId: id,
            materialId: actual.materialId,
            theoreticalQuantity: theoretical,
            actualQuantity: actual.quantity,
          },
        });
      }
      outputUnitCost = totalCost / parsed.data.completedQuantity;
      const [existingLot] = await tx
        .select()
        .from(inventoryLots)
        .where(
          and(
            eq(inventoryLots.warehouseId, warehouse.id),
            eq(inventoryLots.lotCode, parsed.data.outputLotCode),
          ),
        )
        .limit(1);
      if (existingLot)
        throw new ApiInputError('OUTPUT_LOT_ALREADY_EXISTS', 409);
      const [lot] = await tx
        .insert(inventoryLots)
        .values({
          warehouseId: warehouse.id,
          productVariantId: order.productVariantId,
          lotCode: parsed.data.outputLotCode,
        })
        .returning({ id: inventoryLots.id });
      await tx.insert(inventoryMovements).values({
        id: outputMovementId,
        warehouseId: warehouse.id,
        lotId: lot!.id,
        productVariantId: order.productVariantId,
        type: 'PRODUCTION_OUTPUT',
        quantity: parsed.data.completedQuantity.toFixed(6),
        unitCost: outputUnitCost.toFixed(2),
        sourceType: 'PRODUCTION_ORDER',
        sourceId: id,
        reason: parsed.data.reason,
        idempotencyKey: `${key}:output`,
        createdBy: actor.id,
      });
      const changed = await tx
        .update(productionOrders)
        .set({
          status: 'COMPLETED',
          completedQuantity: parsed.data.completedQuantity.toFixed(6),
          completedAt,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(productionOrders.id, id),
            eq(productionOrders.status, 'IN_PROGRESS'),
          ),
        )
        .returning({ id: productionOrders.id });
      if (changed.length !== 1)
        throw new ApiInputError('PRODUCTION_ORDER_ALREADY_FINALIZED', 409);
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCTION_ORDER_COMPLETED',
        entityType: 'production_order',
        entityId: id,
        beforeJson: { status: 'IN_PROGRESS' },
        afterJson: {
          status: 'COMPLETED',
          completedQuantity: parsed.data.completedQuantity,
          outputLotCode: parsed.data.outputLotCode,
          outputUnitCost,
          consumptions: parsed.data.consumptions,
        },
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'production_order',
        aggregateId: id,
        eventType: 'ProductionOrderCompleted',
        payload: {
          completedQuantity: parsed.data.completedQuantity,
          outputMovementId,
          outputUnitCost,
        },
      });
      await tx
        .update(idempotencyKeys)
        .set({
          response: {
            id,
            status: 'COMPLETED',
            outputMovementId,
            outputUnitCost,
          },
        })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({
      id,
      status: 'COMPLETED',
      outputMovementId,
      outputUnitCost,
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
