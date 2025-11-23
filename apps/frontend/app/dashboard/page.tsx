'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function DashboardEntryPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userId.trim()) {
      router.push(`/dashboard/${userId.trim()}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Despens.ai</CardTitle>
          <CardDescription>Ingresa tu ID de usuario para continuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="User ID (UUID)"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="text-center"
              />
            </div>
            <Button className="w-full" type="submit" disabled={!userId.trim()}>
              Continuar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
