'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();

  useEffect(() => {
    // Verificar autenticación
    if (!isAuthenticated()) {
      router.push('/login');
    }
  }, [router]);

  // Si no está autenticado, no mostrar nada (evitar flash)
  if (!isAuthenticated()) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-admin-bg-secondary">
      <Sidebar />
      <main className="flex-1 overflow-auto custom-scrollbar">
        {children}
      </main>
    </div>
  );
}

