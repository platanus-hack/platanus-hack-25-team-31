'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import StockSummaryChart from '@/components/dashboard/stock-summary-chart';
import ProductsTable from '@/components/dashboard/products-table';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { UserProduct } from '@backend/src/modules/user-products/entities/user-product.entity';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { InventoryMovement } from '@backend/src/modules/inventory-movements/entities/inventory-movement.entity';

const TOKEN_DURATION_MS = process.env.NEXT_PUBLIC_TOKEN_DURATION_MS || 30 * 60 * 1000;

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const [isVerified, setIsVerified] = useState(false);
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

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
  }, [userId]);

  // Admin Check Effect
  useEffect(() => {
    if (isVerified) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      // Check Admin Status
      fetch(`${apiUrl}/users/${userId}`)
        .then((res) => res.json())
        .then((user) => {
          if (user.phoneNumber === '+56900000001') {
            router.push('/platanus-hack-admin');
          }
        })
        .catch((err) => console.error('Error fetching user', err));
    }
  }, [isVerified, userId, router]);

  // Data Fetching Effect (Polling)
  useEffect(() => {
    if (isVerified) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

      const fetchData = () => {
        // Fetch Products
        fetch(`${apiUrl}/products/user/${userId}`)
          .then((res) => {
            if (!res.ok) throw new Error('Error fetching products');
            return res.json();
          })
          .then((data) => {
            if (Array.isArray(data)) {
              setProducts((prev) => {
                if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
                return data;
              });
            }
          })
          .catch(() => {
            // Silent failure for polling to avoid toast spam
          });

        // Fetch Movements
        fetch(`${apiUrl}/inventory-movements/user/${userId}`)
          .then((res) => {
            if (!res.ok) throw new Error('Error fetching movements');
            return res.json();
          })
          .then((data) => {
            if (Array.isArray(data)) {
              setMovements((prev) => {
                if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
                return data;
              });
            }
          })
          .catch(() => {
            // Silent failure for polling
          });
      };

      // Initial fetch
      fetchData();

      // Poll every 0.9 seconds
      const interval = setInterval(fetchData, 900);

      return () => clearInterval(interval);
    }
  }, [isVerified, userId]);

  const handleVerify = async () => {
    if (otp.length !== 4) {
      toast.error('El código debe tener 4 dígitos');
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      const res = await fetch(`${apiUrl}/auth/validate-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin: otp }),
      });

      if (!res.ok) {
        throw new Error('Error de red');
      }

      const data = await res.json();

      if (data.valid) {
        const expiresAt = new Date().getTime() + Number(TOKEN_DURATION_MS);
        localStorage.setItem(`despens_token_${userId}`, JSON.stringify({ verified: true, expiresAt }));
        setIsVerified(true);
        toast.success('Código verificado correctamente');
      } else {
        toast.error('Código incorrecto o expirado.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error al validar código. Inténtalo de nuevo.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
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
        <StockSummaryChart products={products} movements={movements} />
      </div>

      {/* Products Table */}
      <ProductsTable products={products} />
    </div>
  );
}
