'use client';

import { useState, useEffect } from 'react';
import Modal, { ModalFooter } from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { User } from '@/types';
import { updateUser } from '@/lib/api';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
}

export default function EditUserModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: EditUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone);
    }
  }, [user]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Email inválido';
    }

    if (!phone.match(/^57\d{10}$/)) {
      newErrors.phone = 'Teléfono debe ser formato colombiano: 57XXXXXXXXXX';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !user) return;

    try {
      setIsLoading(true);
      await updateUser(user.id, {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al actualizar el usuario');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar Usuario"
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <Input
            label="Nombre completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            required
          />

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            helperText="Opcional"
          />

          <Input
            label="Teléfono (WhatsApp)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
            helperText="Formato: 57XXXXXXXXXX"
            required
          />
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

