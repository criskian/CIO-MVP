'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  Crown,
  UserX,
  TrendingUp,
  DollarSign,
  Briefcase,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { getDetailedStats, getRecentActivity } from '@/lib/api';
import { DetailedStats, RecentActivity } from '@/types';
import Header from '@/components/layout/Header';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';

const COLORS = ['#7C3AED', '#3B82F6', '#EF4444', '#10B981'];

export default function DashboardPage() {
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [activity, setActivity] = useState<RecentActivity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filtros de fecha
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [statsData, activityData] = await Promise.all([
        getDetailedStats(startDate, endDate),
        getRecentActivity(5),
      ]);
      setStats(statsData);
      setActivity(activityData);
    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError('Error al cargar las estadísticas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterApply = () => {
    loadData();
  };

  // Datos para el gráfico de distribución de usuarios
  const pieData = stats ? [
    { name: 'Freemium Activos', value: stats.summary.freemiumActive, color: '#3B82F6' },
    { name: 'Premium Activos', value: stats.summary.premiumActive, color: '#7C3AED' },
    { name: 'Expirados', value: stats.summary.freemiumExpired, color: '#EF4444' },
  ] : [];

  const statCards = stats
    ? [
        {
          title: 'Total Usuarios',
          value: stats.summary.totalUsers,
          icon: Users,
          color: 'text-almia-purple-dark',
          bgColor: 'bg-almia-purple-light/10',
        },
        {
          title: 'Freemium Activos',
          value: stats.summary.freemiumActive,
          icon: UserCheck,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
        },
        {
          title: 'Premium Activos',
          value: stats.summary.premiumActive,
          icon: Crown,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
        },
        {
          title: 'Tasa Conversión',
          value: `${stats.summary.conversionRate}%`,
          icon: TrendingUp,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          isPercentage: true,
        },
        {
          title: 'Ingresos Totales',
          value: `$${(stats.summary.totalRevenue / 100).toLocaleString('es-CO')}`,
          icon: DollarSign,
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-50',
          isCurrency: true,
        },
        {
          title: 'Ofertas Enviadas',
          value: stats.summary.totalJobsSent,
          icon: Briefcase,
          color: 'text-indigo-600',
          bgColor: 'bg-indigo-50',
        },
      ]
    : [];

  const periodCards = stats
    ? [
        { title: 'Nuevos Registros', value: stats.period.newUsers, color: 'text-blue-600' },
        { title: 'Conversiones', value: stats.period.conversions, color: 'text-purple-600' },
        { title: 'Pagos Exitosos', value: stats.period.payments, color: 'text-green-600' },
      ]
    : [];

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Métricas y estadísticas del sistema CIO"
      />

      <div className="p-8">
        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {/* Filtros de fecha */}
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Período:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-almia-purple focus:border-transparent"
              />
              <span className="text-gray-500">a</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-almia-purple focus:border-transparent"
              />
            </div>
            <button
              onClick={handleFilterApply}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-almia-purple text-white rounded-lg hover:bg-almia-purple-dark transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-24 bg-gray-200 rounded" />
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Tarjetas principales de estadísticas */}
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
                          {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
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

            {/* Tarjetas del período seleccionado */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar size={20} />
                  Período: {format(new Date(startDate), "d 'de' MMMM", { locale: es })} - {format(new Date(endDate), "d 'de' MMMM yyyy", { locale: es })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {periodCards.map((card, index) => (
                    <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">{card.title}</p>
                      <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Gráfico de líneas - Tendencia diaria */}
              <Card>
                <CardHeader>
                  <CardTitle>Tendencia Diaria</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats?.dailyStats || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => format(new Date(value), 'd MMM', { locale: es })}
                          fontSize={12}
                        />
                        <YAxis fontSize={12} />
                        <Tooltip 
                          labelFormatter={(value) => format(new Date(value), "d 'de' MMMM yyyy", { locale: es })}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="registros" 
                          name="Registros"
                          stroke="#3B82F6" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="conversiones" 
                          name="Conversiones"
                          stroke="#7C3AED" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="pagos" 
                          name="Pagos"
                          stroke="#10B981" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Gráfico de pastel - Distribución de usuarios */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribución de Usuarios</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Gráfico de barras - Comparación */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Actividad por Día</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.dailyStats?.slice(-14) || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => format(new Date(value), 'd MMM', { locale: es })}
                        fontSize={12}
                      />
                      <YAxis fontSize={12} />
                      <Tooltip 
                        labelFormatter={(value) => format(new Date(value), "d 'de' MMMM yyyy", { locale: es })}
                      />
                      <Legend />
                      <Bar dataKey="registros" name="Registros" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="conversiones" name="Conversiones" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tablas de actividad reciente */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Usuarios recientes */}
              <Card>
                <CardHeader>
                  <CardTitle>Usuarios Recientes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium text-gray-600">Nombre</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-600">Plan</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-600">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activity?.recentUsers.map((user) => (
                          <tr key={user.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-2">
                              <div>
                                <p className="font-medium">{user.name || 'Sin nombre'}</p>
                                <p className="text-xs text-gray-500">{user.phone}</p>
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                user.subscription?.plan === 'PREMIUM' 
                                  ? 'bg-purple-100 text-purple-700' 
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {user.subscription?.plan || 'Nuevo'}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-gray-600">
                              {format(new Date(user.createdAt), "d MMM HH:mm", { locale: es })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Pagos recientes */}
              <Card>
                <CardHeader>
                  <CardTitle>Pagos Recientes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium text-gray-600">Usuario</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-600">Monto</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-600">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activity?.recentPayments.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-4 text-center text-gray-500">
                              No hay pagos recientes
                            </td>
                          </tr>
                        ) : (
                          activity?.recentPayments.map((payment) => (
                            <tr key={payment.id} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-2">
                                <div>
                                  <p className="font-medium">{payment.user?.name || 'Sin nombre'}</p>
                                  <p className="text-xs text-gray-500">{payment.email}</p>
                                </div>
                              </td>
                              <td className="py-2 px-2 font-medium text-green-600">
                                ${(payment.amount / 100).toLocaleString('es-CO')}
                              </td>
                              <td className="py-2 px-2 text-gray-600">
                                {format(new Date(payment.createdAt), "d MMM HH:mm", { locale: es })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Última actualización */}
            <div className="mt-6 text-center text-sm text-gray-500">
              Última actualización: {stats && format(new Date(stats.timestamp), "d 'de' MMMM yyyy 'a las' HH:mm", { locale: es })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
