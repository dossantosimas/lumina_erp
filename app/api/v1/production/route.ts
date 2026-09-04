import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  bomLines,
  bomVersions,
  idempotencyKeys,
  materials,
  outboxEvents,
  productionConsumptions,
  productionOrders,
  products,
  productVariants,
  units,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';
import { theoreticalConsumption } from '@/modules/produccion/domain/bom-rules';

const input = z.object({
  number: z.string().trim().min(2).max(40),
  productVariantId: z.uuid(),
  plannedQuantity: z.number().positive(),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'production', 'view');
    const db = getDb();
    const [orders, consumptions] = await Promise.all([
      db
        .select({
          id: productionOrders.id,
          number: productionOrders.number,
          product: products.name,
          variant: productVariants.name,
          status: productionOrders.status,
          plannedQuantity: productionOrders.plannedQuantity,
          completedQuantity: productionOrders.completedQuantity,
          bomSnapshot: productionOrders.bomSnapshot,
          startedAt: productionOrders.startedAt,
          completedAt: productionOrders.completedAt,
          createdAt: productionOrders.createdAt,
        })
        .from(productionOrders)
        .innerJoin(
          productVariants,
          eq(productionOrders.productVariantId, productVariants.id),
        )
        .innerJoin(products, eq(productVariants.productId, products.id))
        .orderBy(desc(productionOrders.createdAt)),
      db
        .select({
          productionOrderId: productionConsumptions.productionOrderId,
          material: materials.name,
          theoreticalQuantity: productionConsumptions.theoreticalQuantity,
          actualQuantity: productionConsumptions.actualQuantity,
        })
        .from(productionConsumptions)
        .innerJoin(
          materials,
          eq(productionConsumptions.materialId, materials.id),
        ),
    ]);
    return Response.json({
      data: orders.map((order) => ({
        ...order,
        consumptions: consumptions.filter(
          (line) => line.productionOrderId === order.id,
        ),
      })),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'production', 'create');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const db = getDb();
    const now = new Date();
    const [bom] = await db
      .select({
        id: bomVersions.id,
        version: bomVersions.version,
        expectedYield: bomVersions.expectedYield,
        standardWastePct: bomVersions.standardWastePct,
        productStatus: products.status,
        variantStatus: productVariants.status,
      })
      .from(bomVersions)
      .innerJoin(
        productVariants,
        eq(bomVersions.productVariantId, productVariants.id),
      )
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(bomVersions.productVariantId, parsed.data.productVariantId),
          eq(bomVersions.status, 'ACTIVE'),
          lte(bomVersions.validFrom, now),
          or(isNull(bomVersions.validTo), gte(bomVersions.validTo, now)),
        ),
      )
      .limit(1);
    if (!bom) throw new ApiInputError('ACTIVE_BOM_NOT_FOUND', 409);
    if (bom.productStatus !== 'ACTIVE' || bom.variantStatus !== 'ACTIVE')
      throw new ApiInputError('PRODUCT_INACTIVE', 409);
    const lines = await db
      .select({
        materialId: bomLines.materialId,
        material: materials.name,
        unitId: bomLines.unitId,
        unit: units.code,
        quantity: bomLines.quantity,
        wastePct: bomLines.wastePct,
        standardCost: materials.standardCost,
        materialStatus: materials.status,
      })
      .from(bomLines)
      .innerJoin(materials, eq(bomLines.materialId, materials.id))
      .innerJoin(units, eq(bomLines.unitId, units.id))
      .where(eq(bomLines.bomVersionId, bom.id));
    if (
      lines.length === 0 ||
      lines.some((line) => line.materialStatus !== 'ACTIVE')
    )
      throw new ApiInputError('BOM_INVALID_COMPONENTS', 409);
    const snapshot = {
      bomVersionId: bom.id,
      version: bom.version,
      expectedYield: bom.expectedYield,
      standardWastePct: bom.standardWastePct,
      capturedAt: now.toISOString(),
      lines: lines.map((line) => ({
        ...line,
        theoreticalQuantity: theoreticalConsumption(
          Number(line.quantity),
          Number(bom.expectedYield),
          parsed.data.plannedQuantity,
          Number(line.wastePct),
        ),
      })),
    };
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await claimIdempotency(tx, key, 'production.create');
      await tx.insert(productionOrders).values({
        id,
        number: parsed.data.number,
        productVariantId: parsed.data.productVariantId,
        bomVersionId: bom.id,
        bomSnapshot: snapshot,
        plannedQuantity: parsed.data.plannedQuantity.toFixed(6),
        createdBy: actor.id,
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCTION_ORDER_CREATED',
        entityType: 'production_order',
        entityId: id,
        afterJson: {
          ...parsed.data,
          bomVersionId: bom.id,
          bomVersion: bom.version,
        },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'production_order',
        aggregateId: id,
        eventType: 'ProductionOrderCreated',
        payload: {
          number: parsed.data.number,
          productVariantId: parsed.data.productVariantId,
          bomVersionId: bom.id,
        },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
