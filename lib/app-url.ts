export function getAppUrl() {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}`;

  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}
