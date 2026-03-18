'use client';

import { useEffect, useState } from 'react';
import {
  Mail,
  Send,
  CalendarClock,
  FileText,
  Plus,
  Trash2,
  Pencil,
  Eye,
  Search,
  RefreshCw,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import Input from '@/components/ui/Input';
import Modal, { ModalFooter } from '@/components/ui/Modal';
import {
  createEmailCampaign,
  createEmailTemplate,
  deleteEmailCampaign,
  deleteEmailTemplate,
  getEmailCampaigns,
  getEmailLists,
  getEmailTemplates,
  getSentEmails,
  sendEmailCampaign,
  updateEmailCampaign,
  updateEmailTemplate,
} from '@/lib/api';
import {
  EmailCampaign,
  EmailCampaignStatus,
  EmailDispatch,
  EmailListOption,
  EmailRecipientList,
  EmailTemplate,
} from '@/types';
import { formatDate } from '@/lib/utils';

type TabId = 'campaigns' | 'sent' | 'templates';

const TAB_OPTIONS: { id: TabId; label: string }[] = [
  { id: 'campaigns', label: 'Campañas' },
  { id: 'sent', label: 'Enviados' },
  { id: 'templates', label: 'Plantillas' },
];

const RECIPIENT_LABELS: Record<EmailRecipientList, string> = {
  ALL_USERS: 'Todos con email',
  FREEMIUM_ACTIVE: 'Freemium activos',
  FREEMIUM_EXPIRED: 'Freemium expirados',
  PREMIUM_ACTIVE: 'Premium / Pro activos',
  NEW_LAST_7_DAYS: 'Nuevos (7 días)',
};

function getStatusBadgeVariant(status: EmailCampaignStatus): 'gray' | 'purple' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'SENT':
      return 'success';
    case 'PROCESSING':
      return 'purple';
    case 'SCHEDULED':
      return 'warning';
    case 'FAILED':
      return 'danger';
    default:
      return 'gray';
  }
}

export default function EmailsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('campaigns');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [lists, setLists] = useState<EmailListOption[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [sentRows, setSentRows] = useState<EmailDispatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [search, setSearch] = useState('');

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    slug: '',
    subject: '',
    description: '',
    contentHtml: '',
    isActive: true,
  });

  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    templateId: '',
    recipientList: 'ALL_USERS' as EmailRecipientList,
    mode: 'draft' as 'draft' | 'send_now' | 'schedule',
    scheduledFor: '',
  });

  const [quickSendForm, setQuickSendForm] = useState({
    name: '',
    templateId: '',
    recipientList: 'ALL_USERS' as EmailRecipientList,
  });

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setQuickSendForm((prev) => {
      const selectedTemplateExists = templates.some((template) => template.id === prev.templateId);
      const selectedListExists = lists.some((list) => list.id === prev.recipientList);

      return {
        ...prev,
        templateId: selectedTemplateExists ? prev.templateId : templates[0]?.id || '',
        recipientList: selectedListExists
          ? prev.recipientList
          : (lists[0]?.id || 'ALL_USERS') as EmailRecipientList,
      };
    });
  }, [templates, lists]);

  const loadAll = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [templateData, listData, campaignData, sentData] = await Promise.all([
        getEmailTemplates(),
        getEmailLists(),
        getEmailCampaigns(1, 100),
        getSentEmails(1, 100),
      ]);
      setTemplates(templateData);
      setLists(listData);
      setCampaigns(campaignData.campaigns || []);
      setSentRows(sentData.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo cargar el módulo de emails');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSent = async (term?: string) => {
    try {
      setIsRefreshing(true);
      const sentData = await getSentEmails(1, 100, term);
      setSentRows(sentData.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo refrescar correos enviados');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      slug: '',
      subject: '',
      description: '',
      contentHtml: '',
      isActive: true,
    });
    setIsTemplateModalOpen(true);
  };

  const openEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      slug: template.slug,
      subject: template.subject,
      description: template.description || '',
      contentHtml: template.contentHtml || '',
      isActive: template.isActive,
    });
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    try {
      setError('');
      setSuccessMessage('');

      if (!templateForm.name || !templateForm.subject) {
        setError('Nombre y asunto son obligatorios');
        return;
      }

      if (editingTemplate) {
        await updateEmailTemplate(editingTemplate.id, {
          name: templateForm.name,
          subject: templateForm.subject,
          description: templateForm.description,
          contentHtml: editingTemplate.type === 'PREDEFINED' ? undefined : templateForm.contentHtml,
          isActive: templateForm.isActive,
        });
      } else {
        const slug = (templateForm.slug || templateForm.name)
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s_-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_');

        await createEmailTemplate({
          name: templateForm.name,
          slug,
          subject: templateForm.subject,
          description: templateForm.description,
          contentHtml: templateForm.contentHtml,
          type: 'CUSTOM',
          isActive: templateForm.isActive,
        });
      }

      setIsTemplateModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo guardar la plantilla');
    }
  };

  const handleDeleteTemplate = async (template: EmailTemplate) => {
    if (!confirm(`Eliminar plantilla "${template.name}"?`)) return;
    try {
      setError('');
      setSuccessMessage('');
      await deleteEmailTemplate(template.id);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo eliminar la plantilla');
    }
  };

  const openCreateCampaign = () => {
    setEditingCampaign(null);
    setCampaignForm({
      name: '',
      templateId: templates[0]?.id || '',
      recipientList: (lists[0]?.id || 'ALL_USERS') as EmailRecipientList,
      mode: 'draft',
      scheduledFor: '',
    });
    setIsCampaignModalOpen(true);
  };

  const openEditCampaign = (campaign: EmailCampaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      templateId: campaign.templateId,
      recipientList: campaign.recipientList,
      mode: campaign.status === 'SCHEDULED' ? 'schedule' : 'draft',
      scheduledFor: campaign.scheduledFor
        ? new Date(campaign.scheduledFor).toISOString().slice(0, 16)
        : '',
    });
    setIsCampaignModalOpen(true);
  };

  const handleSaveCampaign = async () => {
    try {
      setError('');
      setSuccessMessage('');

      if (!campaignForm.name || !campaignForm.templateId) {
        setError('Nombre y plantilla son obligatorios para la campaña');
        return;
      }

      if (editingCampaign) {
        await updateEmailCampaign(editingCampaign.id, {
          name: campaignForm.name,
          recipientList: campaignForm.recipientList,
          scheduledFor: campaignForm.mode === 'schedule' && campaignForm.scheduledFor
            ? new Date(campaignForm.scheduledFor).toISOString()
            : undefined,
          status: campaignForm.mode === 'schedule' ? 'SCHEDULED' : 'DRAFT',
        });
      } else {
        await createEmailCampaign({
          name: campaignForm.name,
          templateId: campaignForm.templateId,
          recipientList: campaignForm.recipientList,
          sendNow: campaignForm.mode === 'send_now',
          scheduledFor: campaignForm.mode === 'schedule' && campaignForm.scheduledFor
            ? new Date(campaignForm.scheduledFor).toISOString()
            : undefined,
        });
      }

      setIsCampaignModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo guardar la campaña');
    }
  };

  const handleDeleteCampaign = async (campaign: EmailCampaign) => {
    if (!confirm(`Eliminar campaña "${campaign.name}"?`)) return;
    try {
      setError('');
      setSuccessMessage('');
      await deleteEmailCampaign(campaign.id);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo eliminar la campaña');
    }
  };

  const handleSendCampaignNow = async (campaign: EmailCampaign) => {
    if (!confirm(`Enviar ahora la campaña "${campaign.name}"?`)) return;
    try {
      setError('');
      setSuccessMessage('');
      await sendEmailCampaign(campaign.id);
      setSuccessMessage(`La campaña "${campaign.name}" se envió correctamente.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo enviar la campaña');
    }
  };

  const handleInstantSend = async () => {
    if (!quickSendForm.templateId) {
      setError('Selecciona una plantilla para enviar ahora');
      return;
    }

    try {
      setIsSendingNow(true);
      setError('');
      setSuccessMessage('');

      const template = templates.find((item) => item.id === quickSendForm.templateId);
      const timestamp = new Date().toLocaleString('es-CO');
      const campaignName = quickSendForm.name.trim()
        || `Envío inmediato - ${template?.name || 'Plantilla'} - ${timestamp}`;

      await createEmailCampaign({
        name: campaignName,
        templateId: quickSendForm.templateId,
        recipientList: quickSendForm.recipientList,
        sendNow: true,
      });

      setQuickSendForm((prev) => ({ ...prev, name: '' }));
      setSuccessMessage('Envío instantáneo ejecutado correctamente.');
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo ejecutar el envío instantáneo');
    } finally {
      setIsSendingNow(false);
    }
  };

  const openPredefinedPreview = (slug: string) => {
    const previewMap: Record<string, string> = {
      onboarding_email: '/notifications/preview-onboarding',
      profile_update_email: '/notifications/preview-profile-update',
      premium_activation_email: '/notifications/preview-premium-activation',
    };
    const previewPath = previewMap[slug] || '/notifications/preview';
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    window.open(`${baseUrl}${previewPath}`, '_blank');
  };

  return (
    <>
      <Header
        title="Emails"
        subtitle="Gestiona plantillas, campañas y monitorea los envíos"
        actions={(
          <Button variant="secondary" onClick={loadAll} isLoading={isLoading}>
            <RefreshCw size={18} className="mr-2" />
            Refrescar
          </Button>
        )}
      />

      <div className="p-8 space-y-6">
        {error && <Alert variant="error">{error}</Alert>}
        {successMessage && <Alert variant="success">{successMessage}</Alert>}

        <Card>
          <div className="flex flex-wrap gap-2">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab.id
                  ? 'bg-almia-purple text-white'
                  : 'bg-gray-100 text-admin-text-secondary hover:bg-gray-200'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </Card>

        {isLoading ? (
          <Card>
            <div className="py-16 text-center text-admin-text-secondary">Cargando módulo de emails...</div>
          </Card>
        ) : (
          <>
            {activeTab === 'campaigns' && (
              <Card>
                <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock size={20} />
                    Campañas de envío
                  </CardTitle>
                  <Button onClick={openCreateCampaign}>
                    <Plus size={18} className="mr-2" />
                    Nueva campaña
                  </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-xl border border-almia-purple-light/40 bg-almia-purple-light/5 p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                      <h3 className="text-base font-semibold text-admin-text-primary">Envío instantáneo</h3>
                      <span className="text-xs text-admin-text-secondary">
                        Selecciona plantilla + lista y envía en este momento.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input
                        label="Nombre de campaña (opcional)"
                        placeholder="Ej: Onboarding inmediato"
                        value={quickSendForm.name}
                        onChange={(e) => setQuickSendForm((prev) => ({ ...prev, name: e.target.value }))}
                      />

                      <div>
                        <label className="block text-sm font-medium text-admin-text-primary mb-1">Plantilla</label>
                        <select
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                          value={quickSendForm.templateId}
                          onChange={(e) => setQuickSendForm((prev) => ({ ...prev, templateId: e.target.value }))}
                        >
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-admin-text-primary mb-1">Lista de envío</label>
                        <select
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                          value={quickSendForm.recipientList}
                          onChange={(e) => setQuickSendForm((prev) => ({ ...prev, recipientList: e.target.value as EmailRecipientList }))}
                        >
                          {lists.map((list) => (
                            <option key={list.id} value={list.id}>
                              {list.name} ({list.count})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <Button
                        onClick={handleInstantSend}
                        isLoading={isSendingNow}
                        disabled={!quickSendForm.templateId || lists.length === 0}
                      >
                        <Send size={16} className="mr-2" />
                        Enviar ahora
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2">Campaña</th>
                          <th className="text-left py-3 px-2">Plantilla</th>
                          <th className="text-left py-3 px-2">Lista</th>
                          <th className="text-left py-3 px-2">Estado</th>
                          <th className="text-left py-3 px-2">Resultados</th>
                          <th className="text-left py-3 px-2">Fecha</th>
                          <th className="text-right py-3 px-2">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-admin-text-secondary">
                              No hay campañas todavía.
                            </td>
                          </tr>
                        ) : (
                          campaigns.map((campaign) => (
                            <tr key={campaign.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-2 font-medium">{campaign.name}</td>
                              <td className="py-3 px-2">{campaign.template?.name || '-'}</td>
                              <td className="py-3 px-2">{RECIPIENT_LABELS[campaign.recipientList]}</td>
                              <td className="py-3 px-2">
                                <Badge variant={getStatusBadgeVariant(campaign.status)}>
                                  {campaign.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-2">
                                {campaign.successCount}/{campaign.totalRecipients} OK
                              </td>
                              <td className="py-3 px-2 text-admin-text-secondary">
                                {campaign.scheduledFor
                                  ? `Programada: ${formatDate(campaign.scheduledFor)}`
                                  : campaign.sentAt
                                    ? `Enviada: ${formatDate(campaign.sentAt)}`
                                    : '-'}
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex justify-end gap-2">
                                  {campaign.status !== 'SENT' && campaign.status !== 'PROCESSING' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleSendCampaignNow(campaign)}
                                      title="Enviar ahora"
                                    >
                                      <Send size={16} />
                                    </Button>
                                  )}
                                  {campaign.status !== 'SENT' && campaign.status !== 'PROCESSING' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditCampaign(campaign)}
                                      title="Editar campaña"
                                    >
                                      <Pencil size={16} />
                                    </Button>
                                  )}
                                  {campaign.status !== 'PROCESSING' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteCampaign(campaign)}
                                      title="Eliminar campaña"
                                    >
                                      <Trash2 size={16} className="text-red-600" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'sent' && (
              <Card>
                <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <Mail size={20} />
                    Visualización de correos enviados
                  </CardTitle>
                  <div className="flex gap-2">
                    <div className="w-64">
                      <Input
                        placeholder="Buscar por email o campaña"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <Button variant="secondary" onClick={() => refreshSent(search)} isLoading={isRefreshing}>
                      <Search size={16} className="mr-2" />
                      Buscar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2">Destinatario</th>
                          <th className="text-left py-3 px-2">Campaña</th>
                          <th className="text-left py-3 px-2">Plantilla</th>
                          <th className="text-left py-3 px-2">Estado</th>
                          <th className="text-left py-3 px-2">Fecha</th>
                          <th className="text-left py-3 px-2">Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sentRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-admin-text-secondary">
                              Aún no hay registros de envío.
                            </td>
                          </tr>
                        ) : (
                          sentRows.map((row) => (
                            <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-2">
                                <p className="font-medium">{row.name || 'Usuario'}</p>
                                <p className="text-xs text-admin-text-secondary">{row.email}</p>
                              </td>
                              <td className="py-3 px-2">{row.campaign?.name || '-'}</td>
                              <td className="py-3 px-2">{row.campaign?.template?.name || '-'}</td>
                              <td className="py-3 px-2">
                                <Badge variant={row.status === 'SENT' ? 'success' : 'danger'}>
                                  {row.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-2 text-admin-text-secondary">
                                {row.sentAt ? formatDate(row.sentAt) : formatDate(row.createdAt)}
                              </td>
                              <td className="py-3 px-2 text-xs text-admin-text-secondary max-w-[240px]">
                                {row.errorMessage || row.providerMessageId || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'templates' && (
              <Card>
                <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <FileText size={20} />
                    Plantillas de email
                  </CardTitle>
                  <Button onClick={openCreateTemplate}>
                    <Plus size={18} className="mr-2" />
                    Nueva plantilla
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {templates.map((template) => (
                      <div key={template.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-admin-text-primary">{template.name}</h3>
                            <p className="text-xs text-admin-text-secondary mt-1">{template.slug}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={template.type === 'PREDEFINED' ? 'purple' : 'gray'}>
                              {template.type === 'PREDEFINED' ? 'Preestablecido' : 'Custom'}
                            </Badge>
                            <Badge variant={template.isActive ? 'success' : 'warning'}>
                              {template.isActive ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-sm text-admin-text-secondary mt-3">{template.description || 'Sin descripción'}</p>
                        <p className="text-sm mt-2"><span className="font-medium">Asunto:</span> {template.subject}</p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {template.type === 'PREDEFINED' && (
                            <Button variant="ghost" size="sm" onClick={() => openPredefinedPreview(template.slug)}>
                              <Eye size={14} className="mr-1" />
                              Preview
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openEditTemplate(template)}>
                            <Pencil size={14} className="mr-1" />
                            Editar
                          </Button>
                          {template.type !== 'PREDEFINED' && (
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(template)}>
                              <Trash2 size={14} className="mr-1 text-red-600" />
                              Eliminar
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title={editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={templateForm.name}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          {!editingTemplate && (
            <Input
              label="Slug"
              helperText="Si lo dejas vacío, se genera desde el nombre"
              value={templateForm.slug}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, slug: e.target.value }))}
            />
          )}
          <Input
            label="Asunto"
            value={templateForm.subject}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))}
          />
          <Input
            label="Descripción"
            value={templateForm.description}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
          />

          {(!editingTemplate || editingTemplate.type !== 'PREDEFINED') && (
            <div>
              <label className="block text-sm font-medium text-admin-text-primary mb-1">
                HTML del email
              </label>
              <textarea
                className="w-full min-h-[220px] px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
                value={templateForm.contentHtml}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, contentHtml: e.target.value }))}
                placeholder="<html>...</html>"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={templateForm.isActive}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Plantilla activa
          </label>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setIsTemplateModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSaveTemplate}>
            {editingTemplate ? 'Guardar cambios' : 'Crear plantilla'}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={isCampaignModalOpen}
        onClose={() => setIsCampaignModalOpen(false)}
        title={editingCampaign ? 'Editar campaña' : 'Nueva campaña'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Nombre de campaña"
            value={campaignForm.name}
            onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
          />

          <div>
            <label className="block text-sm font-medium text-admin-text-primary mb-1">Plantilla</label>
            <select
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
              value={campaignForm.templateId}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, templateId: e.target.value }))}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-admin-text-primary mb-1">Lista de destinatarios</label>
            <select
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
              value={campaignForm.recipientList}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, recipientList: e.target.value as EmailRecipientList }))}
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.count})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-admin-text-primary mb-1">Modo de envío</label>
            <select
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-almia-purple"
              value={campaignForm.mode}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, mode: e.target.value as 'draft' | 'send_now' | 'schedule' }))}
            >
              <option value="draft">Guardar borrador</option>
              <option value="send_now">Enviar ahora</option>
              <option value="schedule">Programar envío</option>
            </select>
          </div>

          {campaignForm.mode === 'schedule' && (
            <Input
              label="Fecha y hora programada"
              type="datetime-local"
              value={campaignForm.scheduledFor}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, scheduledFor: e.target.value }))}
            />
          )}
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setIsCampaignModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSaveCampaign}>
            {editingCampaign ? 'Guardar cambios' : 'Crear campaña'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
