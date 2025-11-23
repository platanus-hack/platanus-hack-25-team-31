'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import PinVerification from '@/components/auth/pin-verification';

interface AdminPageProps {
  userId: string;
}

export default function AdminPage({ userId }: AdminPageProps) {
  const [loading, setLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  // Check Token
  useEffect(() => {
    // Mask URL to hide the exact path

    const tokenStr = localStorage.getItem(`despens_token_${userId}`);
    if (tokenStr) {
      const token = JSON.parse(tokenStr);
      const now = new Date().getTime();
      if (now < token.expiresAt) {
        setIsVerified(true);
      } else {
        localStorage.removeItem(`despens_token_${userId}`);
      }
    }
  }, [userId]);

  const handleAdvanceDay = async () => {
    if (loading) return;
    setLoading(true);
    const toastId = toast.loading('Avanzando el tiempo...');

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      const res = await fetch(`${apiUrl}/admin/advance-day`, { method: 'POST' });

      if (!res.ok) throw new Error('Error advancing day');

      const data = await res.json();
      toast.success(data.message || 'Día avanzado correctamente', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Error al avanzar el día', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  if (!isVerified) {
    return <PinVerification userId={userId} onVerify={() => setIsVerified(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
        Panel de Administración 🕵️‍♂️
      </h1>
      <p className="text-slate-400 mb-12">Control del Tiempo y Simulación</p>

      <div className="grid gap-6 w-full max-w-md">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-2xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>⏳</span> Viaje en el Tiempo
          </h2>
          <p className="text-sm text-slate-400 mb-6">Avanza un día en la simulación.</p>

          <button
            onClick={handleAdvanceDay}
            disabled={loading}
            className={`w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-lg shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-3 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? <span className="animate-spin">↻</span> : <span>⏩</span>}
            {loading ? 'Simulando...' : 'Avanzar 1 Día'}
          </button>
        </div>
      </div>
    </div>
  );
}
