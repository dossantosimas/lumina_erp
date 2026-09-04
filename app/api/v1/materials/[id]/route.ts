import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  materials,
  outboxEvents,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const patchInput = z
  .object({
    sku: z.string().trim().min(2).max(40).optional(),
    name: z.string().trim().min(2).max(160).optional(),
    unitId: z.uuid().optional(),
    standardCost: z.number().nonnegative().nullable().optional(),
    minimumStock: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'EMPTY_UPDATE');

const deactivateInput = z.object({ reason: z.string().trim().min(3).max(500) });

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
      await claimIdempotency(tx, key, 'materials.update');
      const [before] = await tx
        .select()
        .from(materials)
        .where(eq(materials.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('MATERIAL_NOT_FOUND', 404);
      const standardCost =
        parsed.data.standardCost === undefined
          ? before.standardCost
          : (parsed.data.standardCost?.toFixed(2) ?? null);
      const { active, ...changes } = parsed.data;
      const [after] = await tx
        .update(materials)
        .set({
          ...changes,
          standardCost,
          minimumStock: parsed.data.minimumStock?.toFixed(6),
          status:
            active === false
              ? 'INACTIVE'
              : active === true
                ? standardCost === null
                  ? 'PENDING'
                  : 'ACTIVE'
                : before.status === 'INACTIVE'
                  ? 'INACTIVE'
                  : standardCost === null
                    ? 'PENDING'
                    : 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(eq(materials.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'MATERIAL_UPDATED',
        entityType: 'material',
        entityId: id,
        beforeJson: before,
        afterJson: after,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'material',
        aggregateId: id,
        eventType: 'MaterialUpdated',
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
    const parsed = deactivateInput.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'materials.deactivate');
      const [before] = await tx
        .select()
        .from(materials)
        .where(eq(materials.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('MATERIAL_NOT_FOUND', 404);
      const [after] = await tx
        .update(materials)
        .set({ status: 'INACTIVE', updatedAt: new Date() })
        .where(eq(materials.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'MATERIAL_DEACTIVATED',
        entityType: 'material',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'material',
        aggregateId: id,
        eventType: 'MaterialDeactivated',
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
