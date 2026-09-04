import 'server-only';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import {
  drizzle as pgDrizzle,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

let database: NodePgDatabase<typeof schema> | undefined;
export function getDb() {
  if (database) return database;
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://build:build@127.0.0.1:5432/lumina';
  const hostname = new URL(connectionString).hostname;
  const isLocal = ['localhost', '127.0.0.1', 'host.docker.internal'].includes(
    hostname,
  );
  database = isLocal
    ? pgDrizzle(new pg.Pool({ connectionString }), { schema })
    : (neonDrizzle(new NeonPool({ connectionString }), {
        schema,
      }) as unknown as NodePgDatabase<typeof schema>);
  return database;
}
export const isDatabaseConfigured = () => Boolean(process.env.DATABASE_URL);
