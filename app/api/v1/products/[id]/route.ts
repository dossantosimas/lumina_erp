import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  bomVersions,
  idempotencyKeys,
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

const patchInput = z
  .object({
    sku: z.string().trim().min(2).max(40).optional(),
    name: z.string().trim().min(2).max(160).optional(),
    categoryId: z.uuid().nullable().optional(),
    salePrice: z.number().nonnegative().nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'EMPTY_UPDATE');

const deactivateInput = z.object({ reason: z.string().trim().min(3).max(500) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'catalog', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = patchInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'products.update');
      const [before] = await tx
        .select()
        .from(products)
        .where(eq(products.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('PRODUCT_NOT_FOUND', 404);
      const salePrice =
        parsed.data.salePrice === undefined
          ? before.salePrice
          : (parsed.data.salePrice?.toFixed(2) ?? null);
      const { active, ...changes } = parsed.data;
      const [after] = await tx
        .update(products)
        .set({
          ...changes,
          salePrice,
          status:
            active === undefined
              ? before.status
              : active
                ? 'PENDING'
                : 'INACTIVE',
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();
      if (parsed.data.sku)
        await tx
          .update(productVariants)
          .set({ sku: parsed.data.sku })
          .where(
            and(
              eq(productVariants.productId, id),
              eq(productVariants.name, 'Estándar'),
            ),
          );
      if (active !== undefined)
        await tx
          .update(productVariants)
          .set({ status: active ? 'ACTIVE' : 'INACTIVE' })
          .where(eq(productVariants.productId, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCT_UPDATED',
        entityType: 'product',
        entityId: id,
        beforeJson: before,
        afterJson: after,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'product',
        aggregateId: id,
        eventType: 'ProductUpdated',
        payload: { id },
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
    const actor = await authorize(request.headers, 'catalog', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = deactivateInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'products.deactivate');
      const [before] = await tx
        .select()
        .from(products)
        .where(eq(products.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('PRODUCT_NOT_FOUND', 404);
      const [after] = await tx
        .update(products)
        .set({ status: 'INACTIVE', updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning();
      const variants = await tx
        .update(productVariants)
        .set({ status: 'INACTIVE' })
        .where(eq(productVariants.productId, id))
        .returning({ id: productVariants.id });
      for (const variant of variants)
        await tx
          .update(bomVersions)
          .set({ status: 'EXPIRED', validTo: new Date() })
          .where(
            and(
              eq(bomVersions.productVariantId, variant.id),
              eq(bomVersions.status, 'ACTIVE'),
            ),
          );
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCT_DEACTIVATED',
        entityType: 'product',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'product',
        aggregateId: id,
        eventType: 'ProductDeactivated',
        payload: { id },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'INACTIVE' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'INACTIVE' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
