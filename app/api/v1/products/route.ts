import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  categories,
  idempotencyKeys,
  outboxEvents,
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

const input = z.object({
  sku: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  baseUnitId: z.uuid(),
  categoryId: z.uuid().nullable(),
  salePrice: z.number().nonnegative().nullable(),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'catalog', 'view');
    const data = await getDb()
      .select({
        id: products.id,
        variantId: productVariants.id,
        sku: productVariants.sku,
        name: products.name,
        variant: productVariants.name,
        unitId: products.baseUnitId,
        unit: units.code,
        category: categories.name,
        salePrice: products.salePrice,
        status: products.status,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(units, eq(products.baseUnitId, units.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(asc(products.name));
    return Response.json({ data });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'catalog', 'create');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const productId = crypto.randomUUID();
    const variantId = crypto.randomUUID();
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'products.create');
      await tx.insert(products).values({
        id: productId,
        sku: parsed.data.sku,
        name: parsed.data.name,
        baseUnitId: parsed.data.baseUnitId,
        categoryId: parsed.data.categoryId,
        salePrice: parsed.data.salePrice?.toFixed(2) ?? null,
        status: 'PENDING',
      });
      await tx.insert(productVariants).values({
        id: variantId,
        productId,
        sku: parsed.data.sku,
        name: 'Estándar',
        attributes: {},
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCT_CREATED',
        entityType: 'product',
        entityId: productId,
        afterJson: parsed.data,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'product',
        aggregateId: productId,
        eventType: 'ProductCreated',
        payload: { sku: parsed.data.sku, variantId },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { productId, variantId } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ productId, variantId }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
