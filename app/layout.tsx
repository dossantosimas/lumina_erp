import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import './globals.css';
import { isDatabaseConfigured } from '@/db';
import { auth } from '@/lib/auth';
import { getDashboardAccess } from '@/modules/dashboard/queries/get-dashboard-access';
import { AppShell } from '@/shared/components/app-shell';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000',
  ),
  title: 'LÚMINA OS · Operación centralizada',
  description: 'Sistema operativo empresarial de LÚMINA Candle Studio.',
  openGraph: {
    title: 'LÚMINA OS',
    description: 'La operación de tu estudio, en un solo lugar.',
    images: [
      {
        url: '/brand/lumina-lockup.png',
        width: 1536,
        height: 1024,
        alt: 'LÚMINA Candle Studio',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LÚMINA OS',
    description: 'La operación de tu estudio, en un solo lugar.',
    images: ['/brand/lumina-lockup.png'],
  },
  icons: {
    icon: '/brand/lumina-emblem.png',
    apple: '/brand/lumina-emblem.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let current = null;

  if (isDatabaseConfigured()) {
    try {
      current = await auth.api.getSession({ headers: await headers() });
    } catch (error) {
      unstable_rethrow(error);
      // Keep public recovery and login screens available during a transient
      // database outage. Protected pages still enforce their own session checks.
      console.error('No se pudo recuperar la sesión para el layout', error);
    }
  }
  const content = current ? (
    <AppShell
      user={{ name: current.user.name, email: current.user.email }}
      access={await getDashboardAccess(current.user.id)}
    >
      {children}
    </AppShell>
  ) : (
    children
  );
  return (
    <html lang="es">
      <body>{content}</body>
    </html>
  );
}
