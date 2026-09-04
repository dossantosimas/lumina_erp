import { and, eq, ne, sql } from 'drizzle-orm';
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'bom', 'approve');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const db = getDb();
    const [target] = await db
      .select({
        id: bomVersions.id,
        productVariantId: bomVersions.productVariantId,
        status: bomVersions.status,
        productId: productVariants.productId,
      })
      .from(bomVersions)
      .innerJoin(
        productVariants,
        eq(bomVersions.productVariantId, productVariants.id),
      )
      .where(eq(bomVersions.id, id))
      .limit(1);
    if (!target) throw new ApiInputError('BOM_NOT_FOUND', 404);
    if (target.status !== 'DRAFT')
      throw new ApiInputError('BOM_NOT_DRAFT', 409);
    const now = new Date();
    await db.transaction(async (tx) => {
      await claimIdempotency(tx, key, 'boms.activate');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${target.productVariantId}))`,
      );
      const componentRows = await tx
        .select({ status: materials.status })
        .from(bomLines)
        .innerJoin(materials, eq(bomLines.materialId, materials.id))
        .where(eq(bomLines.bomVersionId, id));
      if (componentRows.length === 0) throw new ApiInputError('BOM_EMPTY', 409);
      if (componentRows.some((component) => component.status !== 'ACTIVE'))
        throw new ApiInputError('BOM_REQUIRES_ACTIVE_MATERIALS', 409);
      await tx
        .update(bomVersions)
        .set({ status: 'EXPIRED', validTo: now })
        .where(
          and(
            eq(bomVersions.productVariantId, target.productVariantId),
            eq(bomVersions.status, 'ACTIVE'),
            ne(bomVersions.id, id),
          ),
        );
      const activated = await tx
        .update(bomVersions)
        .set({ status: 'ACTIVE', validFrom: now, validTo: null })
        .where(and(eq(bomVersions.id, id), eq(bomVersions.status, 'DRAFT')))
        .returning({ id: bomVersions.id });
      if (activated.length !== 1) throw new ApiInputError('BOM_NOT_DRAFT', 409);
      await tx
        .update(products)
        .set({ status: 'ACTIVE', updatedAt: now })
        .where(eq(products.id, target.productId));
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'BOM_VERSION_ACTIVATED',
        entityType: 'bom_version',
        entityId: id,
        beforeJson: { status: 'DRAFT' },
        afterJson: { status: 'ACTIVE', validFrom: now.toISOString() },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'bom_version',
        aggregateId: id,
        eventType: 'BomVersionActivated',
        payload: { productVariantId: target.productVariantId },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'ACTIVE' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'ACTIVE' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
