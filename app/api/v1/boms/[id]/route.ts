import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  bomVersions,
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
const input = z.object({ reason: z.string().trim().min(3).max(500) });
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'bom', 'edit');
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
      await claimIdempotency(tx, key, 'boms.discard');
      const [before] = await tx
        .select()
        .from(bomVersions)
        .where(eq(bomVersions.id, id))
        .limit(1);
      if (!before) throw new ApiInputError('BOM_NOT_FOUND', 404);
      if (before.status !== 'DRAFT')
        throw new ApiInputError('ONLY_DRAFT_BOM_CAN_BE_DISCARDED', 409);
      const [after] = await tx
        .update(bomVersions)
        .set({ status: 'EXPIRED', validTo: new Date() })
        .where(eq(bomVersions.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'BOM_VERSION_DISCARDED',
        entityType: 'bom_version',
        entityId: id,
        beforeJson: before,
        afterJson: after,
        reason: parsed.data.reason,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'bom_version',
        aggregateId: id,
        eventType: 'BomVersionDiscarded',
        payload: { id },
      });
      await tx
        .update(idempotencyKeys)
        .set({ response: { id, status: 'EXPIRED' } })
        .where(eq(idempotencyKeys.key, key));
    });
    return Response.json({ id, status: 'EXPIRED' });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
