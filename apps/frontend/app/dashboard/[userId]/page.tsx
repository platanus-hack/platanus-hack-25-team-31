'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import UserPage from './components/user-page';
import AdminPage from './components/admin-page';

export default function DashboardRouter() {
  const params = useParams();
  const userId = params.userId as string;
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // Mask URL logic moved to sub-components or kept here?
    // UserPage has logic to replace URL to '/dashboard'.
    // AdminPage has logic to replace URL to '/admin'.
    // Let's keep it in components so they set the right "masked" URL.

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    fetch(`${apiUrl}/users/${userId}/is-admin`)
      .then((res) => res.json())
      .then((data) => {
        setIsAdmin(data.isAdmin);
      })
      .catch(() => {
        setIsAdmin(false); // Fallback to user
      });
  }, [userId]);

  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return isAdmin ? <AdminPage userId={userId} /> : <UserPage userId={userId} />;
}
