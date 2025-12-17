import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CIO Admin Panel | Almia',
  description: 'Panel de administración para CIO - Cazador Inteligente de Ofertas',
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

