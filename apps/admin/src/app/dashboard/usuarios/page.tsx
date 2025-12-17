'use client';

import { useState, useEffect } from 'react';
import { Search, Download } from 'lucide-react';
import { getUsers, deleteUser } from '@/lib/api';
import { User } from '@/types';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Loading from '@/components/ui/Loading';
import UsersTable from '@/components/tables/UsersTable';
import Pagination from '@/components/ui/Pagination';
import EditUserModal from '@/components/modals/EditUserModal';
import { exportUsersToCSV } from '@/lib/export';

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    loadUsers(currentPage, searchTerm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const loadUsers = async (page: number, search?: string) => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getUsers(page, 20, search);
      setUsers(data.users || []);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err: any) {
      console.error('Error cargando usuarios:', err);
      setError('Error al cargar los usuarios');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadUsers(1, searchTerm);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    loadUsers(currentPage, searchTerm);
  };

  const handleExport = () => {
    exportUsersToCSV(users);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
      return;
    }

    try {
      await deleteUser(userId);
      loadUsers(currentPage, searchTerm);
    } catch (err: any) {
      console.error('Error eliminando usuario:', err);
      alert('Error al eliminar el usuario');
    }
  };

  return (
    <>
      <Header
        title="Usuarios"
        subtitle={`${total} usuarios registrados`}
        actions={
          <Button variant="secondary" onClick={handleExport}>
            <Download size={20} className="mr-2" />
            Exportar CSV
          </Button>
        }
      />

      <div className="p-8">
        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        <Card className="mb-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por nombre, email o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button variant="primary" onClick={handleSearch}>
              <Search size={20} className="mr-2" />
              Buscar
            </Button>
          </div>
        </Card>

        <Card padding="none">
          {isLoading ? (
            <Loading />
          ) : (
            <>
              <UsersTable
                users={users}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </Card>

        <EditUserModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          user={editingUser}
          onSuccess={handleEditSuccess}
        />
      </div>
    </>
  );
}

