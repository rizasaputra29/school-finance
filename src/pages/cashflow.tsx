'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Search, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, Filter, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatShortDate, formatNumberInput, parseFormattedNumber } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';

interface Cashflow {
  id: string;
  tanggal: string;
  keterangan: string;
  kodeAkun: string;
  kategori: string | null;
  debit: number;
  kredit: number;
  referenceId: string | null;
}

interface Account {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Summary {
  totalDebit: number;
  totalKredit: number;
  saldo: number;
}

const INITIAL_FORM = {
  tanggal: new Date().toISOString().split('T')[0],
  keterangan: '',
  kodeAkun: '',
  kategori: '',
  debit: '',
  kredit: '',
};

export default function CashflowPage() {
  const { isAdmin } = useAuth();
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [summary, setSummary] = useState<Summary>({
    totalDebit: 0,
    totalKredit: 0,
    saldo: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCashflow, setSelectedCashflow] = useState<Cashflow | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [error, setError] = useState('');

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const fetchData = async (page = 1) => {
    setIsLoading(true);
    try {
      let url = `/api/cashflow?page=${page}&limit=10`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (typeFilter !== 'all') url += `&type=${typeFilter}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCashflows(data.data);
        setPagination(data.pagination);
        setSummary(data.summary || { totalDebit: 0, totalKredit: 0, saldo: 0 });
      }
    } catch (error) {
      console.error('Failed to fetch cashflows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchData();
  }, [typeFilter, startDate, endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const submitData = {
        ...formData,
        debit: parseFormattedNumber(String(formData.debit)),
        kredit: parseFormattedNumber(String(formData.kredit)),
      };

      const res = await fetch('/api/cashflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });
      
      const data = await res.json();

      if (res.ok) {
        setIsCreateOpen(false);
        setFormData(INITIAL_FORM);
        fetchData(pagination.page);
      } else {
        setError(data.error || 'Gagal menyimpan transaksi');
      }
    } catch (error) {
      console.error('Failed to create cashflow:', error);
      setError('Terjadi kesalahan');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCashflow) return;
    setError('');

    try {
      const submitData = {
        ...formData,
        debit: parseFormattedNumber(String(formData.debit)),
        kredit: parseFormattedNumber(String(formData.kredit)),
      };

      const res = await fetch(`/api/cashflow/${selectedCashflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      const data = await res.json();

      if (res.ok) {
        setIsEditOpen(false);
        setSelectedCashflow(null);
        setFormData(INITIAL_FORM);
        fetchData(pagination.page);
      } else {
        setError(data.error || 'Gagal mengupdate transaksi');
      }
    } catch (error) {
      console.error('Failed to update cashflow:', error);
      setError('Terjadi kesalahan');
    }
  };

  const handleDelete = async () => {
    if (!selectedCashflow) return;
    
    try {
      const res = await fetch(`/api/cashflow/${selectedCashflow.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setIsDeleteOpen(false);
        setSelectedCashflow(null);
        fetchData(pagination.page);
      }
    } catch (error) {
      console.error('Failed to delete cashflow:', error);
    }
  };

  const openEditDialog = (cf: Cashflow) => {
    setSelectedCashflow(cf);
    setFormData({
      tanggal: new Date(cf.tanggal).toISOString().split('T')[0],
      keterangan: cf.keterangan,
      kodeAkun: cf.kodeAkun,
      kategori: cf.kategori || '',
      debit: cf.debit > 0 ? formatNumberInput(cf.debit) : '',
      kredit: cf.kredit > 0 ? formatNumberInput(cf.kredit) : '',
    });
    setIsEditOpen(true);
  };

  const filteredCashflows = cashflows.filter(
    (cf) =>
      cf.keterangan.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cf.kodeAkun.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cf.kategori && cf.kategori.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const clearFilters = () => {
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const renderForm = (onSubmit: (e: React.FormEvent) => Promise<void>, submitLabel: string) => (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="tanggal">Tanggal</Label>
        <Input
          id="tanggal"
          type="date"
          value={formData.tanggal}
          onChange={(e) =>
            setFormData({ ...formData, tanggal: e.target.value })
          }
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="keterangan">Keterangan</Label>
        <Input
          id="keterangan"
          value={formData.keterangan}
          onChange={(e) =>
            setFormData({ ...formData, keterangan: e.target.value })
          }
          placeholder="Contoh: Pembayaran Listrik"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="kodeAkun">Akun</Label>
          <select
            id="kodeAkun"
            value={formData.kodeAkun}
            onChange={(e) =>
              setFormData({ ...formData, kodeAkun: e.target.value })
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            required
          >
            <option value="">-- Pilih Akun --</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.kodeAkun}>
                {acc.kodeAkun} - {acc.namaAkun}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kategori">Kategori</Label>
          <Input
            id="kategori"
            value={formData.kategori}
            onChange={(e) =>
              setFormData({ ...formData, kategori: e.target.value })
            }
            placeholder="Contoh: Operasional"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="debit">Debit (Masuk)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
            <Input
              id="debit"
              value={formData.debit}
              onChange={(e) =>
                setFormData({ ...formData, debit: formatNumberInput(e.target.value) })
              }
              placeholder="0"
              className="pl-10"
              disabled={!!formData.kredit && formData.kredit !== '0'}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kredit">Kredit (Keluar)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
            <Input
              id="kredit"
              value={formData.kredit}
              onChange={(e) =>
                setFormData({ ...formData, kredit: formatNumberInput(e.target.value) })
              }
              placeholder="0"
              className="pl-10"
              disabled={!!formData.debit && formData.debit !== '0'}
            />
          </div>
        </div>
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

  return (
    <>
      <Head>
        <title>Cashflow - Keuangan Sekolah</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cashflow</h1>
            <p className="text-gray-500">Kelola arus kas masuk dan keluar</p>
          </div>

          {isAdmin && (
            <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <Dialog.Trigger asChild>
                <Button onClick={() => {
                  setFormData(INITIAL_FORM);
                  setError('');
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Transaksi
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
                  <Dialog.Title className="text-lg font-semibold text-slate-900">
                    Tambah Transaksi
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-slate-500">
                    Masukkan detail transaksi baru
                  </Dialog.Description>
                  {renderForm(handleSubmit, 'Simpan')}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#c6ef4e]/20">
                <TrendingUp className="h-6 w-6 text-gray-700" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Total Pendapatan</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(summary.totalDebit)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
                <TrendingDown className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Total Pengeluaran</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(summary.totalKredit)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#c6ef4e] shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/50">
                <Wallet className="h-6 w-6 text-gray-900" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">Saldo Akhir</p>
                <p className={`text-xl font-bold ${summary.saldo >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                  {formatCurrency(summary.saldo)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Cari keterangan, kode akun, atau kategori..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Tipe Transaksi</Label>
                  <div className="flex gap-1">
                    <Button
                      variant={typeFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTypeFilter('all')}
                    >
                      Semua
                    </Button>
                    <Button
                      variant={typeFilter === 'income' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTypeFilter('income')}
                    >
                      Pendapatan
                    </Button>
                    <Button
                      variant={typeFilter === 'expense' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTypeFilter('expense')}
                    >
                      Pengeluaran
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Dari Tanggal</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Sampai Tanggal</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-40"
                  />
                </div>
                {(typeFilter !== 'all' || startDate || endDate) && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="self-end">
                    <Filter className="mr-1 h-3 w-3" />
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Daftar Transaksi
              {typeFilter !== 'all' && (
                <Badge variant={typeFilter === 'income' ? 'income' : 'expense'} className="ml-2">
                  {typeFilter === 'income' ? 'Pendapatan' : 'Pengeluaran'}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
              </div>
            ) : filteredCashflows.length > 0 ? (
              <div className="overflow-x-auto -mx-4 px-4">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Akun</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Kredit</TableHead>
                    <TableHead>Tipe</TableHead>
                    {isAdmin && <TableHead>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCashflows.map((cf) => (
                    <TableRow key={cf.id}>
                      <TableCell className="font-medium">
                        {formatShortDate(cf.tanggal)}
                      </TableCell>
                      <TableCell>
                        {cf.keterangan}
                        {cf.referenceId && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            Auto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{cf.kodeAkun}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {cf.kategori || '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {cf.debit > 0 ? formatCurrency(cf.debit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        {cf.kredit > 0 ? formatCurrency(cf.kredit) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cf.debit > 0 ? 'income' : 'expense'}>
                          {cf.debit > 0 ? 'Masuk' : 'Keluar'}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditDialog(cf)}
                              disabled={!!cf.referenceId} // Disable edit for auto-generated transactions
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                setSelectedCashflow(cf);
                                setIsDeleteOpen(true);
                              }}
                              disabled={!!cf.referenceId} // Disable delete for auto-generated transactions
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-slate-400">
                Tidak ada data transaksi
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Menampilkan {(pagination.page - 1) * pagination.limit + 1} -{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} dari{' '}
                  {pagination.total} transaksi
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === 1}
                    onClick={() => fetchData(pagination.page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => fetchData(pagination.page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog.Root open={isEditOpen} onOpenChange={setIsEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              Edit Transaksi
            </Dialog.Title>
            {renderForm(handleEdit, 'Update')}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              Hapus Transaksi
            </Dialog.Title>
            <p className="mt-2 text-sm text-slate-600">
              Apakah Anda yakin ingin menghapus transaksi ini? 
              Saldo akun akan otomatis disesuaikan.
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
    </>
  );
}
