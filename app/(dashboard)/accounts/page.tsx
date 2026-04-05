'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatNumberInput, parseFormattedNumber } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
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

const INITIAL_FORM = {
  kodeAkun: '',
  namaAkun: '',
  tipeAkun: 'Asset',
  saldo: '',
};

export default function AccountsPage() {
  const { isAdmin } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/accounts');
      const result = await res.json();
      if (!result.success) {
        toast.error(result.error?.message || 'Gagal memuat data akun');
        return;
      }
      setAccounts(result.data);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      toast.error('Terjadi kesalahan saat memuat data akun');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const submitData = {
      ...formData,
      saldo: parseFormattedNumber(String(formData.saldo)),
    };

    const promise = fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitData),
    }).then(async (res) => {
      const result = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Gagal membuat akun');
      return result;
    });

    toast.promise(promise, {
      loading: 'Menyimpan akun...',
      success: (result) => {
        setIsCreateOpen(false);
        setFormData(INITIAL_FORM);
        fetchData();
        return `Akun ${result.data.namaAkun} berhasil dibuat`;
      },
      error: (err) => {
        setError(err.message);
        return err.message;
      },
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setError('');

    const submitData = {
      ...formData,
      saldo: parseFormattedNumber(String(formData.saldo)),
    };

    const promise = fetch(`/api/accounts/${selectedAccount.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitData),
    }).then(async (res) => {
      const result = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Gagal mengupdate akun');
      return result;
    });

    toast.promise(promise, {
      loading: 'Mengupdate akun...',
      success: (result) => {
        setIsEditOpen(false);
        setSelectedAccount(null);
        setFormData(INITIAL_FORM);
        fetchData();
        return `Akun ${result.data.namaAkun} berhasil diupdate`;
      },
      error: (err) => {
        setError(err.message);
        return err.message;
      },
    });
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;

    const promise = fetch(`/api/accounts/${selectedAccount.id}`, {
      method: 'DELETE',
    }).then(async (res) => {
      // Handle 204 No Content for DELETE
      if (res.status === 204) {
        return { success: true, data: selectedAccount };
      }
      const result = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Gagal menghapus akun');
      return result;
    });

    toast.promise(promise, {
      loading: 'Menghapus akun...',
      success: (result) => {
        setIsDeleteOpen(false);
        setSelectedAccount(null);
        fetchData();
        return `Akun ${result.data?.namaAkun || selectedAccount.namaAkun} berhasil dihapus`;
      },
      error: (err) => err.message,
    });
  };

  const openEditDialog = (acc: Account) => {
    setSelectedAccount(acc);
    setFormData({
      kodeAkun: acc.kodeAkun,
      namaAkun: acc.namaAkun,
      tipeAkun: acc.tipeAkun,
      saldo: formatNumberInput(acc.saldo),
    });
    setIsEditOpen(true);
  };

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

  const renderForm = (onSubmit: (e: React.FormEvent) => Promise<void>, submitLabel: string, isEdit = false) => (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="kodeAkun">Kode Akun</Label>
        <Input
          id="kodeAkun"
          value={formData.kodeAkun}
          onChange={(e) => setFormData({ ...formData, kodeAkun: e.target.value })}
          placeholder="Contoh: 101"
          required
          disabled={isEdit} // Kode akun shouldn't ideally be changed easily as it breaks relations
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="namaAkun">Nama Akun</Label>
        <Input
          id="namaAkun"
          value={formData.namaAkun}
          onChange={(e) => setFormData({ ...formData, namaAkun: e.target.value })}
          placeholder="Contoh: Kas Utama"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tipeAkun">Tipe Akun</Label>
        <select
          id="tipeAkun"
          value={formData.tipeAkun}
          onChange={(e) => setFormData({ ...formData, tipeAkun: e.target.value })}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          required
        >
          {accountTypes.map((type) => (
            <option key={type} value={type}>
              {accountTypeConfig[type]?.label || type}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="saldo">Saldo Awal / Saat Ini</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
          <Input
            id="saldo"
            value={formData.saldo}
            onChange={(e) => setFormData({ ...formData, saldo: formatNumberInput(e.target.value) })}
            placeholder="0"
            className="pl-10"
          />
        </div>
        <p className="text-xs text-slate-500">
          {isEdit ? 'Mengubah saldo secara langsung akan mempengaruhi balance sheet.' : 'Saldo awal akun.'}
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Dialog.Close asChild>
          <Button type="button" variant="outline">
            Batal
          </Button>
        </Dialog.Close>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#059DEA]" />
          <p className="text-sm text-gray-500">Memuat daftar akun...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Daftar Akun</h1>
          <p className="text-xs md:text-sm text-gray-500">Bagan akun untuk laporan keuangan</p>
        </div>

        {isAdmin && (
          <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <Dialog.Trigger asChild>
              <Button 
                onClick={() => {
                  setFormData(INITIAL_FORM);
                  setError('');
                }}
                size="sm"
                className="text-xs md:text-sm"
              >
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Tambah Akun</span>
                <span className="md:hidden">Tambah</span>
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl border border-slate-200">
                <Dialog.Title className="text-lg font-semibold text-slate-900">
                  Tambah Akun Baru
                </Dialog.Title>
                {renderForm(handleSubmit, 'Simpan')}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>

      {/* Account Groups */}
      {accountTypes.map((type) => {
        const typeAccounts = groupedAccounts[type] || [];
        const config = accountTypeConfig[type];
        const Icon = config?.icon || Wallet;
        const totalSaldo = typeAccounts.reduce((sum, a) => sum + a.saldo, 0);

        return (
          <Card key={type} className="shadow-sm overflow-hidden bg-white">
            <CardHeader className="border-b border-gray-100 bg-gray-50 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#059DEA]/20 text-gray-700"
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-800">
                      {config?.label || type}
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      {typeAccounts.length} akun
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Saldo</p>
                  <p className="text-lg font-bold text-slate-900 font-mono">
                    {formatCurrency(totalSaldo)}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {typeAccounts.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {typeAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <span className="font-mono text-xs sm:text-sm font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {account.kodeAkun}
                        </span>
                        <span className="font-medium text-sm sm:text-base text-slate-700">
                          {account.namaAkun}
                        </span>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 pl-11 sm:pl-0">
                        <span className="font-semibold text-sm sm:text-base text-slate-900">
                          {formatCurrency(account.saldo)}
                        </span>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditDialog(account)}
                            >
                              <Pencil className="h-4 w-4 text-slate-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                setSelectedAccount(account);
                                setIsDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
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
            Belum ada data akun. Import dari Excel atau Tambah Akun.
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog.Root open={isEditOpen} onOpenChange={setIsEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              Edit Akun
            </Dialog.Title>
            {renderForm(handleEdit, 'Update', true)}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Dialog */}
      <Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              Hapus Akun
            </Dialog.Title>
            <p className="mt-2 text-sm text-slate-600">
              Apakah Anda yakin ingin menghapus akun ini?
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="outline">Batal</Button>
              </Dialog.Close>
              <Button variant="destructive" onClick={handleDelete}>
                Hapus
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
