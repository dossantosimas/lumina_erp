import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  inventoryMovements,
  inventoryReservations,
  materials,
  products,
  productVariants,
  units,
  warehouses,
} from '@/db/schema';

export type InventoryItem = {
  itemType: 'MATERIAL' | 'PRODUCT';
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  onHand: string;
  reserved: string;
  available: string;
  minimumStock: string | null;
  status: string;
};

export type InventoryMovementRow = {
  id: string;
  occurredAt: Date;
  type: string;
  item: string;
  quantity: string;
  unitCost: string | null;
  reason: string | null;
  reversalOfId: string | null;
};

export async function getInventorySnapshot() {
  const db = getDb();
  const [warehouse] = await db
    .select({ id: warehouses.id, name: warehouses.name })
    .from(warehouses)
    .where(eq(warehouses.code, 'PRINCIPAL'))
    .limit(1);
  if (!warehouse) throw new Error('WAREHOUSE_NOT_CONFIGURED');

  const [materialRows, productRows, reservationRows, movementRows] =
    await Promise.all([
      db
        .select({
          itemId: materials.id,
          sku: materials.sku,
          name: materials.name,
          unit: units.code,
          onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
          minimumStock: materials.minimumStock,
          status: materials.status,
        })
        .from(materials)
        .innerJoin(units, eq(materials.unitId, units.id))
        .leftJoin(
          inventoryMovements,
          and(
            eq(inventoryMovements.materialId, materials.id),
            eq(inventoryMovements.warehouseId, warehouse.id),
          ),
        )
        .groupBy(materials.id, units.code),
      db
        .select({
          itemId: productVariants.id,
          sku: productVariants.sku,
          name: sql<string>`${products.name} || ' · ' || ${productVariants.name}`,
          unit: units.code,
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
        .groupBy(productVariants.id, products.id, units.code),
      db
        .select({
          itemId: inventoryReservations.productVariantId,
          reserved: sql<string>`coalesce(sum(${inventoryReservations.quantity}), 0)`,
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
          id: inventoryMovements.id,
          occurredAt: inventoryMovements.occurredAt,
          type: inventoryMovements.type,
          materialName: materials.name,
          productName: products.name,
          variantName: productVariants.name,
          quantity: inventoryMovements.quantity,
          unitCost: inventoryMovements.unitCost,
          reason: inventoryMovements.reason,
          reversalOfId: inventoryMovements.reversalOfId,
        })
        .from(inventoryMovements)
        .leftJoin(materials, eq(inventoryMovements.materialId, materials.id))
        .leftJoin(
          productVariants,
          eq(inventoryMovements.productVariantId, productVariants.id),
        )
        .leftJoin(products, eq(productVariants.productId, products.id))
        .where(eq(inventoryMovements.warehouseId, warehouse.id))
        .orderBy(desc(inventoryMovements.occurredAt))
        .limit(50),
    ]);

  const reservedByItem = new Map(
    reservationRows.map((row) => [row.itemId, row.reserved]),
  );
  const items: InventoryItem[] = [
    ...materialRows.map((row) => ({
      itemType: 'MATERIAL' as const,
      ...row,
      reserved: '0',
      available: row.onHand,
    })),
    ...productRows.map((row) => {
      const reserved = reservedByItem.get(row.itemId) ?? '0';
      return {
        itemType: 'PRODUCT' as const,
        ...row,
        reserved,
        available: String(Number(row.onHand) - Number(reserved)),
        minimumStock: null,
      };
    }),
  ];
  const movements: InventoryMovementRow[] = movementRows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    type: row.type,
    item:
      row.materialName ??
      [row.productName, row.variantName].filter(Boolean).join(' · '),
    quantity: row.quantity,
    unitCost: row.unitCost,
    reason: row.reason,
    reversalOfId: row.reversalOfId,
  }));
  return { warehouse, items, movements };
}
