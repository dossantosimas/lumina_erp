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

void test('producción usa el dominio canónico proporcionado por Vercel', () => {
  const previousEnvironment = process.env.VERCEL_ENV;
  const previousProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_ENV = 'production';
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'lumina.example.app';
  try {
    assert.equal(getAppUrl(), 'https://lumina.example.app');
  } finally {
    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;
    if (previousProductionUrl === undefined)
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else
      process.env.VERCEL_PROJECT_PRODUCTION_URL = previousProductionUrl;
  }
});
