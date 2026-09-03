import type { Metadata } from 'next';
import { Geist, Lora } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });
const lora = Lora({ variable: '--font-lora', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${geist.variable} ${lora.variable}`}>{children}</body></html>;
}
