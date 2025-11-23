'use client';

import { useState, useEffect } from 'react';
import ProductsTable from '@/components/dashboard/products-table';
import PinVerification from '@/components/auth/pin-verification';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { UserProduct } from '@backend/src/modules/user-products/entities/user-product.entity';
import { Movement, StockTimelineSection } from '@/components/dashboard/stock-timeline-section';

interface UserPageProps {
  userId: string;
}

export default function UserPage({ userId }: UserPageProps) {
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  useEffect(() => {
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
          .catch((err) => console.error(err));

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
          .catch((err) => console.error(err));
      };

      fetchData();
      const interval = setInterval(fetchData, 900);
      return () => clearInterval(interval);
    }
  }, [isVerified, userId]);

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
    return <PinVerification userId={userId} onVerify={() => setIsVerified(true)} />;
  }

  return (
    <div className="min-h-screen bg-background p-2 space-y-8">
      <div className="grid gap-4 md:grid-cols-1">
        <StockTimelineSection products={products} movements={movements} />
      </div>
      <ProductsTable products={products} />
    </div>
  );
}
