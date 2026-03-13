
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


export type PlanType = 'FREEMIUM' | 'PREMIUM' | 'PRO';
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
    totalTemplatesSent: number;
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

export type EmailTemplateType = 'PREDEFINED' | 'CUSTOM';
export type EmailCampaignStatus = 'DRAFT' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type EmailRecipientList =
  | 'ALL_USERS'
  | 'FREEMIUM_ACTIVE'
  | 'FREEMIUM_EXPIRED'
  | 'PREMIUM_ACTIVE'
  | 'NEW_LAST_7_DAYS';

export interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  subject: string;
  contentHtml: string | null;
  type: EmailTemplateType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailListOption {
  id: EmailRecipientList;
  name: string;
  description: string;
  count: number;
}

export interface EmailCampaign {
  id: string;
  name: string;
  templateId: string;
  recipientList: EmailRecipientList;
  status: EmailCampaignStatus;
  scheduledFor: string | null;
  sentAt: string | null;
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  template?: EmailTemplate;
  _count?: {
    dispatches: number;
  };
}

export interface EmailDispatch {
  id: string;
  campaignId: string;
  userId: string | null;
  email: string;
  name: string | null;
  status: string;
  errorMessage: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
  campaign?: EmailCampaign;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string;
  } | null;
}

