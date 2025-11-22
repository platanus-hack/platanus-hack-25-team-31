'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DUMMY_PRODUCTS } from '@/dummy-data/products';
import StockSummaryChart from '@/components/dashboard/stock-summary-chart';
import ProductsTable from '@/components/dashboard/products-table';

const OTP_CODE = '0000';
const TOKEN_DURATION_MS = process.env.TOKEN_DURATION_MS || 30 * 60 * 1000;

export default function DashboardPage() {
  const params = useParams();
  //const router = useRouter();
  const userId = params.userId as string;
  const [isVerified, setIsVerified] = useState(false);
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Visual-only URL update to mask user ID
    window.history.replaceState(null, '', '/dashboard');

    // Check for existing token on mount and re-renders
    const checkToken = () => {
      const tokenStr = localStorage.getItem(`despens_token_${userId}`);
      if (tokenStr) {
        const token = JSON.parse(tokenStr);
        const now = new Date().getTime();
        if (now < token.expiresAt) {
          setIsVerified(true);
        } else {
          localStorage.removeItem(`despens_token_${userId}`);
          setIsVerified(false);
        }
      } else {
        setIsVerified(false);
      }
      setIsLoading(false);
    };

    checkToken();

    // TODO: Implement interval to check expiration periodically after 1 minute
  }, [userId]);

  // Refresh logic: If user is on /dashboard manually (e.g. after refresh), they might be lost
  // because the dynamic route is /dashboard/[userId].
  // However, `window.history.replaceState` only changes the visual URL.
  // A real refresh would try to load `/dashboard` which might 404 if Next.js doesn't have a page there.
  // If we want to support refresh, we need a real /dashboard page that redirects based on token,
  // OR we remove the visual masking if it breaks UX.
  // The prompt says "si hacemos un refresh se tiene que hacer a dashbord/userid y no a dashbord".
  // Since we are in a dynamic route component, we can't easily force the browser to "remember" the real URL
  // for a refresh if we masked it, UNLESS we don't mask it, or use query params.
  // But the user wants the visual mask AND the refresh capability.
  // The only way to "refresh to dashboard/userid" while visually showing "dashboard" is if the browser
  // natively knew the underlying resource, which replaceState hides.
  // If the user refreshes, the browser requests the CURRENT URL bar content.
  // So if URL is `/dashboard`, browser requests `/dashboard`.
  // If we don't have a `app/dashboard/page.tsx`, it 404s.
  // I should probably create `app/dashboard/page.tsx` that handles this redirection logic.

  const handleVerify = () => {
    if (otp === OTP_CODE) {
      const expiresAt = new Date().getTime() + Number(TOKEN_DURATION_MS);
      localStorage.setItem(`despens_token_${userId}`, JSON.stringify({ verified: true, expiresAt }));
      setIsVerified(true);
      toast.success('Código verificado correctamente');
    } else {
      toast.error('Código incorrecto. Intenta con 0000');
    }
  };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Cargando...</div>;
  }

  if (!isVerified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Verificación requerida</CardTitle>
            <CardDescription>Ingresa el código de 4 dígitos enviado a tu dispositivo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="0000"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={4}
                className="text-center text-2xl tracking-widest"
                type="text"
                inputMode="numeric"
              />
            </div>
            <Button className="w-full" onClick={handleVerify}>
              Verificar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8 space-y-8">
      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-1">
        <StockSummaryChart products={DUMMY_PRODUCTS} />
      </div>

      {/* Products Table */}
      <ProductsTable products={DUMMY_PRODUCTS} />
    </div>
  );
}
