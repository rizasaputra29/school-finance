'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { signIn } from '@/lib/auth-client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, ArrowLeft, Info } from 'lucide-react';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: isAuthLoading } = useAuth();

  // Check if redirected due to expired session
  const expired = searchParams.get('expired') === 'true';
  const redirectUrl = searchParams.get('redirect') || '/';

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!isAuthLoading && user) {
      router.push(redirectUrl);
    }
  }, [user, isAuthLoading, router, redirectUrl]);

  // Show loading state while checking auth
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#059DEA] border-t-transparent" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn.email({
        email,
        password,
        callbackURL: redirectUrl,
      });

      if (result.error) {
        throw new Error(result.error.message || 'Login gagal');
      }

      // Better Auth handles redirect via callbackURL
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Email atau password salah';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#059DEA]/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[#059DEA]/10 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md border border-gray-200 bg-white shadow-xl rounded-2xl">
        {/* Back Button */}
        <button
          onClick={() => router.push('/')}
          className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-white/80 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-medium">Kembali</span>
        </button>
        
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="mx-auto flex h-20 w-20 items-center justify-center">
            <Image 
              src="/logo.svg" 
              alt="Al Madeena Islamic School" 
              width={80}
              height={80}
              className="object-contain"
            />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Al Madeena Islamic School
            </CardTitle>
            <CardDescription className="text-gray-500">
              Sistem Keuangan Sekolah
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="owner@school.finance"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {expired && (
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-600 flex items-center gap-2">
                <Info className="h-4 w-4 flex-shrink-0" />
                Sesi Anda telah berakhir. Silakan login kembali.
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-11 bg-[#059DEA] text-white hover:bg-[#0589d4] font-medium rounded-xl" 
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Memproses...
                </div>
              ) : (
                'Masuk'
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-gray-400">
            Masuk dengan akun owner yang telah dibuat
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
