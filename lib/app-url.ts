export function getAppUrl() {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}`;

  if (
    process.env.VERCEL_ENV === 'production' &&
    process.env.VERCEL_PROJECT_PRODUCTION_URL
  )
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}
