export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatPhone(phone: string): string {
  if (phone.startsWith('57')) {
    return `+57 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
  }
  return phone;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getPlanColor(plan: 'FREEMIUM' | 'PREMIUM' | 'PRO'): string {
  switch (plan) {
    case 'PRO':
      return 'bg-amber-500 text-white';
    case 'PREMIUM':
      return 'bg-almia-purple text-white';
    default:
      return 'bg-gray-200 text-gray-700';
  }
}

export function getStatusColor(status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED'): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-100 text-green-800';
    case 'EXPIRED':
      return 'bg-yellow-100 text-yellow-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getPlanLabel(plan: 'FREEMIUM' | 'PREMIUM' | 'PRO'): string {
  switch (plan) {
    case 'PRO':
      return 'Pro';
    case 'PREMIUM':
      return 'Premium';
    default:
      return 'Freemium';
  }
}

export function getStatusLabel(status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED'): string {
  switch (status) {
    case 'ACTIVE':
      return 'Activo';
    case 'EXPIRED':
      return 'Expirado';
    case 'CANCELLED':
      return 'Cancelado';
    default:
      return status;
  }
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

