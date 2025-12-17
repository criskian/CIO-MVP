'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutDashboard, Users, CreditCard, LogOut } from 'lucide-react';
import { logout, getAuthUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

const menuItems = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Usuarios',
    href: '/dashboard/usuarios',
    icon: Users,
  },
  {
    name: 'Suscripciones',
    href: '/dashboard/suscripciones',
    icon: CreditCard,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const user = getAuthUser();

  const handleLogout = () => {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      logout();
    }
  };

  return (
    <aside className="w-64 bg-admin-bg-sidebar min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-almia-purple">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/logoalmia.svg"
            alt="Almia Logo"
            width={120}
            height={40}
            className="brightness-0 invert"
          />
        </div>
        <p className="text-white/60 text-xs mt-2">Admin Panel</p>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                    'text-white/80 hover:text-white hover:bg-almia-purple',
                    isActive && 'bg-almia-purple text-white shadow-lg'
                  )}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User info & Logout */}
      <div className="p-4 border-t border-almia-purple">
        {user && (
          <div className="mb-3 px-4">
            <p className="text-white font-medium text-sm truncate">{user.name}</p>
            <p className="text-white/60 text-xs truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-white/80 hover:text-white hover:bg-almia-red"
        >
          <LogOut size={20} />
          <span className="font-medium">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}

