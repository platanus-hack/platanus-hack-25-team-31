'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Delete, Check } from 'lucide-react';

const TOKEN_DURATION_MS = process.env.NEXT_PUBLIC_TOKEN_DURATION_MS || 30 * 60 * 1000;

interface PinVerificationProps {
  userId: string;
  onVerify: () => void;
}

export default function PinVerification({ userId, onVerify }: PinVerificationProps) {
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle');

  const handleDigit = (digit: string) => {
    if (status !== 'idle') return;
    if (otp.length < 4) {
      setOtp((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    if (status !== 'idle') return;
    setOtp((prev) => prev.slice(0, -1));
  };

  const handleVerify = async () => {
    if (otp.length !== 4) {
      toast.error('El código debe tener 4 dígitos');
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
      console.log('apiUrl', apiUrl);
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

        setStatus('success');
        // Wait 400ms before proceeding
        setTimeout(() => {
          onVerify();
        }, 400);
      } else {
        setStatus('error');

        // Reset error state after animation
        setTimeout(() => {
          setStatus('idle');
          setOtp('');
        }, 500);
      }
    } catch (error) {
      console.error(error);
      toast.error('Error al validar código');
      setIsLoading(false);
    } finally {
      if (status !== 'success') {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 font-mono bg-slate-50">
      <style jsx>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-5px);
          }
          75% {
            transform: translateX(5px);
          }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
      <Card className="w-full max-w-xs border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none bg-white">
        <CardHeader className="border-b-4 border-black pb-4 text-center">
          <CardTitle className="text-xl uppercase tracking-widest">Security</CardTitle>
          <CardDescription className="text-xs uppercase font-bold text-slate-500">
            Ingresa el PIN entregado
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Screen */}
          <div
            className={`border-2 border-black p-4 mb-4 transition-colors duration-200 h-20 flex items-center justify-center ${
              status === 'error' ? 'bg-red-300 animate-shake' : status === 'success' ? 'bg-green-300' : 'bg-slate-100'
            }`}
          >
            <div className="text-center text-3xl tracking-[1em] font-bold overflow-hidden w-full flex items-center justify-center">
              {status === 'success' ? (
                <span className="tracking-normal">:)</span>
              ) : (
                otp
                  .padEnd(4, '_')
                  .split('')
                  .map((char, i) => (
                    <span key={i} className={i < otp.length ? 'text-black' : 'text-slate-300'}>
                      {i < otp.length ? otp[i] : '_'}
                    </span>
                  ))
              )}
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <Button
                key={num}
                variant="outline"
                className="h-14 text-xl border-2 border-black rounded-none hover:bg-black hover:text-white active:translate-y-1 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                onClick={() => handleDigit(num.toString())}
                disabled={isLoading || status !== 'idle'}
              >
                {num}
              </Button>
            ))}
            <Button
              variant="destructive"
              className="h-14 border-2 border-black rounded-none bg-red-500 hover:bg-red-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 transition-all"
              onClick={handleDelete}
              disabled={isLoading || status !== 'idle'}
            >
              <Delete className="h-6 w-6" />
            </Button>
            <Button
              variant="outline"
              className="h-14 text-xl border-2 border-black rounded-none hover:bg-black hover:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 transition-all"
              onClick={() => handleDigit('0')}
              disabled={isLoading || status !== 'idle'}
            >
              0
            </Button>
            <Button
              className="h-14 border-2 border-black rounded-none bg-green-500 hover:bg-green-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 transition-all"
              onClick={handleVerify}
              disabled={isLoading || status !== 'idle'}
            >
              <Check className="h-6 w-6" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
