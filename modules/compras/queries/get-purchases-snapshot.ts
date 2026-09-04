import 'server-only';
import { asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  materials,
  inventoryMovements,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceipts,
  suppliers,
  units,
} from '@/db/schema';

export async function getPurchasesSnapshot() {
  const db = getDb();
  const [supplierRows, materialRows, orderRows, lineRows, receiptRows] =
    await Promise.all([
      db
        .select({
          id: suppliers.id,
          name: suppliers.name,
          taxId: suppliers.taxId,
          email: suppliers.email,
          phone: suppliers.phone,
          status: suppliers.status,
        })
        .from(suppliers)
        .orderBy(asc(suppliers.name)),
      db
        .select({
          id: materials.id,
          sku: materials.sku,
          name: materials.name,
          unit: units.code,
          status: materials.status,
        })
        .from(materials)
        .innerJoin(units, eq(materials.unitId, units.id))
        .orderBy(asc(materials.name)),
      db
        .select({
          id: purchaseOrders.id,
          number: purchaseOrders.number,
          supplierId: purchaseOrders.supplierId,
          supplier: suppliers.name,
          status: purchaseOrders.status,
          total: purchaseOrders.total,
          createdAt: purchaseOrders.createdAt,
        })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .orderBy(desc(purchaseOrders.createdAt)),
      db
        .select({
          id: purchaseOrderLines.id,
          purchaseOrderId: purchaseOrderLines.purchaseOrderId,
          materialId: purchaseOrderLines.materialId,
          material: materials.name,
          unit: units.code,
          orderedQuantity: purchaseOrderLines.orderedQuantity,
          receivedQuantity: purchaseOrderLines.receivedQuantity,
          unitCost: purchaseOrderLines.unitCost,
        })
        .from(purchaseOrderLines)
        .innerJoin(materials, eq(purchaseOrderLines.materialId, materials.id))
        .innerJoin(units, eq(materials.unitId, units.id)),
      db
        .select({
          id: purchaseReceipts.id,
          number: purchaseReceipts.number,
          purchaseOrderId: purchaseReceipts.purchaseOrderId,
          receivedAt: purchaseReceipts.receivedAt,
        })
        .from(purchaseReceipts)
        .orderBy(desc(purchaseReceipts.receivedAt)),
    ]);
  const reversedReceiptRows = await db
    .select({ id: inventoryMovements.sourceId })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.sourceType, 'PURCHASE_RECEIPT_REVERSAL'));
  const reversedReceiptIds = new Set(reversedReceiptRows.map((row) => row.id));
  return {
    suppliers: supplierRows,
    materials: materialRows,
    orders: orderRows.map((order) => ({
      ...order,
      lines: lineRows.filter((line) => line.purchaseOrderId === order.id),
      receipts: receiptRows
        .filter((receipt) => receipt.purchaseOrderId === order.id)
        .map((receipt) => ({
          ...receipt,
          reversed: reversedReceiptIds.has(receipt.id),
        })),
    })),
  };
}
