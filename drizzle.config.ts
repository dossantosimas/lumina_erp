import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env.migrations.local')) loadEnvFile('.env.migrations.local');

export default defineConfig({
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      'postgresql://user:password@localhost:5432/lumina',
  },
  strict: true,
  verbose: true,
});
