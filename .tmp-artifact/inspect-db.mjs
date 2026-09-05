import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no configurada");
const parsed = new URL(connectionString);
const pool = new pg.Pool({ connectionString });
try {
  const identity = await pool.query(`select current_database() as database, current_user as db_user, inet_server_addr()::text as host, inet_server_port() as port`);
  console.log(JSON.stringify({
    configuredHost: parsed.hostname,
    configuredPort: parsed.port || "5432",
    configuredDatabase: parsed.pathname.slice(1),
    connected: identity.rows[0],
  }, null, 2));
  const tables = await pool.query(`
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  `);
  const migrationCount = await pool.query(`
    select count(*)::int as count
    from drizzle.__drizzle_migrations
  `).catch(() => ({ rows: [{ count: 0 }] }));
  console.log(`drizzle_migrations\t${migrationCount.rows[0].count}`);
  for (const { tablename } of tables.rows) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const count = await pool.query(`select count(*)::int as count from ${quoted}`);
    console.log(`${tablename}\t${count.rows[0].count}`);
  }
} finally {
  await pool.end();
}
