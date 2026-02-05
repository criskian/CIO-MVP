'use client';

import { useState, useEffect } from 'react';
import { Filter, Download, Edit } from 'lucide-react';
import { getUsers } from '@/lib/api';
import { User, PlanType, SubscriptionStatus } from '@/types';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import Loading from '@/components/ui/Loading';
import EditSubscriptionModal from '@/components/modals/EditSubscriptionModal';
import { exportSubscriptionsToCSV } from '@/lib/export';
import {
  formatPhone,
  formatDate,
  getPlanLabel,
  getStatusLabel,
} from '@/lib/utils';
import Link from 'next/link';

export default function SuscripcionesPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'ALL'>('ALL');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [users, planFilter, statusFilter]);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getUsers(1, 1000);
      setUsers(data.users?.filter((u) => u.subscription) || []);
    } catch (err: any) {
      console.error('Error cargando usuarios:', err);
      setError('Error al cargar las suscripciones');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...users];

    if (planFilter !== 'ALL') {
      filtered = filtered.filter((u) => u.subscription?.plan === planFilter);
    }

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((u) => u.subscription?.status === statusFilter);
    }

    setFilteredUsers(filtered);
  };

  const handleExport = () => {
    exportSubscriptionsToCSV(filteredUsers);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    loadUsers();
  };

  const stats = {
    total: users.length,
    freemium: users.filter((u) => u.subscription?.plan === 'FREEMIUM').length,
    premium: users.filter((u) => u.subscription?.plan === 'PREMIUM').length,
    pro: users.filter((u) => u.subscription?.plan === 'PRO').length,
    active: users.filter((u) => u.subscription?.status === 'ACTIVE').length,
    expired: users.filter((u) => u.subscription?.freemiumExpired).length,
  };

  return (
    <>
      <Header
        title="Suscripciones"
        subtitle={`${stats.total} suscripciones activas`}
        actions={
          <Button variant="secondary" onClick={handleExport}>
            <Download size={20} className="mr-2" />
            Exportar CSV
          </Button>
        }
      />

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <div className="text-center">
              <p className="text-sm text-admin-text-secondary mb-1">Total</p>
              <p className="text-2xl font-bold text-admin-text-primary">
                {stats.total}
              </p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-sm text-admin-text-secondary mb-1">Freemium</p>
              <p className="text-2xl font-bold text-blue-600">{stats.freemium}</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-sm text-admin-text-secondary mb-1">Premium</p>
              <p className="text-2xl font-bold text-almia-purple">{stats.premium}</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-sm text-admin-text-secondary mb-1">Pro</p>
              <p className="text-2xl font-bold text-amber-500">{stats.pro}</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-sm text-admin-text-secondary mb-1">Expirados</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.expired}</p>
            </div>
          </Card>
        </div>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        <Card className="mb-6">
          <div className="flex gap-4 items-center">
            <Filter size={20} className="text-admin-text-secondary" />
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
            >
              <option value="ALL">Todos los planes</option>
              <option value="FREEMIUM">Freemium</option>
              <option value="PREMIUM">Premium</option>
              <option value="PRO">Pro</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
            >
              <option value="ALL">Todos los estados</option>
              <option value="ACTIVE">Activos</option>
              <option value="EXPIRED">Expirados</option>
              <option value="CANCELLED">Cancelados</option>
            </select>

            <div className="ml-auto text-sm text-admin-text-secondary">
              {filteredUsers.length} resultados
            </div>
          </div>
        </Card>

        <Card padding="none">
          {isLoading ? (
            <Loading />
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-admin-text-secondary">
              No se encontraron suscripciones
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usos Restantes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Inicio
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-admin-text-primary">
                            {user.name || 'Sin nombre'}
                          </div>
                          <div className="text-sm text-admin-text-secondary">
                            {formatPhone(user.phone)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={
                            user.subscription?.plan === 'PRO'
                              ? 'warning'
                              : user.subscription?.plan === 'PREMIUM'
                                ? 'purple'
                                : 'gray'
                          }
                        >
                          {getPlanLabel(user.subscription!.plan)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={
                            user.subscription?.status === 'ACTIVE'
                              ? 'success'
                              : user.subscription?.status === 'EXPIRED'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {getStatusLabel(user.subscription!.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-admin-text-primary">
                        {user.subscription?.plan === 'FREEMIUM'
                          ? `${user.subscription.freemiumUsesLeft} / 3`
                          : `${user.subscription?.premiumUsesLeft} / 5`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-admin-text-secondary">
                        {formatDate(
                          user.subscription?.plan === 'FREEMIUM'
                            ? user.subscription.freemiumStartDate
                            : user.subscription?.premiumStartDate || user.createdAt
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(user)}
                            title="Editar suscripción"
                          >
                            <Edit size={16} />
                          </Button>
                          <Link href={`/dashboard/usuarios/${user.id}`}>
                            <Button variant="ghost" size="sm" title="Ver detalles">
                              Ver detalles →
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <EditSubscriptionModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          user={editingUser}
          onSuccess={handleEditSuccess}
        />
      </div>
    </>
  );
}

