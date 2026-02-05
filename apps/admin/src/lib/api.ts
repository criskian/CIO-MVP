import axios, { AxiosInstance, AxiosError } from 'axios';
import { getAuthToken, logout } from './auth';
import {
  User,
  Subscription,
  Session,
  Stats,
  DetailedStats,
  RecentActivity,
  PaginatedResponse,
  LoginCredentials,
  AuthResponse,
} from '@/types';

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      logout();
    }

    const errorMessage = error.response?.data || {};
    const safeError = {
      ...error,
      response: {
        ...error.response,
        data: {
          message: (errorMessage as any)?.message || 'Error en la petición',
          statusCode: error.response?.status,
        },
      },
    };

    return Promise.reject(safeError);
  }
);

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/admin/auth/login', credentials);
  return data;
}

export async function getUsers(
  page: number = 1,
  limit: number = 20,
  search?: string
): Promise<PaginatedResponse<User>> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (search) {
    params.append('search', search);
  }

  const { data } = await api.get<PaginatedResponse<User>>(
    `/api/admin/users?${params.toString()}`
  );
  return data;
}

export async function getUserById(id: string): Promise<User> {
  const { data } = await api.get<User>(`/api/admin/users/${id}`);
  return data;
}

export async function getUserByPhone(phone: string): Promise<User> {
  const { data } = await api.get<User>(`/api/admin/users/phone/${phone}`);
  return data;
}

export async function createUser(userData: {
  phone: string;
  name: string;
  email?: string;
  createSubscription?: boolean;
  plan?: 'FREEMIUM' | 'PREMIUM' | 'PRO';
}): Promise<User> {
  const { data } = await api.post<User>('/api/admin/users', userData);
  return data;
}

export async function updateUser(
  id: string,
  userData: {
    name?: string;
    email?: string;
    phone?: string;
  }
): Promise<User> {
  const { data } = await api.put<User>(`/api/admin/users/${id}`, userData);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/api/admin/users/${id}`);
}

export async function deleteUserByPhone(phone: string): Promise<void> {
  await api.delete(`/api/admin/users/phone/${phone}`);
}


export async function getSubscription(userId: string): Promise<Subscription> {
  const { data } = await api.get<Subscription>(`/api/admin/subscriptions/${userId}`);
  return data;
}

export async function updateSubscription(
  userId: string,
  subscriptionData: {
    plan?: 'FREEMIUM' | 'PREMIUM' | 'PRO';
    status?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
    freemiumUsesLeft?: number;
    freemiumExpired?: boolean;
    premiumUsesLeft?: number;
  }
): Promise<Subscription> {
  const { data } = await api.put<Subscription>(
    `/api/admin/subscriptions/${userId}`,
    subscriptionData
  );
  return data;
}

export async function activatePremium(userId: string): Promise<Subscription> {
  const { data } = await api.post<Subscription>(
    `/api/admin/subscriptions/${userId}/activate-premium`
  );
  return data;
}

export async function activatePro(userId: string): Promise<Subscription> {
  const { data } = await api.post<Subscription>(
    `/api/admin/subscriptions/${userId}/activate-pro`
  );
  return data;
}

export async function resetFreemium(userId: string): Promise<Subscription> {
  const { data } = await api.post<Subscription>(
    `/api/admin/subscriptions/${userId}/reset-freemium`
  );
  return data;
}

export async function addUses(
  userId: string,
  uses: number,
  planType: 'FREEMIUM' | 'PREMIUM' | 'PRO'
): Promise<Subscription> {
  const { data } = await api.post<Subscription>(
    `/api/admin/subscriptions/${userId}/add-uses`,
    { uses, planType }
  );
  return data;
}


export async function getUserSessions(userId: string): Promise<Session[]> {
  const { data } = await api.get<Session[]>(`/api/admin/sessions/${userId}`);
  return data;
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await api.delete(`/api/admin/sessions/${userId}`);
}


export async function getStats(): Promise<Stats> {
  const { data } = await api.get<Stats>('/api/admin/stats');
  return data;
}

export async function getDetailedStats(startDate?: string, endDate?: string): Promise<DetailedStats> {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  const { data } = await api.get<DetailedStats>(`/api/admin/stats/detailed?${params.toString()}`);
  return data;
}

export async function getRecentActivity(limit = 10): Promise<RecentActivity> {
  const { data } = await api.get<RecentActivity>(`/api/admin/activity/recent?limit=${limit}`);
  return data;
}

export default api;

