import { Platform } from 'react-native';
import { storage } from '@/lib/storage';
import type { AuthTokens } from './types';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const KEY = 'bookmall.tokens.v1';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data: Record<string, any> = {}) {
    super(message);
  }
  get fields(): Record<string, string> { return this.data.fields ?? {}; }
}

let tokens: { accessToken: string; refreshToken: string } | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

export const setSignedOutListener = (fn: () => void) => { onSignedOut = fn; };

export async function loadTokens() {
  const raw = await storage.get(KEY);
  tokens = raw ? JSON.parse(raw) : null;
  return tokens;
}
export async function saveTokens(t: AuthTokens | null) {
  tokens = t ? { accessToken: t.accessToken, refreshToken: t.refreshToken } : null;
  if (tokens) await storage.set(KEY, JSON.stringify(tokens));
  else await storage.remove(KEY);
}
export const hasTokens = () => Boolean(tokens);

async function refreshTokens(): Promise<boolean> {
  if (!tokens) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens!.refreshToken }),
      });
      if (!res.ok) return false;
      await saveTokens(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; form?: FormData };

/** Server bilan aloqa. Access token eskirsa — avtomatik yangilanadi; bo‘lmasa — tizimdan chiqariladi. */
export async function api<T = any>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const qs = opts.query
    ? '?' + Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${qs}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Internet aloqasi yo‘q yoki server javob bermayapti');
  }
  if (res.status === 401 && tokens && !retried && !path.startsWith('/api/auth/login')) {
    if (await refreshTokens()) return api<T>(path, opts, true);
    await saveTokens(null);
    onSignedOut?.();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.code ?? 'ERROR', data.error ?? 'Xatolik yuz berdi', data);
  return data as T;
}

/** Rasm yoki videoni yuklaydi va manzilini qaytaradi. */
export async function uploadFile(file: { uri: string; mimeType?: string | null; fileName?: string | null; file?: File }) {
  const form = new FormData();
  if (Platform.OS === 'web' && file.file) form.append('file', file.file);
  else form.append('file', { uri: file.uri, name: file.fileName ?? 'upload', type: file.mimeType ?? 'application/octet-stream' } as unknown as Blob);
  return api<{ url: string; kind: 'image' | 'video' }>('/api/uploads', { form });
}
