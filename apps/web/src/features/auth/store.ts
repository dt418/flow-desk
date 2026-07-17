import { create } from 'zustand';
import { api } from '@/lib/api';
import { disconnectAllSockets } from '@/lib/socket';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  twoFactorEnabled?: boolean;
}

/** Returned by login when password is correct but TOTP is still required. */
export class TwoFactorRequiredError extends Error {
  challengeToken: string;
  constructor(challengeToken: string) {
    super('Two-factor authentication required');
    this.name = 'TwoFactorRequiredError';
    this.challengeToken = challengeToken;
  }
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  /** challengeToken optional when server holds it in httpOnly cookie (OAuth 2FA). */
  login2fa: (challengeToken: string | undefined, code: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const data = await api<{ user: AuthUser }>('/api/auth/me');
      set({ user: data.user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
  login: async (email, password) => {
    const data = await api<{
      user?: AuthUser;
      twoFactorRequired?: boolean;
      challengeToken?: string;
    }>('/api/auth/login', {
      method: 'POST',
      json: { email, password },
    });
    if (data.twoFactorRequired && data.challengeToken) {
      throw new TwoFactorRequiredError(data.challengeToken);
    }
    if (!data.user) {
      throw new Error('Login failed');
    }
    set({ user: data.user });
  },
  login2fa: async (challengeToken, code) => {
    const data = await api<{ user: AuthUser }>('/api/auth/login/2fa', {
      method: 'POST',
      json: {
        code,
        ...(challengeToken ? { challengeToken } : {}),
      },
    });
    set({ user: data.user });
  },
  register: async (email, password, name) => {
    const data = await api<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      json: { email, password, name },
    });
    set({ user: data.user });
  },
  logout: async () => {
    await api<{ ok: true }>('/api/auth/logout', { method: 'POST' });
    disconnectAllSockets();
    set({ user: null });
  },
}));

export function useAuth() {
  return useAuthStore();
}
