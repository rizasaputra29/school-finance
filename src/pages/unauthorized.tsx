import { useRouter } from 'next/router';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg text-center">
        <div className="flex justify-center">
          <ShieldX className="h-16 w-16 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Akses Ditolak
        </h1>
        <p className="text-gray-600">
          Anda tidak memiliki izin untuk mengakses halaman ini.
          Silakan hubungi administrator jika Anda memerlukan akses.
        </p>
        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            Kembali ke Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
