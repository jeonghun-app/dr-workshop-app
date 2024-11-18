// stores/authStore.ts
import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  userId: number | null;
  token: string | null;
  login: (token: string, userId: number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userId: null,
  token: null,
  login: (token: string, userId: string) => {
    localStorage.setItem('token', token);
    set({ isAuthenticated: true, userId, token });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ isAuthenticated: false, userId: null, token: null });
  },
}));
