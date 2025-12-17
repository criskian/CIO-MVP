import { User } from '@/types';
import { formatPhone, formatDate, getPlanLabel, getStatusLabel } from './utils';

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
  ];

  const rows = users.map((user) => {
    const subscription = user.subscription;
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
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

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

export function exportSubscriptionsToCSV(users: User[]): void {
  const headers = [
    'ID Usuario',
    'Nombre',
    'Email',
    'Teléfono',
    'Plan',
    'Estado',
    'Usos Restantes',
    'Inicio Periodo',
    'Fecha Activación Premium',
    'Freemium Expirado',
  ];

  const rows = users
    .filter((u) => u.subscription)
    .map((user) => {
      const sub = user.subscription!;
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
        sub.freemiumExpired ? 'Sí' : 'No',
      ];
    });

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
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

