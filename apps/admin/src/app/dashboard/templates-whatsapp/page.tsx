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

export default function WhatsAppTemplatesPage() {
  const searchParams = useSearchParams();
  const initialUserId = searchParams.get('userId') || '';

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);
  const [searchTerm, setSearchTerm] = useState('');
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE);
  const [languageCode, setLanguageCode] = useState(DEFAULT_LANGUAGE);
  const [buttonPayload, setButtonPayload] = useState(DEFAULT_PAYLOAD);
  const [nameParam, setNameParam] = useState('');
  const [jobCountParam, setJobCountParam] = useState('3');
  const [roleParam, setRoleParam] = useState('');

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

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoading(true);
        setError('');
        const data = await getUsers(1, 200);
        const loadedUsers = data.users || [];
        setUsers(loadedUsers);

        setSelectedUserId((previous) => previous || loadedUsers[0]?.id || '');
      } catch (err: any) {
        setError(err?.response?.data?.message || 'No se pudieron cargar los usuarios');
      } finally {
        setIsLoading(false);
      }
    };

    void loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    const firstName = (selectedUser.name || '').trim().split(/\s+/)[0] || 'Usuario';
    setNameParam(firstName);
    setRoleParam(selectedUser.profile?.role || '');
  }, [selectedUser]);

  const handleSendTemplate = async () => {
    if (!selectedUserId) {
      setError('Selecciona un usuario para enviar la template');
      return;
    }

    try {
      setError('');
      setSuccessMessage('');
      setIsSending(true);

      const result = await sendWhatsAppTemplateToUser({
        userId: selectedUserId,
        templateName: templateName.trim() || DEFAULT_TEMPLATE,
        languageCode: languageCode.trim() || DEFAULT_LANGUAGE,
        buttonPayload: buttonPayload.trim() || DEFAULT_PAYLOAD,
        name: nameParam.trim(),
        jobCount: jobCountParam.trim(),
        role: roleParam.trim(),
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
        subtitle="Envio manual instantaneo para pruebas y validacion de flujos"
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
                placeholder="Nombre, email o telefono"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-admin-text-primary mb-1">
                  Usuario destino
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                  disabled={isLoading || filteredUsers.length === 0}
                >
                  {filteredUsers.length === 0 && (
                    <option value="">No hay usuarios disponibles</option>
                  )}
                  {filteredUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {(user.name || 'Sin nombre')} - {user.phone}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Template"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <Input
                label="Idioma"
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
              />
              <Input
                label="Payload del boton"
                value={buttonPayload}
                onChange={(e) => setButtonPayload(e.target.value)}
                helperText='Usa SEARCH_NOW para disparar "ver ofertas".'
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Parametro 1 (nombre)"
                value={nameParam}
                onChange={(e) => setNameParam(e.target.value)}
              />
              <Input
                label="Parametro 2 (cantidad)"
                value={jobCountParam}
                onChange={(e) => setJobCountParam(e.target.value)}
              />
              <Input
                label="Parametro 3 (rol)"
                value={roleParam}
                onChange={(e) => setRoleParam(e.target.value)}
              />
            </div>

            {selectedUser && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-admin-text-secondary">
                Destino: {(selectedUser.name || 'Sin nombre')} ({selectedUser.phone})
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSendTemplate} isLoading={isSending} disabled={!selectedUserId}>
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
