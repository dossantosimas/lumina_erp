import { asc, eq } from 'drizzle-orm';
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

const input = z.object({
  type: z.enum(['B2C', 'B2B']),
  name: z.string().trim().min(2).max(160),
  taxId: z.string().trim().max(40).nullable().default(null),
  email: z.email().nullable().default(null),
  phone: z.string().trim().max(40).nullable().default(null),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'customers', 'view');
    return Response.json({
      data: await getDb().select().from(customers).orderBy(asc(customers.name)),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'customers', 'create');
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
      await claimIdempotency(tx, key, 'customers.create');
      await tx.insert(customers).values({ id, ...parsed.data });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'CUSTOMER_CREATED',
        entityType: 'customer',
        entityId: id,
        afterJson: parsed.data,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'customer',
        aggregateId: id,
        eventType: 'CustomerCreated',
        payload: { type: parsed.data.type, name: parsed.data.name },
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
