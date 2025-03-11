import { useEffect } from "react";
import { create } from "zustand";

interface AuthState {
    isAuthenticated: boolean;
    userId: string | null;
    token: string | null;
    login: (token: string, userId: string) => void;
    logout: () => void;
    initializeAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false,
    userId: null,
    token: null,

    // 로그인 메서드
    login: (token: string, userId: string) => {
        localStorage.setItem("token", token);
        localStorage.setItem("userId", userId);
        set({ isAuthenticated: true, userId, token });
    },

    // 로그아웃 메서드
    logout: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        set({ isAuthenticated: false, userId: null, token: null });
    },

    // 초기화 메서드
    initializeAuth: () => {
        if (typeof window !== "undefined") {
            const token = localStorage.getItem("token");
            const userId = localStorage.getItem("userId");
            if (token && userId) {
                set({ isAuthenticated: true, token, userId });
            } else {
                set({ isAuthenticated: false, token: null, userId: null });
            }
        }
    },
}));

// 브라우저 환경에서 상태 초기화
export const initializeAuthState = () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated && typeof window !== "undefined") {
        const storedToken = localStorage.getItem("token");
        if (storedToken) {
            useAuthStore.setState({
                isAuthenticated: true,
                token: storedToken,
            });
        }
    }
};

// React에서 초기화를 보장하기 위해 컴포넌트에서 호출
export function useInitializeAuth() {
    useEffect(() => {
        initializeAuthState();
    }, []);
}
