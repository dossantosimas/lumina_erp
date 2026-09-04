import 'server-only';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  customers,
  financialAccounts,
  inventoryMovements,
  inventoryReservations,
  payments,
  products,
  productVariants,
  salesOrderLines,
  salesOrders,
  units,
  warehouses,
} from '@/db/schema';

export async function getSalesSnapshot() {
  const db = getDb();
  const [warehouse] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(eq(warehouses.code, 'PRINCIPAL'))
    .limit(1);
  if (!warehouse) throw new Error('WAREHOUSE_NOT_CONFIGURED');
  const [
    customerRows,
    productRows,
    reservationRows,
    orderRows,
    lineRows,
    paymentRows,
    accountRows,
  ] = await Promise.all([
    db
      .select({
        id: customers.id,
        type: customers.type,
        name: customers.name,
        taxId: customers.taxId,
        email: customers.email,
        phone: customers.phone,
        status: customers.status,
      })
      .from(customers)
      .orderBy(asc(customers.name)),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        name: sql<string>`${products.name} || ' · ' || ${productVariants.name}`,
        unit: units.code,
        salePrice: products.salePrice,
        onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
        status: productVariants.status,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .innerJoin(units, eq(products.baseUnitId, units.id))
      .leftJoin(
        inventoryMovements,
        and(
          eq(inventoryMovements.productVariantId, productVariants.id),
          eq(inventoryMovements.warehouseId, warehouse.id),
        ),
      )
      .where(eq(products.status, 'ACTIVE'))
      .groupBy(productVariants.id, products.id, units.code)
      .orderBy(asc(products.name)),
    db
      .select({
        productVariantId: inventoryReservations.productVariantId,
        quantity: sql<string>`coalesce(sum(${inventoryReservations.quantity}), 0)`,
      })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.warehouseId, warehouse.id),
          isNull(inventoryReservations.releasedAt),
        ),
      )
      .groupBy(inventoryReservations.productVariantId),
    db
      .select({
        id: salesOrders.id,
        number: salesOrders.number,
        customerId: salesOrders.customerId,
        customer: customers.name,
        status: salesOrders.status,
        total: salesOrders.total,
        costOfGoods: salesOrders.costOfGoods,
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
      .innerJoin(products, eq(productVariants.productId, products.id)),
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
    db
      .select({ id: financialAccounts.id, name: financialAccounts.name })
      .from(financialAccounts)
      .where(eq(financialAccounts.status, 'ACTIVE'))
      .orderBy(asc(financialAccounts.name)),
  ]);
  const reserved = new Map(
    reservationRows.map((row) => [row.productVariantId, row.quantity]),
  );
  return {
    customers: customerRows,
    products: productRows.map((product) => ({
      ...product,
      reserved: reserved.get(product.id) ?? '0',
      available: String(
        Number(product.onHand) - Number(reserved.get(product.id) ?? 0),
      ),
    })),
    accounts: accountRows,
    orders: orderRows.map((order) => ({
      ...order,
      lines: lineRows.filter((line) => line.salesOrderId === order.id),
      payments: paymentRows.filter(
        (payment) => payment.salesOrderId === order.id,
      ),
    })),
  };
}
