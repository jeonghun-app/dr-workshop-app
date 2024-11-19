// stores/authStore.ts
import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  token: string | null;
  login: (token: string, userId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!localStorage.getItem('token'),
  userId: localStorage.getItem('userId'),
  token: localStorage.getItem('token'),
  login: (token: string, userId: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId);
    set({ isAuthenticated: true, userId, token });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    set({ isAuthenticated: false, userId: null, token: null });
  },
}));
