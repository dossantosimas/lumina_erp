import { asc, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  bomLines,
  bomVersions,
  idempotencyKeys,
  materials,
  outboxEvents,
  products,
  productVariants,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const input = z.object({
  productVariantId: z.uuid(),
  expectedYield: z.number().positive(),
  standardWastePct: z.number().min(0).max(100).default(0),
  lines: z
    .array(
      z.object({
        materialId: z.uuid(),
        quantity: z.number().positive(),
        unitId: z.uuid(),
        wastePct: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'bom', 'view');
    const db = getDb();
    const versions = await db
      .select({
        id: bomVersions.id,
        productVariantId: bomVersions.productVariantId,
        product: products.name,
        variant: productVariants.name,
        version: bomVersions.version,
        status: bomVersions.status,
        expectedYield: bomVersions.expectedYield,
        standardWastePct: bomVersions.standardWastePct,
        estimatedCost: bomVersions.estimatedCost,
        validFrom: bomVersions.validFrom,
      })
      .from(bomVersions)
      .innerJoin(
        productVariants,
        eq(bomVersions.productVariantId, productVariants.id),
      )
      .innerJoin(products, eq(productVariants.productId, products.id))
      .orderBy(asc(products.name), asc(bomVersions.version));
    const lines = await db
      .select({
        id: bomLines.id,
        bomVersionId: bomLines.bomVersionId,
        materialId: bomLines.materialId,
        material: materials.name,
        quantity: bomLines.quantity,
        unitId: bomLines.unitId,
        wastePct: bomLines.wastePct,
      })
      .from(bomLines)
      .innerJoin(materials, eq(bomLines.materialId, materials.id));
    return Response.json({
      data: versions.map((version) => ({
        ...version,
        lines: lines.filter((line) => line.bomVersionId === version.id),
      })),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'bom', 'create');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const [variant] = await getDb()
      .select({ id: productVariants.id, status: productVariants.status })
      .from(productVariants)
      .where(eq(productVariants.id, parsed.data.productVariantId))
      .limit(1);
    if (!variant) throw new ApiInputError('PRODUCT_VARIANT_NOT_FOUND', 404);
    if (variant.status !== 'ACTIVE')
      throw new ApiInputError('PRODUCT_VARIANT_INACTIVE', 409);
    const materialIds = [
      ...new Set(parsed.data.lines.map((line) => line.materialId)),
    ];
    if (materialIds.length !== parsed.data.lines.length)
      throw new ApiInputError('DUPLICATE_MATERIAL', 400);
    const materialRows = await getDb()
      .select({
        id: materials.id,
        unitId: materials.unitId,
        standardCost: materials.standardCost,
        status: materials.status,
      })
      .from(materials)
      .where(inArray(materials.id, materialIds));
    if (materialRows.length !== materialIds.length)
      throw new ApiInputError('UNKNOWN_MATERIAL', 400);
    if (materialRows.some((material) => material.status !== 'ACTIVE'))
      throw new ApiInputError('BOM_REQUIRES_ACTIVE_MATERIALS', 409);
    for (const line of parsed.data.lines)
      if (
        materialRows.find((material) => material.id === line.materialId)
          ?.unitId !== line.unitId
      )
        throw new ApiInputError('UNIT_CONVERSION_REQUIRED', 400);
    const estimatedCost =
      parsed.data.lines.reduce(
        (total, line) =>
          total +
          line.quantity *
            Number(
              materialRows.find((material) => material.id === line.materialId)
                ?.standardCost ?? 0,
            ) *
            (1 + line.wastePct / 100),
        0,
      ) / parsed.data.expectedYield;
    const id = crypto.randomUUID();
    const version = await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'boms.create');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${parsed.data.productVariantId}))`,
      );
      const [latest] = await tx
        .select({ version: max(bomVersions.version) })
        .from(bomVersions)
        .where(eq(bomVersions.productVariantId, parsed.data.productVariantId));
      const nextVersion = Number(latest?.version ?? 0) + 1;
      await tx.insert(bomVersions).values({
        id,
        productVariantId: parsed.data.productVariantId,
        version: nextVersion,
        expectedYield: parsed.data.expectedYield.toFixed(6),
        standardWastePct: parsed.data.standardWastePct.toFixed(4),
        estimatedCost: estimatedCost.toFixed(2),
        createdBy: actor.id,
      });
      await tx.insert(bomLines).values(
        parsed.data.lines.map((line) => ({
          bomVersionId: id,
          materialId: line.materialId,
          quantity: line.quantity.toFixed(6),
          unitId: line.unitId,
          wastePct: line.wastePct.toFixed(4),
        })),
      );
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'BOM_VERSION_CREATED',
        entityType: 'bom_version',
        entityId: id,
        afterJson: { ...parsed.data, version: nextVersion, estimatedCost },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'bom_version',
        aggregateId: id,
        eventType: 'BomVersionCreated',
        payload: {
          productVariantId: parsed.data.productVariantId,
          version: nextVersion,
        },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, version: nextVersion } })
        .where(eq(idempotencyKeys.key, key));
      return nextVersion;
    });
    return Response.json({ id, version }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
