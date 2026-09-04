import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { auditLogs, idempotencyKeys, outboxEvents, units } from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';
const patchInput = z
  .object({
    code: z.string().trim().min(1).max(20).optional(),
    name: z.string().trim().min(2).max(100).optional(),
    dimension: z.enum(['MASS', 'VOLUME', 'COUNT', 'LENGTH']).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'EMPTY_UPDATE');
const deleteInput = z.object({ reason: z.string().trim().min(3).max(500) });
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'catalog', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = patchInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'units.update');
      const [before] = await tx
        .select()
        .from(units)
        .where(eq(units.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('UNIT_NOT_FOUND', 404);
      const { active, ...changes } = parsed.data;
      const [after] = await tx
        .update(units)
        .set({
          ...changes,
          status:
            active === undefined
              ? before.status
              : active
                ? 'ACTIVE'
                : 'INACTIVE',
        })
        .where(eq(units.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'UNIT_UPDATED',
        entityType: 'unit',
        entityId: id,
        beforeJson: before,
        afterJson: after,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'unit',
        aggregateId: id,
        eventType: 'UnitUpdated',
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
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'catalog', 'edit');
    const key = requireIdempotencyKey(request);
    const { id } = await context.params;
    const parsed = deleteInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'units.deactivate');
      const [before] = await tx
        .select()
        .from(units)
        .where(eq(units.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('UNIT_NOT_FOUND', 404);
      const [after] = await tx
        .update(units)
        .set({ status: 'INACTIVE' })
        .where(eq(units.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'UNIT_DEACTIVATED',
        entityType: 'unit',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'unit',
        aggregateId: id,
        eventType: 'UnitDeactivated',
        payload: { id },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'INACTIVE' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'INACTIVE' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
