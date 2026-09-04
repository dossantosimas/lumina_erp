import { asc, eq } from 'drizzle-orm';
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
const input = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(100),
  dimension: z.enum(['MASS', 'VOLUME', 'COUNT', 'LENGTH']),
});
export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'catalog', 'view');
    return Response.json({
      data: await getDb().select().from(units).orderBy(asc(units.name)),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'catalog', 'create');
    const key = requireIdempotencyKey(request);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiInputError(
        'VALIDATION_ERROR',
        400,
        z.treeifyError(parsed.error),
      );
    const id = crypto.randomUUID();
    await getDb().transaction(async (tx) => {
      await claimIdempotency(tx, key, 'units.create');
      await tx.insert(units).values({ id, ...parsed.data });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'UNIT_CREATED',
        entityType: 'unit',
        entityId: id,
        afterJson: parsed.data,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'unit',
        aggregateId: id,
        eventType: 'UnitCreated',
        payload: parsed.data,
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
