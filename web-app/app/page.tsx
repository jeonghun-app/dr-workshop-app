// app/page.tsx
import ProtectedRoute from '@/components/ProtectedRoute';
import AccountManagement from '@/components/AccountManagement';

export default function HomePage() {
  return (
    <ProtectedRoute>
      <AccountManagement />
    </ProtectedRoute>
  );
}
