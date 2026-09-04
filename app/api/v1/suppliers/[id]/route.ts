import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  outboxEvents,
  suppliers,
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
    const actor = await authorize(request.headers, 'purchases', 'edit');
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
      await claimIdempotency(tx, key, 'suppliers.update');
      const [before] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('SUPPLIER_NOT_FOUND', 404);
      const { active, ...changes } = parsed.data;
      const [after] = await tx
        .update(suppliers)
        .set({
          ...changes,
          status:
            active === undefined
              ? before.status
              : active
                ? 'ACTIVE'
                : 'INACTIVE',
        })
        .where(eq(suppliers.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'SUPPLIER_UPDATED',
        entityType: 'supplier',
        entityId: id,
        beforeJson: before,
        afterJson: after,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'supplier',
        aggregateId: id,
        eventType: 'SupplierUpdated',
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
    const actor = await authorize(request.headers, 'purchases', 'edit');
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
      await claimIdempotency(tx, key, 'suppliers.deactivate');
      const [before] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('SUPPLIER_NOT_FOUND', 404);
      const [after] = await tx
        .update(suppliers)
        .set({ status: 'INACTIVE' })
        .where(eq(suppliers.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'SUPPLIER_DEACTIVATED',
        entityType: 'supplier',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'supplier',
        aggregateId: id,
        eventType: 'SupplierDeactivated',
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
