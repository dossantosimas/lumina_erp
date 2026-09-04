import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error(
    'DATABASE_URL es obligatoria para las pruebas de integración.',
  );
const pool = new pg.Pool({ connectionString, max: 2 });

after(async () => pool.end());

void test('PostgreSQL contiene las tablas críticas del ciclo operativo', async () => {
  const { rows } = await pool.query<{ table_name: string }>(
    `
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name = any($1::text[])
  `,
    [
      [
        'audit_logs',
        'idempotency_keys',
        'inventory_movements',
        'purchase_orders',
        'production_orders',
        'sales_orders',
        'financial_movements',
      ],
    ],
  );
  assert.deepEqual(
    new Set(rows.map((row) => row.table_name)),
    new Set([
      'audit_logs',
      'idempotency_keys',
      'inventory_movements',
      'purchase_orders',
      'production_orders',
      'sales_orders',
      'financial_movements',
    ]),
  );
});

void test('la llave de idempotencia es única y el rollback no deja datos', async () => {
  const key = `integration:${crypto.randomUUID()}`;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into idempotency_keys (key, operation, expires_at) values ($1, $2, now() + interval '5 minutes')`,
      [key, 'integration.test'],
    );
    await client.query('savepoint duplicate_attempt');
    await assert.rejects(
      client.query(
        `insert into idempotency_keys (key, operation, expires_at) values ($1, $2, now() + interval '5 minutes')`,
        [key, 'integration.test'],
      ),
      (error: unknown) =>
        error instanceof Error && 'code' in error && error.code === '23505',
    );
    await client.query('rollback to savepoint duplicate_attempt');
    await client.query('rollback');
  } finally {
    client.release();
  }
  const result = await pool.query(
    'select key from idempotency_keys where key = $1',
    [key],
  );
  assert.equal(result.rowCount, 0);
});

void test('los ledgers impiden más de un reverso para el mismo movimiento', async () => {
  const { rows } = await pool.query<{ indexname: string }>(
    `
    select indexname from pg_indexes
    where schemaname = 'public'
      and indexname = any($1::text[])
  `,
    [['inventory_reversal_unique', 'financial_reversal_unique']],
  );
  assert.deepEqual(
    new Set(rows.map((row) => row.indexname)),
    new Set(['inventory_reversal_unique', 'financial_reversal_unique']),
  );
});
