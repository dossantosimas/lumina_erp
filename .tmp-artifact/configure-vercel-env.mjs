import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function readEnv(path) {
  const values = new Map();
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

const neon = readEnv('.env.neon.local');
const local = readEnv('.env.local');
const smtp = readEnv('.env.smtp.local');
const productionUrl = 'https://lumina-erp-dossantosimas-projects.vercel.app';
const variables = new Map([
  ['DATABASE_URL', neon.get('DATABASE_URL')],
  ['DATABASE_URL_UNPOOLED', neon.get('DATABASE_URL_UNPOOLED')],
  ['BETTER_AUTH_SECRET', local.get('BETTER_AUTH_SECRET')],
  ['BETTER_AUTH_URL', productionUrl],
  ['NEXT_PUBLIC_APP_URL', productionUrl],
  ['SMTP_HOST', smtp.get('SMTP_HOST') || 'smtp.gmail.com'],
  ['SMTP_PORT', smtp.get('SMTP_PORT') || '465'],
  ['SMTP_SECURE', smtp.get('SMTP_SECURE') || 'true'],
  ['SMTP_USER', smtp.get('SMTP_USER')],
  ['SMTP_APP_PASSWORD', smtp.get('SMTP_APP_PASSWORD')],
  ['EMAIL_FROM', smtp.get('EMAIL_FROM')],
]);

for (const [name, value] of variables) {
  if (!value) throw new Error(`La variable ${name} no tiene valor.`);
  const result = spawnSync(
    process.execPath,
    [
      'C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js',
      '--yes',
      'vercel@latest',
      'env',
      'add',
      name,
      'production,preview',
      '--force',
      '--sensitive',
      '--value',
      value,
      '--yes',
    ],
    { cwd: process.cwd(), encoding: 'utf8', shell: false },
  );
  if (result.status !== 0)
    throw new Error(
      `No se pudo configurar ${name}: ${result.error?.message || result.stderr || result.stdout}`,
    );
  console.log(`${name}: configurada en Production y Preview`);
}
