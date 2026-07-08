import { create } from 'zustand';
import { api } from '@/lib/api';
import { disconnectAllSockets } from '@/lib/socket';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
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
    const data = await api<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      json: { email, password },
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
