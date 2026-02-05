'use client';

import { User } from '@/types';
import { formatPhone, formatDateShort, getPlanColor, getPlanLabel } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Eye, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface UsersTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onDelete: (userId: string) => void;
}

export default function UsersTable({ users, onEdit, onDelete }: UsersTableProps) {
  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-admin-text-secondary">
        No se encontraron usuarios
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nombre
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Teléfono
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Plan
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Registro
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-admin-text-primary">
                  {user.name || 'Sin nombre'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-admin-text-secondary">
                  {user.email || '-'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-admin-text-secondary">
                  {formatPhone(user.phone)}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {user.subscription ? (
                  <Badge
                    variant={
                      user.subscription.plan === 'PRO'
                        ? 'warning'
                        : user.subscription.plan === 'PREMIUM'
                          ? 'purple'
                          : 'gray'
                    }
                  >
                    {getPlanLabel(user.subscription.plan)}
                  </Badge>
                ) : (
                  <span className="text-xs text-gray-400">Sin plan</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-admin-text-secondary">
                {formatDateShort(user.createdAt)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/dashboard/usuarios/${user.id}`}>
                    <Button variant="ghost" size="sm" title="Ver detalle">
                      <Eye size={16} />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(user)}
                    title="Editar usuario"
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(user.id)}
                    className="text-almia-red hover:bg-red-50"
                    title="Eliminar usuario"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

