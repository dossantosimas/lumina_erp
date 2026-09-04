import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  customers,
  idempotencyKeys,
  outboxEvents,
  products,
  productVariants,
  salesOrderLines,
  salesOrders,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const input = z.object({
  number: z.string().trim().min(2).max(40),
  customerId: z.uuid(),
  lines: z
    .array(
      z.object({
        productVariantId: z.uuid(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .min(1),
});
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'orders', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const variantIds = [
      ...new Set(parsed.data.lines.map((line) => line.productVariantId)),
    ];
    if (variantIds.length !== parsed.data.lines.length)
      throw new ApiInputError('DUPLICATE_PRODUCT', 400);
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'orders.update');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`sales:${id}`}))`,
      );
      const [before] = await tx
        .select()
        .from(salesOrders)
        .where(eq(salesOrders.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('SALES_ORDER_NOT_FOUND', 404);
      if (before.status !== 'DRAFT')
        throw new ApiInputError('ONLY_DRAFT_CAN_BE_EDITED', 409);
      const [customer] = await tx
        .select({ status: customers.status })
        .from(customers)
        .where(eq(customers.id, parsed.data.customerId))
        .limit(1);
      if (!customer || customer.status !== 'ACTIVE')
        throw new ApiInputError('CUSTOMER_NOT_ACTIVE', 409);
      const variants = await tx
        .select({
          id: productVariants.id,
          variantStatus: productVariants.status,
          productStatus: products.status,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(inArray(productVariants.id, variantIds));
      if (
        variants.length !== variantIds.length ||
        variants.some(
          (row) =>
            row.variantStatus !== 'ACTIVE' || row.productStatus !== 'ACTIVE',
        )
      )
        throw new ApiInputError('PRODUCT_NOT_ACTIVE', 409);
      const total = parsed.data.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice,
        0,
      );
      const [after] = await tx
        .update(salesOrders)
        .set({
          number: parsed.data.number,
          customerId: parsed.data.customerId,
          total: total.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(salesOrders.id, id))
        .returning();
      await tx
        .delete(salesOrderLines)
        .where(eq(salesOrderLines.salesOrderId, id));
      await tx.insert(salesOrderLines).values(
        parsed.data.lines.map((line) => ({
          salesOrderId: id,
          productVariantId: line.productVariantId,
          quantity: line.quantity.toFixed(6),
          unitPrice: line.unitPrice.toFixed(2),
          unitCostSnapshot: '0',
        })),
      );
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'SALES_ORDER_UPDATED',
        entityType: 'sales_order',
        entityId: id,
        beforeJson: before,
        afterJson: { ...after, lines: parsed.data.lines },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'sales_order',
        aggregateId: id,
        eventType: 'SalesOrderUpdated',
        payload: { id, total },
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
