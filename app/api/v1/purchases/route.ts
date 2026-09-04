import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  materials,
  outboxEvents,
  purchaseOrderLines,
  purchaseOrders,
  suppliers,
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
  supplierId: z.uuid(),
  lines: z
    .array(
      z.object({
        materialId: z.uuid(),
        quantity: z.number().positive(),
        unitCost: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'purchases', 'view');
    const db = getDb();
    const [orders, lines] = await Promise.all([
      db
        .select({
          id: purchaseOrders.id,
          number: purchaseOrders.number,
          supplier: suppliers.name,
          status: purchaseOrders.status,
          total: purchaseOrders.total,
          orderedAt: purchaseOrders.orderedAt,
          createdAt: purchaseOrders.createdAt,
        })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .orderBy(asc(purchaseOrders.number)),
      db
        .select({
          id: purchaseOrderLines.id,
          purchaseOrderId: purchaseOrderLines.purchaseOrderId,
          materialId: purchaseOrderLines.materialId,
          material: materials.name,
          orderedQuantity: purchaseOrderLines.orderedQuantity,
          receivedQuantity: purchaseOrderLines.receivedQuantity,
          unitCost: purchaseOrderLines.unitCost,
        })
        .from(purchaseOrderLines)
        .innerJoin(materials, eq(purchaseOrderLines.materialId, materials.id)),
    ]);
    return Response.json({
      data: orders.map((order) => ({
        ...order,
        lines: lines.filter((line) => line.purchaseOrderId === order.id),
      })),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'purchases', 'create');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const materialIds = [
      ...new Set(parsed.data.lines.map((line) => line.materialId)),
    ];
    if (materialIds.length !== parsed.data.lines.length)
      throw new ApiInputError('DUPLICATE_MATERIAL', 400);
    const db = getDb();
    const [supplier] = await db
      .select({ status: suppliers.status })
      .from(suppliers)
      .where(eq(suppliers.id, parsed.data.supplierId))
      .limit(1);
    if (!supplier) throw new ApiInputError('SUPPLIER_NOT_FOUND', 404);
    if (supplier.status !== 'ACTIVE')
      throw new ApiInputError('SUPPLIER_INACTIVE', 409);
    const materialRows = await db
      .select({ id: materials.id, status: materials.status })
      .from(materials)
      .where(inArray(materials.id, materialIds));
    if (materialRows.length !== materialIds.length)
      throw new ApiInputError('MATERIAL_NOT_FOUND', 404);
    if (materialRows.some((material) => material.status === 'INACTIVE'))
      throw new ApiInputError('MATERIAL_INACTIVE', 409);
    const id = crypto.randomUUID();
    const total = parsed.data.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitCost,
      0,
    );
    await db.transaction(async (tx) => {
      await claimIdempotency(tx, key, 'purchases.create');
      await tx.insert(purchaseOrders).values({
        id,
        number: parsed.data.number,
        supplierId: parsed.data.supplierId,
        total: total.toFixed(2),
        createdBy: actor.id,
      });
      await tx.insert(purchaseOrderLines).values(
        parsed.data.lines.map((line) => ({
          purchaseOrderId: id,
          materialId: line.materialId,
          orderedQuantity: line.quantity.toFixed(6),
          unitCost: line.unitCost.toFixed(2),
        })),
      );
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PURCHASE_ORDER_CREATED',
        entityType: 'purchase_order',
        entityId: id,
        afterJson: { ...parsed.data, total },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'purchase_order',
        aggregateId: id,
        eventType: 'PurchaseOrderCreated',
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
