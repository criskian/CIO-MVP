import { User } from '@/types';
import { formatPhone, formatDate, getPlanLabel, getStatusLabel } from './utils';

/**
 * Exporta usuarios a CSV con datos completos incluyendo perfil y preferencias
 * Usa punto y coma (;) como delimitador para compatibilidad con Excel en español
 */
export function exportUsersToCSV(users: User[]): void {
  const headers = [
    'ID',
    'Nombre',
    'Email',
    'Teléfono',
    'Plan',
    'Estado Suscripción',
    'Usos Restantes',
    'Fecha Registro',
    // Datos del perfil
    'Rol/Cargo',
    'Nivel Experiencia',
    'Ubicación',
    'Acepta Remoto',
    'Tipo Empleo',
    'Salario Mínimo',
    // Suscripción detallada
    'Inicio Freemium',
    'Freemium Expirado',
    'Inicio Premium/Pro',
    'Fin Premium/Pro',
  ];

  const rows = users.map((user) => {
    const subscription = user.subscription;
    const profile = user.profile;

    return [
      user.id,
      user.name || 'Sin nombre',
      user.email || '-',
      formatPhone(user.phone),
      subscription ? getPlanLabel(subscription.plan) : 'Sin plan',
      subscription ? getStatusLabel(subscription.status) : '-',
      subscription
        ? subscription.plan === 'FREEMIUM'
          ? `${subscription.freemiumUsesLeft}/3`
          : `${subscription.premiumUsesLeft}/5`
        : '-',
      formatDate(user.createdAt),
      // Datos del perfil
      profile?.role || '-',
      profile?.experienceLevel || '-',
      profile?.location || '-',
      profile?.acceptsRemote ? 'Sí' : 'No',
      profile?.jobType?.join(', ') || '-',
      profile?.minSalary ? `$${profile.minSalary.toLocaleString()}` : '-',
      // Suscripción detallada
      subscription?.freemiumStartDate ? formatDate(subscription.freemiumStartDate) : '-',
      subscription?.freemiumExpired ? 'Sí' : 'No',
      subscription?.premiumStartDate ? formatDate(subscription.premiumStartDate) : '-',
      subscription?.premiumEndDate ? formatDate(subscription.premiumEndDate) : '-',
    ];
  });

  // Usar punto y coma para compatibilidad con Excel en español
  const csvContent = [
    headers.join(';'),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')
    ),
  ].join('\n');

  // BOM para UTF-8 + contenido
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `usuarios_cio_${timestamp}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exporta suscripciones a CSV con datos detallados
 * Usa punto y coma (;) como delimitador para compatibilidad con Excel en español
 */
export function exportSubscriptionsToCSV(users: User[]): void {
  const headers = [
    'ID Usuario',
    'Nombre',
    'Email',
    'Teléfono',
    'Plan',
    'Estado',
    'Usos Restantes',
    'Inicio Freemium',
    'Fecha Activación Premium/Pro',
    'Fecha Expiración Premium/Pro',
    'Freemium Expirado',
    // Datos del perfil
    'Rol/Cargo',
    'Nivel Experiencia',
    'Ubicación',
    'Acepta Remoto',
  ];

  const rows = users
    .filter((u) => u.subscription)
    .map((user) => {
      const sub = user.subscription!;
      const profile = user.profile;

      return [
        user.id,
        user.name || 'Sin nombre',
        user.email || '-',
        formatPhone(user.phone),
        getPlanLabel(sub.plan),
        getStatusLabel(sub.status),
        sub.plan === 'FREEMIUM'
          ? `${sub.freemiumUsesLeft}/3`
          : `${sub.premiumUsesLeft}/5`,
        formatDate(sub.freemiumStartDate),
        sub.premiumStartDate ? formatDate(sub.premiumStartDate) : '-',
        sub.premiumEndDate ? formatDate(sub.premiumEndDate) : '-',
        sub.freemiumExpired ? 'Sí' : 'No',
        // Datos del perfil
        profile?.role || '-',
        profile?.experienceLevel || '-',
        profile?.location || '-',
        profile?.acceptsRemote ? 'Sí' : 'No',
      ];
    });

  // Usar punto y coma para compatibilidad con Excel en español
  const csvContent = [
    headers.join(';'),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `suscripciones_cio_${timestamp}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
