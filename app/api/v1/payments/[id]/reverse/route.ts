import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { payments } from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import { ApiInputError, apiErrorResponse } from '@/lib/api-utils';
import { POST as reverseMovement } from '@/app/api/v1/finance/movements/[id]/reverse/route';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await authorize(request.headers, 'payments', 'create');
    const { id } = await context.params;
    const [payment] = await getDb()
      .select({ movementId: payments.financialMovementId })
      .from(payments)
      .where(and(eq(payments.id, id), isNull(payments.reversedAt)))
      .limit(1);
    if (!payment) throw new ApiInputError('PAYMENT_NOT_FOUND_OR_REVERSED', 404);
    return reverseMovement(request, {
      params: Promise.resolve({ id: payment.movementId }),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
