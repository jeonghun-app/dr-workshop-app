// lib/api.ts
import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  console.error('Request error:', error);
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.error("Unauthorized: Redirecting to login");
      useAuthStore.getState().logout();
      window.location.href = "/login"; // 강제 로그아웃 처리
    }
    return Promise.reject(error);
  }
);

