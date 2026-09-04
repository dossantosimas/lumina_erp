import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  outboxEvents,
  productionOrders,
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
  plannedQuantity: z.number().positive(),
});
const snapshotSchema = z
  .object({
    lines: z.array(z.object({ theoreticalQuantity: z.number() }).loose()),
  })
  .loose();
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'production', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'production.update');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`production:${id}`}))`,
      );
      const [before] = await tx
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('PRODUCTION_ORDER_NOT_FOUND', 404);
      if (before.status !== 'DRAFT')
        throw new ApiInputError('ONLY_DRAFT_CAN_BE_EDITED', 409);
      const snapshot = snapshotSchema.parse(before.bomSnapshot);
      const ratio =
        parsed.data.plannedQuantity / Number(before.plannedQuantity);
      const bomSnapshot = {
        ...snapshot,
        capturedAt: new Date().toISOString(),
        lines: snapshot.lines.map((line) => ({
          ...line,
          theoreticalQuantity: line.theoreticalQuantity * ratio,
        })),
      };
      const [after] = await tx
        .update(productionOrders)
        .set({
          number: parsed.data.number,
          plannedQuantity: parsed.data.plannedQuantity.toFixed(6),
          bomSnapshot,
          updatedAt: new Date(),
        })
        .where(eq(productionOrders.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'PRODUCTION_ORDER_UPDATED',
        entityType: 'production_order',
        entityId: id,
        beforeJson: before,
        afterJson: after,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'production_order',
        aggregateId: id,
        eventType: 'ProductionOrderUpdated',
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
