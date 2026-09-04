import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  customers,
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
    type: z.enum(['B2C', 'B2B']).optional(),
    name: z.string().trim().min(2).max(160).optional(),
    taxId: z.string().trim().max(40).nullable().optional(),
    email: z.email().nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'EMPTY_UPDATE');
const deactivateInput = z.object({ reason: z.string().trim().min(3).max(500) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'customers', 'edit');
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
      await claimIdempotency(tx, key, 'customers.update');
      const [before] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('CUSTOMER_NOT_FOUND', 404);
      const { active, ...changes } = parsed.data;
      const [after] = await tx
        .update(customers)
        .set({
          ...changes,
          status:
            active === undefined
              ? before.status
              : active
                ? 'ACTIVE'
                : 'INACTIVE',
        })
        .where(eq(customers.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'CUSTOMER_UPDATED',
        entityType: 'customer',
        entityId: id,
        beforeJson: before,
        afterJson: after,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'customer',
        aggregateId: id,
        eventType: 'CustomerUpdated',
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
    const actor = await authorize(request.headers, 'customers', 'edit');
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
      await claimIdempotency(tx, key, 'customers.deactivate');
      const [before] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('CUSTOMER_NOT_FOUND', 404);
      const [after] = await tx
        .update(customers)
        .set({ status: 'INACTIVE' })
        .where(eq(customers.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'CUSTOMER_DEACTIVATED',
        entityType: 'customer',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'customer',
        aggregateId: id,
        eventType: 'CustomerDeactivated',
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
