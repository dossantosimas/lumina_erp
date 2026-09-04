import { sql } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '@/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  if (!isDatabaseConfigured())
    return Response.json(
      { status: 'setup_required', database: 'not_configured' },
      { status: 503 },
    );
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { status: 'degraded', database: 'unreachable' },
      { status: 503 },
    );
  }
}
