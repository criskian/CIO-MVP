'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, RefreshCw } from 'lucide-react';
import Header from '@/components/layout/Header';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Alert from '@/components/ui/Alert';
import { getUsers, sendWhatsAppTemplateToUser } from '@/lib/api';
import { User } from '@/types';

const DEFAULT_TEMPLATE = 'job_alert_notification';
const DEFAULT_LANGUAGE = 'es_CO';
const DEFAULT_PAYLOAD = 'SEARCH_NOW';
const CUSTOM_ROLE_VALUE = '__custom__';

const TEMPLATE_OPTIONS = [
  { value: 'job_alert_notification', label: 'job_alert_notification' },
];

const LANGUAGE_OPTIONS = [
  { value: 'es_CO', label: 'Español (Colombia)' },
];

const PAYLOAD_OPTIONS = [
  { value: 'SEARCH_NOW', label: 'SEARCH_NOW (Ver ofertas)' },
];

const JOB_COUNT_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const COMMON_ROLE_OPTIONS = [
  'Software Engineer',
  'Backend Developer',
  'Frontend Developer',
  'Full Stack Developer',
  'Data Engineer',
  'Data Analyst',
  'QA Engineer',
  'Project Manager',
  'Asesor Comercial',
];

function getFirstName(name: string | null | undefined): string {
  if (!name) return 'Usuario';
  const cleaned = name.trim();
  if (!cleaned) return 'Usuario';
  return cleaned.split(/\s+/)[0] || 'Usuario';
}

export default function WhatsAppTemplatesPage() {
  const searchParams = useSearchParams();
  const initialUserId = searchParams.get('userId') || '';

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);
  const [searchTerm, setSearchTerm] = useState('');

  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE);
  const [languageCode, setLanguageCode] = useState(DEFAULT_LANGUAGE);
  const [buttonPayload, setButtonPayload] = useState(DEFAULT_PAYLOAD);
  const [jobCountParam, setJobCountParam] = useState('3');
  const [nameParam, setNameParam] = useState('');
  const [roleSelection, setRoleSelection] = useState('');
  const [customRole, setCustomRole] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const q = searchTerm.toLowerCase().trim();
    return users.filter((user) => {
      const name = (user.name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const phone = (user.phone || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [users, searchTerm]);

  const userOptions = useMemo(() => {
    if (!selectedUser) return filteredUsers;
    const alreadyIncluded = filteredUsers.some((user) => user.id === selectedUser.id);
    return alreadyIncluded ? filteredUsers : [selectedUser, ...filteredUsers];
  }, [filteredUsers, selectedUser]);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    if (selectedUser?.profile?.role) {
      set.add(selectedUser.profile.role);
    }
    for (const role of COMMON_ROLE_OPTIONS) {
      set.add(role);
    }
    return Array.from(set);
  }, [selectedUser]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoading(true);
        setError('');
        const data = await getUsers(1, 200);
        const loadedUsers = data.users || [];
        setUsers(loadedUsers);

        if (loadedUsers.length === 0) {
          setSelectedUserId('');
          return;
        }

        const existsInitialUser = loadedUsers.some((user) => user.id === initialUserId);
        if (existsInitialUser) {
          setSelectedUserId(initialUserId);
          return;
        }

        setSelectedUserId(loadedUsers[0].id);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'No se pudieron cargar los usuarios');
      } finally {
        setIsLoading(false);
      }
    };

    void loadUsers();
  }, [initialUserId]);

  useEffect(() => {
    if (users.length === 0) return;
    const selectedStillExists = users.some((user) => user.id === selectedUserId);
    if (!selectedStillExists) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  useEffect(() => {
    if (!selectedUser) return;

    setNameParam(getFirstName(selectedUser.name));
    setJobCountParam('3');
    setTemplateName(DEFAULT_TEMPLATE);
    setLanguageCode(DEFAULT_LANGUAGE);
    setButtonPayload(DEFAULT_PAYLOAD);

    if (selectedUser.profile?.role?.trim()) {
      setRoleSelection(selectedUser.profile.role.trim());
      setCustomRole('');
    } else {
      setRoleSelection(COMMON_ROLE_OPTIONS[0]);
      setCustomRole('');
    }
  }, [selectedUser]);

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    setSuccessMessage('');
    setError('');
  };

  const handleSendTemplate = async () => {
    if (!selectedUserId || !selectedUser) {
      setError('Selecciona un usuario válido para enviar la template');
      return;
    }

    const roleParam = roleSelection === CUSTOM_ROLE_VALUE ? customRole.trim() : roleSelection.trim();
    if (!roleParam) {
      setError('Selecciona un rol o escribe un rol personalizado');
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      setIsSending(true);

      const result = await sendWhatsAppTemplateToUser({
        userId: selectedUserId,
        templateName,
        languageCode,
        buttonPayload,
        name: nameParam.trim() || getFirstName(selectedUser.name),
        jobCount: jobCountParam,
        role: roleParam,
      });

      setSuccessMessage(
        `Template enviada a ${result.phone} con payload ${result.buttonPayload}.`,
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo enviar la template');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Header
        title="Templates WhatsApp"
        subtitle="Envío manual instantáneo para validar flujos"
        actions={(
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
            isLoading={isLoading}
          >
            <RefreshCw size={18} className="mr-2" />
            Refrescar
          </Button>
        )}
      />

      <div className="p-8 space-y-6">
        {error && <Alert variant="error">{error}</Alert>}
        {successMessage && <Alert variant="success">{successMessage}</Alert>}

        <Card>
          <CardHeader>
            <CardTitle>Enviar Template Ahora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Buscar usuario"
                placeholder="Nombre, email o teléfono"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-admin-text-primary mb-1">
                  Usuario destino
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => handleSelectUser(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                  disabled={isLoading || userOptions.length === 0}
                >
                  {userOptions.length === 0 && (
                    <option value="">No hay usuarios disponibles</option>
                  )}
                  {userOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {(user.name || 'Sin nombre')} - {user.phone}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-admin-text-primary mb-1">Template</label>
                <select
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                >
                  {TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-admin-text-primary mb-1">Idioma</label>
                <select
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-admin-text-primary mb-1">Payload del botón</label>
                <select
                  value={buttonPayload}
                  onChange={(e) => setButtonPayload(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                >
                  {PAYLOAD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Parámetro 1 (nombre)"
                value={nameParam}
                onChange={(e) => setNameParam(e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-admin-text-primary mb-1">
                  Parámetro 2 (cantidad)
                </label>
                <select
                  value={jobCountParam}
                  onChange={(e) => setJobCountParam(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                >
                  {JOB_COUNT_OPTIONS.map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-admin-text-primary mb-1">
                  Parámetro 3 (rol)
                </label>
                <select
                  value={roleSelection}
                  onChange={(e) => setRoleSelection(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                  <option value={CUSTOM_ROLE_VALUE}>Otro (escribir manual)</option>
                </select>
              </div>
            </div>

            {roleSelection === CUSTOM_ROLE_VALUE && (
              <Input
                label="Rol personalizado"
                placeholder="Ej: Ingeniero de datos"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
              />
            )}

            {selectedUser && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-admin-text-secondary">
                Destino confirmado: {(selectedUser.name || 'Sin nombre')} ({selectedUser.phone}) | ID: {selectedUser.id}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSendTemplate} isLoading={isSending} disabled={!selectedUserId || !selectedUser}>
                <Send size={16} className="mr-2" />
                Enviar template
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
