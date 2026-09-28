// 统一走 API Gateway（默认 http://localhost:4000/api）
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

export interface Product {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  status: 'on' | 'off' | 'deleted';
  emoji: string;
  description: string;
}

export interface InventoryItem {
  productId: string;
  availableQuantity: number;
  reservedQuantity: number;
  lowStock?: boolean;
}

export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  priceCents: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderLine[];
  totalAmountCents: number;
  status: 'created' | 'completed' | 'cancelled';
  createdAt: string;
}

const TOKEN_KEY = 'fresh_token';
const USER_KEY = 'fresh_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export function saveSession(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const user = getUser();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(user ? { 'x-user-id': user.id } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({ code: res.status, data: null, message: '请求失败' }));
  if (!res.ok || body.code !== 0) {
    throw new Error(body.message || '请求失败');
  }
  return body.data as T;
}
