import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';

const poppins = Poppins({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'CIO - Cazador Inteligente de Oportunidades',
  description: 'Tu asistente personal para encontrar empleo en Colombia',
  icons: {
    icon: '/assets/images/faviconalmia.svg',
    shortcut: '/assets/images/faviconalmia.svg',
    apple: '/assets/images/faviconalmia.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={poppins.className}>{children}</body>
    </html>
  );
}

