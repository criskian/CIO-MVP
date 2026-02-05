'use client';

import { useState, useEffect } from 'react';
import Modal, { ModalFooter } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { User, PlanType, SubscriptionStatus } from '@/types';
import { updateSubscription } from '@/lib/api';

interface EditSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
}

export default function EditSubscriptionModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: EditSubscriptionModalProps) {
  const [plan, setPlan] = useState<PlanType>('FREEMIUM');
  const [status, setStatus] = useState<SubscriptionStatus>('ACTIVE');
  const [freemiumUsesLeft, setFreemiumUsesLeft] = useState(5);
  const [premiumUsesLeft, setPremiumUsesLeft] = useState(5);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user?.subscription) {
      setPlan(user.subscription.plan);
      setStatus(user.subscription.status);
      setFreemiumUsesLeft(user.subscription.freemiumUsesLeft);
      setPremiumUsesLeft(user.subscription.premiumUsesLeft);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    try {
      setIsLoading(true);
      await updateSubscription(user.id, {
        plan,
        status,
        freemiumUsesLeft,
        premiumUsesLeft,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al actualizar la suscripción');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user?.subscription) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Editar Suscripción - ${user.name || 'Usuario'}`}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-admin-text-primary mb-1">
              Plan
            </label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanType)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
            >
              <option value="FREEMIUM">Freemium</option>
              <option value="PREMIUM">Premium</option>
              <option value="PRO">Pro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-admin-text-primary mb-1">
              Estado
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
            >
              <option value="ACTIVE">Activo</option>
              <option value="EXPIRED">Expirado</option>
              <option value="CANCELLED">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-admin-text-primary mb-1">
              Usos Freemium Restantes
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={freemiumUsesLeft}
              onChange={(e) => setFreemiumUsesLeft(parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
            />
            <p className="mt-1 text-xs text-admin-text-secondary">
              Normalmente: 5 usos por período de 5 días hábiles (1 semana)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-admin-text-primary mb-1">
              Búsquedas Premium Restantes
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={premiumUsesLeft}
              onChange={(e) => setPremiumUsesLeft(parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
            />
            <p className="mt-1 text-xs text-admin-text-secondary">
              Normalmente: 5 búsquedas por semana
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Guardar Cambios
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

