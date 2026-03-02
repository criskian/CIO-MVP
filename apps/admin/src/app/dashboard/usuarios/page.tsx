'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Download, Filter, X } from 'lucide-react';
import { getUsers, deleteUser, getAllUsersForExport } from '@/lib/api';
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

interface Filters {
  plan: string;
  status: string;
  hasAlerts: string;
  freemiumExpired: string;
  searchesUsed: string;
}

const EMPTY_FILTERS: Filters = {
  plan: '',
  status: '',
  hasAlerts: '',
  freemiumExpired: '',
  searchesUsed: '',
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const loadUsers = useCallback(async (page: number, search?: string, currentFilters?: Filters) => {
    try {
      setIsLoading(true);
      setError('');

      const appliedFilters = currentFilters || filters;
      const filterParams: Record<string, string> = {};
      if (appliedFilters.plan) filterParams.plan = appliedFilters.plan;
      if (appliedFilters.status) filterParams.status = appliedFilters.status;
      if (appliedFilters.hasAlerts) filterParams.hasAlerts = appliedFilters.hasAlerts;
      if (appliedFilters.freemiumExpired) filterParams.freemiumExpired = appliedFilters.freemiumExpired;
      if (appliedFilters.searchesUsed) filterParams.searchesUsed = appliedFilters.searchesUsed;

      const data = await getUsers(page, 20, search, filterParams);
      setUsers(data.users || []);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err: any) {
      console.error('Error cargando usuarios:', err);
      setError('Error al cargar los usuarios');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    loadUsers(currentPage, searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Debounced live search — fires 300ms after the user stops typing
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      loadUsers(1, value);
    }, 300);
  };

  // Filter change handler — applies immediately
  const handleFilterChange = (key: keyof Filters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    setCurrentPage(1);
    loadUsers(1, searchTerm, newFilters);
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setCurrentPage(1);
    loadUsers(1, searchTerm, EMPTY_FILTERS);
  };

  // Check if any filter is active
  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    loadUsers(currentPage, searchTerm);
  };

  const handleExport = async () => {
    try {
      const data = await getAllUsersForExport();
      exportUsersToCSV(data.users);
    } catch (err) {
      console.error('Error exportando usuarios:', err);
      alert('Error al exportar usuarios');
    }
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

  // Filter label map for active filter chips
  const filterLabels: Record<string, Record<string, string>> = {
    plan: { FREEMIUM: 'Plan: Free', PREMIUM: 'Plan: Premium', PRO: 'Plan: Pro' },
    status: { ACTIVE: 'Estado: Activo', EXPIRED: 'Estado: Expirado', CANCELLED: 'Estado: Cancelado' },
    hasAlerts: { true: 'Con alertas', false: 'Sin alertas' },
    freemiumExpired: { true: 'Freemium expirado', false: 'Freemium activo' },
    searchesUsed: { '0': '0 búsquedas', '1': '1 búsqueda', '2': '2 búsquedas', '3': '3 búsquedas', '4': '4 búsquedas', '5': '5 búsquedas' },
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

        {/* Search + Filter Toggle */}
        <Card className="mb-6">
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nombre, email o teléfono..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant={showFilters ? 'primary' : 'secondary'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={18} className="mr-2" />
              Filtros
              {hasActiveFilters && (
                <span className="ml-2 bg-white text-almia-blue text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {Object.values(filters).filter(v => v !== '').length}
                </span>
              )}
            </Button>
          </div>

          {/* Filter Dropdowns */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Plan filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Plan</label>
                  <select
                    value={filters.plan}
                    onChange={(e) => handleFilterChange('plan', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-almia-blue focus:border-transparent"
                  >
                    <option value="">Todos</option>
                    <option value="FREEMIUM">Free</option>
                    <option value="PREMIUM">Premium</option>
                    <option value="PRO">Pro</option>
                  </select>
                </div>

                {/* Status filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-almia-blue focus:border-transparent"
                  >
                    <option value="">Todos</option>
                    <option value="ACTIVE">Activo</option>
                    <option value="EXPIRED">Expirado</option>
                    <option value="CANCELLED">Cancelado</option>
                  </select>
                </div>

                {/* Alerts filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Alertas</label>
                  <select
                    value={filters.hasAlerts}
                    onChange={(e) => handleFilterChange('hasAlerts', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-almia-blue focus:border-transparent"
                  >
                    <option value="">Todos</option>
                    <option value="true">Con alertas</option>
                    <option value="false">Sin alertas</option>
                  </select>
                </div>

                {/* Freemium expired filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Freemium</label>
                  <select
                    value={filters.freemiumExpired}
                    onChange={(e) => handleFilterChange('freemiumExpired', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-almia-blue focus:border-transparent"
                  >
                    <option value="">Todos</option>
                    <option value="false">Activo</option>
                    <option value="true">Expirado</option>
                  </select>
                </div>

                {/* Searches used filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Búsquedas usadas</label>
                  <select
                    value={filters.searchesUsed}
                    onChange={(e) => handleFilterChange('searchesUsed', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-almia-blue focus:border-transparent"
                  >
                    <option value="">Todas</option>
                    <option value="0">0 búsquedas</option>
                    <option value="1">1 búsqueda</option>
                    <option value="2">2 búsquedas</option>
                    <option value="3">3 búsquedas</option>
                    <option value="4">4 búsquedas</option>
                    <option value="5">5 búsquedas</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              {Object.entries(filters).map(([key, value]) => {
                if (!value) return null;
                const label = filterLabels[key]?.[value] || value;
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-almia-blue/10 text-almia-blue text-xs font-medium rounded-full"
                  >
                    {label}
                    <button
                      onClick={() => handleFilterChange(key as keyof Filters, '')}
                      className="hover:bg-almia-blue/20 rounded-full p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              <button
                onClick={clearFilters}
                className="text-xs text-gray-500 hover:text-almia-red underline ml-2"
              >
                Limpiar filtros
              </button>
            </div>
          )}
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
