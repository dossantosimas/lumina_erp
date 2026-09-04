import 'server-only';
import { count, desc, eq, sql, sum } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  inventoryMovements,
  materials,
  productionOrders,
  purchaseOrders,
  financialAccounts,
  financialMovements,
  auditLogs,
  salesOrders,
  user,
} from '@/db/schema';
import type { DashboardAccess } from './get-dashboard-access';

export type DashboardSnapshot = {
  salesTotal: string | null;
  activeOrders: number | null;
  activeProduction: number | null;
  inventoryAlerts: number | null;
  pendingPurchases: number | null;
  cash: string | null;
  grossMargin: string | null;
  recentActivity: {
    id: string;
    operation: string;
    entityType: string;
    actor: string;
    occurredAt: Date;
  }[];
};

export async function getDashboardSnapshot(
  access: DashboardAccess,
): Promise<DashboardSnapshot> {
  const db = getDb();
  const [sales] = access.sales
    ? await db
        .select({ value: sum(salesOrders.total) })
        .from(salesOrders)
        .where(eq(salesOrders.status, 'COMPLETED'))
    : [undefined];
  const [orders] = access.sales
    ? await db
        .select({ value: count() })
        .from(salesOrders)
        .where(sql`${salesOrders.status} not in ('COMPLETED', 'CANCELLED')`)
    : [undefined];
  const [production] = access.production
    ? await db
        .select({ value: count() })
        .from(productionOrders)
        .where(
          sql`${productionOrders.status} not in ('COMPLETED', 'CANCELLED')`,
        )
    : [undefined];
  const [purchases] = access.purchases
    ? await db
        .select({ value: count() })
        .from(purchaseOrders)
        .where(sql`${purchaseOrders.status} not in ('COMPLETED', 'CANCELLED')`)
    : [undefined];
  const [cash] = access.finance
    ? await db
        .select({
          value: sql<string>`coalesce(sum(${financialAccounts.openingBalance}), 0) + coalesce((select sum(${financialMovements.amount}) from ${financialMovements}), 0)`,
        })
        .from(financialAccounts)
    : [undefined];
  const [margin] = access.finance
    ? await db
        .select({
          value: sql<string>`coalesce(sum(${salesOrders.total} - ${salesOrders.costOfGoods}), 0)`,
        })
        .from(salesOrders)
        .where(eq(salesOrders.status, 'COMPLETED'))
    : [undefined];
  const recentActivity = access.audit
    ? await db
        .select({
          id: auditLogs.id,
          operation: auditLogs.operation,
          entityType: auditLogs.entityType,
          actorName: user.name,
          occurredAt: auditLogs.occurredAt,
        })
        .from(auditLogs)
        .leftJoin(user, eq(auditLogs.actorUserId, user.id))
        .orderBy(desc(auditLogs.occurredAt))
        .limit(8)
    : [];
  const balances = access.inventory
    ? await db
        .select({
          minimum: materials.minimumStock,
          onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
        })
        .from(materials)
        .leftJoin(
          inventoryMovements,
          eq(inventoryMovements.materialId, materials.id),
        )
        .groupBy(materials.id)
    : [];
  return {
    salesTotal: access.sales ? (sales?.value ?? '0') : null,
    activeOrders: access.sales ? (orders?.value ?? 0) : null,
    activeProduction: access.production ? (production?.value ?? 0) : null,
    inventoryAlerts: access.inventory
      ? balances.filter((item) => Number(item.onHand) < Number(item.minimum))
          .length
      : null,
    pendingPurchases: access.purchases ? (purchases?.value ?? 0) : null,
    cash: access.finance ? (cash?.value ?? '0') : null,
    grossMargin: access.finance ? (margin?.value ?? '0') : null,
    recentActivity: recentActivity.map(({ actorName, ...activity }) => ({
      ...activity,
      actor: actorName ?? 'Sistema',
    })),
  };
}
