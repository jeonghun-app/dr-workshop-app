import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  token: string | null;
  login: (token: string, userId: string) => void;
  logout: () => void;
  initializeAuth: () => void; // 초기화 함수 추가
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userId: null,
  token: null,

  // 로그인 메서드
  login: (token: string, userId: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId);
    set({ isAuthenticated: true, userId, token });
  },

  // 로그아웃 메서드
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    set({ isAuthenticated: false, userId: null, token: null });
  },

  // 초기화 메서드
  initializeAuth: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');
      if (token && userId) {
        set({ isAuthenticated: true, token, userId });
      }
    }
  },
}));
