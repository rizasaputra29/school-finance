'use client';

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TransactionButtons } from '@/components/Transaction/TransactionButtons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, Filter, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatShortDate, formatNumberInput, parseFormattedNumber } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
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
  
  // Debounce search term to avoid excessive API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  // Dialog States

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCashflow, setSelectedCashflow] = useState<Cashflow | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  }, []);

  const fetchData = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      let url = `/api/cashflow?page=${page}&limit=10`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (typeFilter !== 'all') url += `&type=${typeFilter}`;
      if (debouncedSearchTerm) url += `&search=${encodeURIComponent(debouncedSearchTerm)}`;

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
  }, [typeFilter, startDate, endDate, debouncedSearchTerm]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


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

  // Note: Filtering is now done server-side via API
  // Client-side filtering kept for immediate UI feedback
  const clearFilters = () => {
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
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
          <div className="relative">
            <Input
              type="text"
              placeholder="Cari kode atau nama akun..."
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              onFocus={() => setShowAccountDropdown(true)}
              onBlur={() => setTimeout(() => setShowAccountDropdown(false), 200)}
            />
            {showAccountDropdown && (
              <div className="absolute z-10 left-0 right-0 mt-1 max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
                {accounts
                  .filter((acc) =>
                    accountSearch === '' ||
                    acc.kodeAkun.toLowerCase().includes(accountSearch.toLowerCase()) ||
                    acc.namaAkun.toLowerCase().includes(accountSearch.toLowerCase()) ||
                    acc.tipeAkun.toLowerCase().includes(accountSearch.toLowerCase())
                  )
                  .map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, kodeAkun: acc.kodeAkun });
                        setAccountSearch('');
                        setShowAccountDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors border-b border-gray-50 last:border-b-0 ${
                        formData.kodeAkun === acc.kodeAkun ? 'bg-[#059DEA]/30 font-medium' : ''
                      }`}
                    >
                      <span className="font-mono font-medium">{acc.kodeAkun}</span> - {acc.namaAkun}
                      <span className="ml-2 text-xs text-gray-400">({acc.tipeAkun})</span>
                    </button>
                  ))}
                {accounts.filter((acc) =>
                  accountSearch === '' ||
                  acc.kodeAkun.toLowerCase().includes(accountSearch.toLowerCase()) ||
                  acc.namaAkun.toLowerCase().includes(accountSearch.toLowerCase())
                ).length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-500">Tidak ada akun ditemukan</p>
                )}
              </div>
            )}
          </div>
          {formData.kodeAkun && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="font-mono">{formData.kodeAkun}</Badge>
              <span className="text-sm text-slate-600">
                {accounts.find(a => a.kodeAkun === formData.kodeAkun)?.namaAkun}
              </span>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, kodeAkun: '' })}
                className="text-xs text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          )}
          <input type="hidden" name="kodeAkun" value={formData.kodeAkun} required />
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
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Cashflow</h1>
            <p className="text-xs md:text-sm text-gray-500">Kelola arus kas masuk dan keluar</p>
          </div>

          {isAdmin && (
            <TransactionButtons
              accounts={accounts}
              onSuccess={() => fetchData(pagination.page)}
            />
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-[#059DEA]/20 shrink-0">
                <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">Total Pendapatan</p>
                <p className="text-sm md:text-xl font-bold text-gray-900 truncate">
                  {formatCurrency(summary.totalDebit)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-gray-100 shrink-0">
                <TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-gray-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">Total Pengeluaran</p>
                <p className="text-sm md:text-xl font-bold text-gray-900 truncate">
                  {formatCurrency(summary.totalKredit)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#059DEA] shadow-sm col-span-2 md:col-span-1">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/50 shrink-0">
                <Wallet className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-white/80 truncate">Saldo Akhir</p>
                <p className={`text-sm md:text-xl font-bold truncate ${summary.saldo >= 0 ? 'text-white' : 'text-white'}`}>
                  {formatCurrency(summary.saldo)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Cari keterangan, kode akun, atau kategori..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="space-y-1 min-w-[200px]">
                  <Label className="text-xs text-gray-500">Tipe Transaksi</Label>
                  <div className="flex w-full rounded-lg border border-gray-200 p-1">
                    <button
                      onClick={() => setTypeFilter('all')}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        typeFilter === 'all' 
                          ? 'bg-gray-900 text-white shadow-sm' 
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setTypeFilter('income')}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        typeFilter === 'income' 
                          ? 'bg-[#059DEA] text-white shadow-sm' 
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      Masuk
                    </button>
                    <button
                      onClick={() => setTypeFilter('expense')}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        typeFilter === 'expense' 
                          ? 'bg-red-100 text-red-700 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      Keluar
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto">
                  <div className="space-y-1 flex-1 sm:flex-none">
                    <Label className="text-xs text-gray-500">Dari</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-40 text-xs"
                    />
                  </div>
                  <div className="space-y-1 flex-1 sm:flex-none">
                    <Label className="text-xs text-gray-500">Sampai</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-40 text-xs"
                    />
                  </div>
                </div>

                {(typeFilter !== 'all' || startDate || endDate) && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={clearFilters} 
                    className="self-end w-full sm:w-auto mt-2 sm:mt-0"
                  >
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
            ) : cashflows.length > 0 ? (
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
                  {cashflows.map((cf) => (
                    <TableRow key={cf.id}>
                      <TableCell className="font-medium whitespace-nowrap">
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
              <div className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-xs md:text-sm text-slate-500 text-center sm:text-left">
                  Menampilkan {(pagination.page - 1) * pagination.limit + 1} -{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} dari{' '}
                  {pagination.total} transaksi
                </p>
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === 1}
                    onClick={() => fetchData(pagination.page - 1)}
                    className="w-10 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex items-center px-4 text-sm font-medium border border-gray-200 rounded-md">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => fetchData(pagination.page + 1)}
                    className="w-10 p-0"
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
