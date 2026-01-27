
export interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  subscription?: Subscription;
  profile?: UserProfile;
  alert?: AlertPreference;
  sessions?: Session[];
}

export interface UserProfile {
  id: string;
  userId: string;
  role: string;
  experienceLevel: string;
  location: string;
  acceptsRemote: boolean;
  jobType: string[];
  minSalary: number | null;
  cvUrl: string | null;
  createdAt: string;
  updatedAt: string;
}


export type PlanType = 'FREEMIUM' | 'PREMIUM';
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanType;
  freemiumUsesLeft: number;
  freemiumStartDate: string;
  freemiumExpired: boolean;
  premiumUsesLeft: number;
  premiumWeekStart: string | null;
  premiumStartDate: string | null;
  premiumEndDate: string | null;
  status: SubscriptionStatus;
  createdAt: string;
  updatedAt: string;
  user?: {
    name: string | null;
    phone: string;
    email: string | null;
  };
}


export interface Session {
  id: string;
  userId: string;
  state: string;
  deviceType: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertPreference {
  id: string;
  userId: string;
  frequency: string;
  time: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}


export interface Stats {
  totalUsers: number;
  freemiumUsers: number;
  premiumUsers: number;
  expiredUsers: number;
  recentUsers: number;
  timestamp: string;
}

export interface DetailedStats {
  summary: {
    totalUsers: number;
    freemiumActive: number;
    premiumActive: number;
    freemiumExpired: number;
    conversionRate: number;
    totalRevenue: number;
    totalJobsSent: number;
    usersWithSearches: number;
  };
  period: {
    startDate: string;
    endDate: string;
    newUsers: number;
    conversions: number;
    payments: number;
  };
  dailyStats: DailyStats[];
  timestamp: string;
}

export interface DailyStats {
  date: string;
  registros: number;
  conversiones: number;
  pagos: number;
}

export interface RecentActivity {
  recentUsers: {
    id: string;
    name: string | null;
    phone: string;
    createdAt: string;
    subscription: { plan: string; status: string } | null;
  }[];
  recentPayments: {
    id: string;
    email: string;
    amount: number;
    createdAt: string;
    user: { name: string | null; phone: string } | null;
  }[];
}


export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  users?: T[];
  data?: T[];
  pagination: Pagination;
}


export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

