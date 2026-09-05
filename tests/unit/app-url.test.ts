import assert from 'node:assert/strict';
import test from 'node:test';
import { getAppUrl } from '../../lib/app-url.ts';

void test('un preview genera enlaces hacia su propio despliegue', () => {
  const previousEnvironment = process.env.VERCEL_ENV;
  const previousUrl = process.env.VERCEL_URL;
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'lumina-preview.vercel.app';
  try {
    assert.equal(getAppUrl(), 'https://lumina-preview.vercel.app');
  } finally {
    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;
    if (previousUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previousUrl;
  }
});
