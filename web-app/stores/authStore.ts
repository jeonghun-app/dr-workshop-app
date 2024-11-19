import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  token: string | null;
  login: (token: string, userId: string) => void;
  logout: () => void;
}

// 로컬 스토리지에서 상태 가져오기 (브라우저 환경에서만)
const getInitialState = () => {
  if (typeof window === 'undefined') {
    return { isAuthenticated: false, userId: null, token: null };
  }
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');
  return {
    isAuthenticated: !!token,
    userId,
    token,
  };
};

export const useAuthStore = create<AuthState>((set) => ({
  ...getInitialState(),
  login: (token: string, userId: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
      localStorage.setItem('userId', userId);
    }
    set({ isAuthenticated: true, userId, token });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
    }
    set({ isAuthenticated: false, userId: null, token: null });
  },
}));
