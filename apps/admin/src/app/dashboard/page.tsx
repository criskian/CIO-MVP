'use client';

import { useEffect, useState } from 'react';
import { Users, UserCheck, Crown, UserX, TrendingUp } from 'lucide-react';
import { getStats } from '@/lib/api';
import { Stats } from '@/types';
import Header from '@/components/layout/Header';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const data = await getStats();
      setStats(data);
    } catch (err: any) {
      console.error('Error cargando estadísticas:', err);
      setError('Error al cargar las estadísticas');
    } finally {
      setIsLoading(false);
    }
  };

  const statCards = stats
    ? [
        {
          title: 'Total Usuarios',
          value: stats.totalUsers,
          icon: Users,
          color: 'text-almia-purple-dark',
          bgColor: 'bg-almia-purple-light/10',
        },
        {
          title: 'Usuarios Freemium',
          value: stats.freemiumUsers,
          icon: UserCheck,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
        },
        {
          title: 'Usuarios Premium',
          value: stats.premiumUsers,
          icon: Crown,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
        },
        {
          title: 'Freemium Expirados',
          value: stats.expiredUsers,
          icon: UserX,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
        },
        {
          title: 'Registros (7 días)',
          value: stats.recentUsers,
          icon: TrendingUp,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
        },
      ]
    : [];

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Resumen general del sistema CIO"
      />

      <div className="p-8">
        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-32 bg-gray-200 rounded" />
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {statCards.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <Card key={index} className="hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-admin-text-secondary text-sm font-medium mb-2">
                          {stat.title}
                        </p>
                        <p className="text-3xl font-bold text-admin-text-primary">
                          {stat.value.toLocaleString()}
                        </p>
                      </div>
                      <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                        <Icon size={24} className={stat.color} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Bienvenido al Admin Panel</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-admin-text-secondary mb-4">
                    Este es el panel de administración de CIO (Cazador Inteligente de
                    Ofertas). Desde aquí puedes gestionar usuarios, suscripciones y
                    monitorear el sistema.
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-almia-purple rounded-full" />
                      <span className="text-admin-text-secondary">
                        Gestión completa de usuarios
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-almia-purple rounded-full" />
                      <span className="text-admin-text-secondary">
                        Control de suscripciones y planes
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-almia-purple rounded-full" />
                      <span className="text-admin-text-secondary">
                        Estadísticas en tiempo real
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Última Actualización</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-admin-text-secondary text-sm">
                    {stats && new Date(stats.timestamp).toLocaleString('es-CO', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

