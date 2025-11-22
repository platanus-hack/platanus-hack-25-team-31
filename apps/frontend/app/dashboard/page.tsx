'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Try to find a valid token in localStorage
    // We iterate over keys because we don't know the userId a priori if we are just at /dashboard
    // Pattern: despens_token_${userId}
    
    // A simple heuristic: find the most recently used or first valid token.
    let foundUserId = null;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('despens_token_')) {
        const tokenStr = localStorage.getItem(key);
        if (tokenStr) {
           try {
             const token = JSON.parse(tokenStr);
             const now = new Date().getTime();
             if (now < token.expiresAt) {
               foundUserId = key.replace('despens_token_', '');
               break;
             }
           } catch (e) {
             // ignore invalid JSON
           }
        }
      }
    }

    if (foundUserId) {
      router.replace(`/dashboard/${foundUserId}`);
    } else {
      // If no valid token found, maybe redirect home or show error
      // For now, redirecting to home seems safest or a generic login
      // But user asked to refresh to dashboard/userid. 
      // If we don't know userid, we can't. 
      // Assuming the user "lost" the context, we might redirect to a known demo user or 404.
      router.replace('/'); 
    }
  }, [router]);

  return <div className="flex min-h-screen items-center justify-center">Redirigiendo...</div>;
}

