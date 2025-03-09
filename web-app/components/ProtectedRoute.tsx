// components/ProtectedRoute.tsx
"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useEffect, useState } from "react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    } else {
      setIsChecking(false);
    }
  }, [isAuthenticated, router]);

  if (isChecking) {
    return <p>Loading...</p>;
  }

  return <>{children}</>;
}
