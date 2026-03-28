'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, User, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, continueAsGuest } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        router.push('/');
      } else {
        setError('Email atau password salah');
      }
    } catch {
      setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestAccess = () => {
    continueAsGuest();
    router.push('/');
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
                placeholder="admin@school.com"
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-gray-400">atau</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 rounded-xl"
            onClick={handleGuestAccess}
          >
            <User className="mr-2 h-4 w-4" />
            Lanjut sebagai Tamu
          </Button>

          <p className="text-center text-xs text-gray-400">
            Tamu dapat melihat data, tapi tidak dapat mengedit atau import
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
