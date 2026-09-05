import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const values = new Map();
for (const rawLine of readFileSync('.env.smtp.local', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator > 0)
    values.set(line.slice(0, separator), line.slice(separator + 1));
}

const variables = new Map([
  ['SMTP_HOST', values.get('SMTP_HOST') || 'smtp.gmail.com'],
  ['SMTP_PORT', values.get('SMTP_PORT') || '465'],
  ['SMTP_SECURE', values.get('SMTP_SECURE') || 'true'],
  ['SMTP_USER', values.get('SMTP_USER')],
  ['SMTP_APP_PASSWORD', values.get('SMTP_APP_PASSWORD')],
  ['EMAIL_FROM', values.get('EMAIL_FROM')],
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
