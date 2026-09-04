import { accessErrorResponse, authorize } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-utils';
import { getInventorySnapshot } from '@/modules/inventario/queries/get-inventory-snapshot';

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'inventory', 'view');
    return Response.json({ data: await getInventorySnapshot() });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
