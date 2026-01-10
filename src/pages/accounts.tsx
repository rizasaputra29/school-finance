'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import {
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface Account {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
}

const accountTypeConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; gradient: string }
> = {
  Asset: {
    label: 'Aset',
    icon: Wallet,
    gradient: 'from-blue-500 to-blue-600',
  },
  Liability: {
    label: 'Kewajiban',
    icon: CreditCard,
    gradient: 'from-red-500 to-red-600',
  },
  Equity: {
    label: 'Ekuitas',
    icon: PiggyBank,
    gradient: 'from-purple-500 to-purple-600',
  },
  Revenue: {
    label: 'Pendapatan',
    icon: TrendingUp,
    gradient: 'from-emerald-500 to-emerald-600',
  },
  Expense: {
    label: 'Beban',
    icon: TrendingDown,
    gradient: 'from-amber-500 to-amber-600',
  },
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/accounts');
        if (res.ok) {
          const data = await res.json();
          setAccounts(data);
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Group accounts by type
  const groupedAccounts = accounts.reduce(
    (acc, account) => {
      if (!acc[account.tipeAkun]) {
        acc[account.tipeAkun] = [];
      }
      acc[account.tipeAkun].push(account);
      return acc;
    },
    {} as Record<string, Account[]>
  );

  const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-slate-500">Memuat daftar akun...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Akun - Keuangan Sekolah</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daftar Akun</h1>
          <p className="text-slate-500">Chart of Accounts keuangan sekolah</p>
        </div>

        {/* Account Groups */}
        {accountTypes.map((type) => {
          const typeAccounts = groupedAccounts[type] || [];
          const config = accountTypeConfig[type];
          const Icon = config?.icon || Wallet;
          const totalSaldo = typeAccounts.reduce((sum, a) => sum + a.saldo, 0);

          return (
            <Card key={type} className="animate-fade-in overflow-hidden">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br ${config?.gradient || 'from-slate-500 to-slate-600'} shadow-md`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {config?.label || type}
                      </CardTitle>
                      <p className="text-sm text-slate-500">
                        {typeAccounts.length} akun
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Total Saldo</p>
                    <p className="text-xl font-bold text-slate-900">
                      {formatCurrency(totalSaldo)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {typeAccounts.length > 0 ? (
                  <div className="divide-y">
                    {typeAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="font-mono">
                            {account.kodeAkun}
                          </Badge>
                          <span className="font-medium text-slate-700">
                            {account.namaAkun}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(account.saldo)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-24 items-center justify-center text-slate-400">
                    Belum ada akun {config?.label.toLowerCase() || type.toLowerCase()}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {accounts.length === 0 && (
          <Card>
            <CardContent className="flex h-48 items-center justify-center text-slate-400">
              Belum ada data akun. Import dari Excel untuk menambahkan akun.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
