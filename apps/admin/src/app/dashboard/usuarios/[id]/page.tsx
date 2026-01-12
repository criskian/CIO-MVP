'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Crown, RotateCcw, Trash2, Edit } from 'lucide-react';
import {
  getUserById,
  activatePremium,
  resetFreemium,
  deleteUser,
} from '@/lib/api';
import { User } from '@/types';
import Header from '@/components/layout/Header';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import Loading from '@/components/ui/Loading';
import EditUserModal from '@/components/modals/EditUserModal';
import {
  formatPhone,
  formatDate,
  formatCurrency,
  getPlanLabel,
  getStatusLabel,
} from '@/lib/utils';

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    loadUser();
  }, [params.id]);

  const loadUser = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getUserById(params.id);
      setUser(data);
    } catch (err: any) {
      console.error('Error cargando usuario:', err);
      setError('Error al cargar el usuario');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivatePremium = async () => {
    if (!confirm('¿Activar plan Premium para este usuario?')) return;

    try {
      setActionLoading(true);
      await activatePremium(params.id);
      await loadUser();
      alert('Premium activado exitosamente');
    } catch (err) {
      alert('Error al activar Premium');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetFreemium = async () => {
    if (!confirm('¿Reiniciar el plan Freemium (3 usos, 3 días)?')) return;

    try {
      setActionLoading(true);
      await resetFreemium(params.id);
      await loadUser();
      alert('Freemium reiniciado exitosamente');
    } catch (err) {
      alert('Error al reiniciar Freemium');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        '¿Estás seguro de que quieres eliminar este usuario? Esta acción no se puede deshacer.'
      )
    )
      return;

    try {
      await deleteUser(params.id);
      router.push('/dashboard/usuarios');
    } catch (err) {
      alert('Error al eliminar el usuario');
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Cargando..." />
        <div className="p-8">
          <Loading />
        </div>
      </>
    );
  }

  if (error || !user) {
    return (
      <>
        <Header title="Error" />
        <div className="p-8">
          <Alert variant="error">{error || 'Usuario no encontrado'}</Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={user.name || 'Usuario sin nombre'}
        subtitle={formatPhone(user.phone)}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setIsEditModalOpen(true)}>
              <Edit size={20} className="mr-2" />
              Editar
            </Button>
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft size={20} className="mr-2" />
              Volver
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-admin-text-secondary">
                    Nombre
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {user.name || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-admin-text-secondary">
                    Email
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {user.email || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-admin-text-secondary">
                    Teléfono
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {formatPhone(user.phone)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-admin-text-secondary">
                    Fecha de Registro
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {formatDate(user.createdAt)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {user.subscription && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Suscripción</CardTitle>
                  <Badge
                    variant={user.subscription.plan === 'PREMIUM' ? 'purple' : 'gray'}
                  >
                    {getPlanLabel(user.subscription.plan)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-admin-text-secondary">
                      Estado
                    </dt>
                    <dd className="mt-1">
                      <Badge variant={
                        user.subscription.status === 'ACTIVE' ? 'success' :
                          user.subscription.status === 'EXPIRED' ? 'warning' : 'danger'
                      }>
                        {getStatusLabel(user.subscription.status)}
                      </Badge>
                    </dd>
                  </div>

                  {user.subscription.plan === 'FREEMIUM' && (
                    <>
                      <div>
                        <dt className="text-sm font-medium text-admin-text-secondary">
                          Usos Restantes
                        </dt>
                        <dd className="mt-1 text-sm text-admin-text-primary">
                          {user.subscription.freemiumUsesLeft} / 3
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-admin-text-secondary">
                          Inicio Periodo
                        </dt>
                        <dd className="mt-1 text-sm text-admin-text-primary">
                          {formatDate(user.subscription.freemiumStartDate)}
                        </dd>
                      </div>
                    </>
                  )}

                  {user.subscription.plan === 'PREMIUM' && (
                    <>
                      <div>
                        <dt className="text-sm font-medium text-admin-text-secondary">
                          Búsquedas Realizadas (esta semana)
                        </dt>
                        <dd className="mt-1 text-sm text-admin-text-primary">
                          {5 - user.subscription.premiumUsesLeft} de 5
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-admin-text-secondary">
                          Búsquedas Restantes (esta semana)
                        </dt>
                        <dd className="mt-1 text-sm text-admin-text-primary">
                          {user.subscription.premiumUsesLeft} de 5
                        </dd>
                      </div>
                      {user.subscription.premiumStartDate && (
                        <div>
                          <dt className="text-sm font-medium text-admin-text-secondary">
                            Fecha de Activación
                          </dt>
                          <dd className="mt-1 text-sm text-admin-text-primary">
                            {formatDate(user.subscription.premiumStartDate)}
                          </dd>
                        </div>
                      )}
                      {user.subscription.premiumEndDate && (
                        <div>
                          <dt className="text-sm font-medium text-admin-text-secondary">
                            Fecha de Expiración
                          </dt>
                          <dd className="mt-1 text-sm text-admin-text-primary">
                            {formatDate(user.subscription.premiumEndDate)}
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>

                <div className="mt-6 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    onClick={handleActivatePremium}
                    isLoading={actionLoading}
                    className="w-full"
                  >
                    <Crown size={16} className="mr-2" />
                    Activar Premium
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleResetFreemium}
                    isLoading={actionLoading}
                    className="w-full"
                  >
                    <RotateCcw size={16} className="mr-2" />
                    Reiniciar Freemium
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {user.profile && (
          <Card>
            <CardHeader>
              <CardTitle>Perfil Laboral</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-admin-text-secondary">
                    Cargo Deseado
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {user.profile.role}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-admin-text-secondary">
                    Nivel de Experiencia
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {user.profile.experienceLevel}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-admin-text-secondary">
                    Ubicación
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {user.profile.location}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-admin-text-secondary">
                    Tipo de Empleo
                  </dt>
                  <dd className="mt-1 text-sm text-admin-text-primary">
                    {Array.isArray(user.profile.jobType)
                      ? user.profile.jobType.join(', ')
                      : user.profile.jobType}
                  </dd>
                </div>
                {user.profile.minSalary && (
                  <div>
                    <dt className="text-sm font-medium text-admin-text-secondary">
                      Salario Ideal
                    </dt>
                    <dd className="mt-1 text-sm text-admin-text-primary">
                      {formatCurrency(user.profile.minSalary)}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-almia-red">Zona de Peligro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-admin-text-secondary mb-4">
              Eliminar este usuario borrará todos sus datos de forma permanente.
            </p>
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={16} className="mr-2" />
              Eliminar Usuario
            </Button>
          </CardContent>
        </Card>

        <EditUserModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          user={user}
          onSuccess={loadUser}
        />
      </div>
    </>
  );
}

