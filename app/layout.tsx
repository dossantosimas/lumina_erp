import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000',
  ),
  title: 'LÚMINA OS · Operación centralizada',
  description: 'Sistema operativo empresarial de LÚMINA Candle Studio.',
  openGraph: {
    title: 'LÚMINA OS',
    description: 'La operación de tu estudio, en un solo lugar.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'LÚMINA OS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LÚMINA OS',
    description: 'La operación de tu estudio, en un solo lugar.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
