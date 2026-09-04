import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  idempotencyKeys,
  materials,
  outboxEvents,
  units,
} from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import {
  ApiInputError,
  apiErrorResponse,
  claimIdempotency,
  requireIdempotencyKey,
} from '@/lib/api-utils';

const input = z.object({
  sku: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  unitId: z.uuid(),
  standardCost: z.number().nonnegative().nullable(),
  minimumStock: z.number().nonnegative().default(0),
});

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'catalog', 'view');
    const data = await getDb()
      .select({
        id: materials.id,
        sku: materials.sku,
        name: materials.name,
        unitId: materials.unitId,
        unit: units.code,
        standardCost: materials.standardCost,
        minimumStock: materials.minimumStock,
        status: materials.status,
      })
      .from(materials)
      .innerJoin(units, eq(materials.unitId, units.id))
      .orderBy(asc(materials.name));
    return Response.json({ data });
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
      await claimIdempotency(tx, key, 'materials.create');
      await tx.insert(materials).values({
        id,
        ...parsed.data,
        standardCost: parsed.data.standardCost?.toFixed(2) ?? null,
        minimumStock: parsed.data.minimumStock.toFixed(6),
        status: parsed.data.standardCost === null ? 'PENDING' : 'ACTIVE',
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'MATERIAL_CREATED',
        entityType: 'material',
        entityId: id,
        afterJson: parsed.data,
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'material',
        aggregateId: id,
        eventType: 'MaterialCreated',
        payload: { sku: parsed.data.sku },
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
