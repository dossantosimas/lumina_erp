import { asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  customers,
  idempotencyKeys,
  outboxEvents,
  payments,
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

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'orders', 'view');
    const db = getDb();
    const [orders, lines, paymentRows] = await Promise.all([
      db
        .select({
          id: salesOrders.id,
          number: salesOrders.number,
          customer: customers.name,
          status: salesOrders.status,
          total: salesOrders.total,
          costOfGoods: salesOrders.costOfGoods,
          projectionKind: salesOrders.projectionKind,
          createdAt: salesOrders.createdAt,
        })
        .from(salesOrders)
        .innerJoin(customers, eq(salesOrders.customerId, customers.id))
        .orderBy(desc(salesOrders.createdAt)),
      db
        .select({
          id: salesOrderLines.id,
          salesOrderId: salesOrderLines.salesOrderId,
          productVariantId: salesOrderLines.productVariantId,
          product: products.name,
          variant: productVariants.name,
          quantity: salesOrderLines.quantity,
          unitPrice: salesOrderLines.unitPrice,
          unitCostSnapshot: salesOrderLines.unitCostSnapshot,
        })
        .from(salesOrderLines)
        .innerJoin(
          productVariants,
          eq(salesOrderLines.productVariantId, productVariants.id),
        )
        .innerJoin(products, eq(productVariants.productId, products.id))
        .orderBy(asc(products.name)),
      db
        .select({
          id: payments.id,
          salesOrderId: payments.salesOrderId,
          reference: payments.reference,
          amount: payments.amount,
          method: payments.method,
          occurredAt: payments.occurredAt,
        })
        .from(payments)
        .where(isNull(payments.reversedAt)),
    ]);
    return Response.json({
      data: orders.map((order) => ({
        ...order,
        lines: lines.filter((line) => line.salesOrderId === order.id),
        payments: paymentRows.filter(
          (payment) => payment.salesOrderId === order.id,
        ),
      })),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'orders', 'create');
    const key = requireIdempotencyKey(request);
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
    const db = getDb();
    const [customer] = await db
      .select({ status: customers.status })
      .from(customers)
      .where(eq(customers.id, parsed.data.customerId))
      .limit(1);
    if (!customer) throw new ApiInputError('CUSTOMER_NOT_FOUND', 404);
    if (customer.status !== 'ACTIVE')
      throw new ApiInputError('CUSTOMER_INACTIVE', 409);
    const variants = await db
      .select({
        id: productVariants.id,
        variantStatus: productVariants.status,
        productStatus: products.status,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(inArray(productVariants.id, variantIds));
    if (variants.length !== variantIds.length)
      throw new ApiInputError('PRODUCT_NOT_FOUND', 404);
    if (
      variants.some(
        (variant) =>
          variant.variantStatus !== 'ACTIVE' ||
          variant.productStatus !== 'ACTIVE',
      )
    )
      throw new ApiInputError('PRODUCT_INACTIVE', 409);
    const id = crypto.randomUUID();
    const total = parsed.data.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0,
    );
    await db.transaction(async (tx) => {
      await claimIdempotency(tx, key, 'orders.create');
      await tx.insert(salesOrders).values({
        id,
        number: parsed.data.number,
        customerId: parsed.data.customerId,
        total: total.toFixed(2),
        createdBy: actor.id,
      });
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
        operation: 'SALES_ORDER_CREATED',
        entityType: 'sales_order',
        entityId: id,
        afterJson: { ...parsed.data, total },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'sales_order',
        aggregateId: id,
        eventType: 'SalesOrderCreated',
        payload: { number: parsed.data.number, total },
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
