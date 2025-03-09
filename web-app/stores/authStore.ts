import { create } from 'zustand';
import { useEffect } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  token: string | null;
  login: (token: string, userId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userId: null,
  token: null,
  login: (token: string, userId: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem('token', token); // 브라우저 환경에서만 실행
    }
    set({ isAuthenticated: true, userId, token });
  },
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem('token'); // 브라우저 환경에서만 실행
    }
    set({ isAuthenticated: false, userId: null, token: null });
  },
}));

// 브라우저 환경에서 상태 초기화
export const initializeAuthState = () => {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated && typeof window !== "undefined") {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      useAuthStore.setState({ isAuthenticated: true, token: storedToken });
    }
  }
};

// React에서 초기화를 보장하기 위해 컴포넌트에서 호출
export function useInitializeAuth() {
  useEffect(() => {
    initializeAuthState();
  }, []);
}
