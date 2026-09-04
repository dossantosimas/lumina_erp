import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  categories,
  idempotencyKeys,
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
    name: z.string().trim().min(2).max(100).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100)
      .optional(),
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
      await claimIdempotency(tx, key, 'categories.update');
      const [before] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('CATEGORY_NOT_FOUND', 404);
      const { active, ...changes } = parsed.data;
      const [after] = await tx
        .update(categories)
        .set({
          ...changes,
          status:
            active === undefined
              ? before.status
              : active
                ? 'ACTIVE'
                : 'INACTIVE',
        })
        .where(eq(categories.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'CATEGORY_UPDATED',
        entityType: 'category',
        entityId: id,
        beforeJson: before,
        afterJson: after,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'category',
        aggregateId: id,
        eventType: 'CategoryUpdated',
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
      await claimIdempotency(tx, key, 'categories.deactivate');
      const [before] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('CATEGORY_NOT_FOUND', 404);
      const [after] = await tx
        .update(categories)
        .set({ status: 'INACTIVE' })
        .where(eq(categories.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'CATEGORY_DEACTIVATED',
        entityType: 'category',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'category',
        aggregateId: id,
        eventType: 'CategoryDeactivated',
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
