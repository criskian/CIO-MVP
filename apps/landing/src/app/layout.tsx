import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CIO - Cazador Inteligente de Oportunidades',
  description: 'Tu asistente personal para encontrar empleo en Colombia',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

