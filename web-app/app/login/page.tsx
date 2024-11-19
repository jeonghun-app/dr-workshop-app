// app/login/page.tsx
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post('/api/login', { username, password }); // 엔드포인트 확인
      console.log('Login response:', response.data);
      const { token, userId } = response.data;
      login(token, userId.toString());
      router.push('/');
    } catch (error) {
      console.log('Login error:', error);
      alert('Login failed');
      }
      
    }
 

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto mt-10">
      <h1 className="text-2xl font-bold">Login</h1>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        className="p-2 border rounded w-full mt-2"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="p-2 border rounded w-full mt-2"
      />
      <button type="submit" className="bg-blue-500 text-white p-2 rounded w-full mt-4">
        Login
      </button>
    </form>
  );
}