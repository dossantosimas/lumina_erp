import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  bomVersions,
  materials,
  productionConsumptions,
  productionOrders,
  products,
  productVariants,
} from '@/db/schema';

const bomSnapshotSchema = z.object({
  version: z.number(),
  expectedYield: z.string(),
  lines: z.array(
    z.object({
      materialId: z.uuid(),
      material: z.string(),
      unit: z.string(),
      theoreticalQuantity: z.number().positive(),
    }),
  ),
});

export async function getProductionSnapshot() {
  const db = getDb();
  const [eligibleRows, orderRows, consumptionRows] = await Promise.all([
    db
      .select({
        productVariantId: productVariants.id,
        product: products.name,
        variant: productVariants.name,
        bomVersion: bomVersions.version,
      })
      .from(bomVersions)
      .innerJoin(
        productVariants,
        eq(bomVersions.productVariantId, productVariants.id),
      )
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(bomVersions.status, 'ACTIVE'),
          eq(products.status, 'ACTIVE'),
          eq(productVariants.status, 'ACTIVE'),
        ),
      )
      .orderBy(asc(products.name)),
    db
      .select({
        id: productionOrders.id,
        number: productionOrders.number,
        productVariantId: productionOrders.productVariantId,
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
  return {
    eligibleProducts: eligibleRows,
    orders: orderRows.map((order) => ({
      ...order,
      bomSnapshot: bomSnapshotSchema.safeParse(order.bomSnapshot).data ?? null,
      consumptions: consumptionRows.filter(
        (line) => line.productionOrderId === order.id,
      ),
    })),
  };
}
