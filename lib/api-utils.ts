import { randomUUID } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { idempotencyKeys } from '@/db/schema';
import type * as schema from '@/db/schema';

export function requireIdempotencyKey(request: Request) {
  const key = request.headers.get('idempotency-key');
  if (!key || key.length > 160)
    throw new ApiInputError('IDEMPOTENCY_KEY_REQUIRED', 400);
  return key;
}

export async function claimIdempotency(
  tx: Parameters<
    Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
  >[0],
  key: string,
  operation: string,
) {
  await tx.insert(idempotencyKeys).values({
    key,
    operation,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
}

export class ApiInputError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiInputError)
    return Response.json(
      { error: error.code, details: error.details },
      { status: error.status },
    );
  if (
    typeof error === 'object' &&
    error &&
    'code' in error &&
    error.code === '23505'
  )
    return Response.json({ error: 'DUPLICATE_OR_REPLAY' }, { status: 409 });
  console.error('Unhandled API error', {
    correlationId: randomUUID(),
    name: error instanceof Error ? error.name : 'UnknownError',
  });
  return Response.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
}
