import { asc } from 'drizzle-orm';
import { getDb } from '@/db';
import { categories, units } from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-utils';

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'catalog', 'view');
    const [unitRows, categoryRows] = await Promise.all([
      getDb()
        .select({
          id: units.id,
          code: units.code,
          name: units.name,
          dimension: units.dimension,
        })
        .from(units)
        .orderBy(asc(units.dimension), asc(units.name)),
      getDb()
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .orderBy(asc(categories.name)),
    ]);
    return Response.json({ units: unitRows, categories: categoryRows });
  } catch (error) {
    return accessErrorResponse(error) ?? apiErrorResponse(error);
  }
}
