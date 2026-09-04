import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { expenses } from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import { ApiInputError, apiErrorResponse } from '@/lib/api-utils';
import { POST as reverseMovement } from '@/app/api/v1/finance/movements/[id]/reverse/route';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await authorize(request.headers, 'expenses', 'edit');
    const { id } = await context.params;
    const [expense] = await getDb()
      .select({ movementId: expenses.financialMovementId })
      .from(expenses)
      .where(and(eq(expenses.id, id), isNull(expenses.reversedAt)))
      .limit(1);
    if (!expense) throw new ApiInputError('EXPENSE_NOT_FOUND_OR_REVERSED', 404);
    return reverseMovement(request, {
      params: Promise.resolve({ id: expense.movementId }),
    });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
