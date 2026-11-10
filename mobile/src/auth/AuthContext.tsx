import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, loadTokens, saveTokens, setSignedOutListener } from '@/api/client';
import type { AuthTokens, Me, MeResponse, Role } from '@/api/types';

type Status = 'loading' | 'signedOut' | 'signedIn';
interface Ctx {
  status: Status;
  me: MeResponse | null;
  hasRole: (...r: Role[]) => boolean;
  login: (username: string, password: string) => Promise<void>;
  acceptSession: (res: AuthTokens & { user: Me }) => Promise<void>;
  refreshMe: () => Promise<MeResponse | null>;
  setMe: (m: MeResponse) => void;
  logout: () => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const qc = useQueryClient();

  const signOutLocal = useCallback(async () => {
    await saveTokens(null);
    setMe(null);
    setStatus('signedOut');
    qc.clear();
  }, [qc]);

  const refreshMe = useCallback(async () => {
    try {
      const m = await api<MeResponse>('/api/me');
      setMe(m);
      setStatus('signedIn');
      return m;
    } catch (e) {
      if ((e as { status?: number }).status === 401) await signOutLocal();
      throw e;
    }
  }, [signOutLocal]);

  useEffect(() => {
    setSignedOutListener(() => { void signOutLocal(); });
    (async () => {
      const t = await loadTokens();
      if (!t) return setStatus('signedOut');
      try {
        await refreshMe();
      } catch (e) {
        // Internet yo‘q bo‘lsa ham tokenlar saqlanib qoladi — keyinroq qayta urinadi
        if ((e as { status?: number }).status !== 401) setStatus('signedOut');
      }
    })();
  }, [refreshMe, signOutLocal]);

  const acceptSession = useCallback(async (res: AuthTokens & { user: Me }) => {
    await saveTokens(res);
    await refreshMe();
  }, [refreshMe]);

  const value = useMemo<Ctx>(() => ({
    status,
    me,
    hasRole: (...r) => Boolean(me?.user.roles.some((x) => r.includes(x))),
    login: async (username, password) => {
      const res = await api<AuthTokens & { user: Me }>('/api/auth/login', { body: { username, password } });
      await acceptSession(res);
    },
    acceptSession,
    refreshMe,
    setMe,
    logout: async () => {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      await signOutLocal();
    },
  }), [status, me, acceptSession, refreshMe, signOutLocal]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('AuthProvider yo‘q');
  return c;
}
