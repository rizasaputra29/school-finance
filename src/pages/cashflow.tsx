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
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, formatShortDate } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';

interface Cashflow {
  id: string;
  tanggal: string;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function CashflowPage() {
  const { isAdmin } = useAuth();
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    keterangan: '',
    kodeAkun: '',
    debit: '',
    kredit: '',
  });

  const fetchData = async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/cashflow?page=${page}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setCashflows(data.data);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch cashflows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/cashflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsDialogOpen(false);
        setFormData({
          tanggal: new Date().toISOString().split('T')[0],
          keterangan: '',
          kodeAkun: '',
          debit: '',
          kredit: '',
        });
        fetchData(pagination.page);
      }
    } catch (error) {
      console.error('Failed to create cashflow:', error);
    }
  };

  const filteredCashflows = cashflows.filter(
    (cf) =>
      cf.keterangan.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cf.kodeAkun.toLowerCase().includes(searchTerm.toLowerCase())
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
            <h1 className="text-2xl font-bold text-slate-900">Cashflow</h1>
            <p className="text-slate-500">Kelola arus kas masuk dan keluar</p>
          </div>

          {isAdmin && (
            <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <Dialog.Trigger asChild>
                <Button>
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

                  <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
                        placeholder="Pembayaran SPP"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="kodeAkun">Kode Akun</Label>
                      <Input
                        id="kodeAkun"
                        value={formData.kodeAkun}
                        onChange={(e) =>
                          setFormData({ ...formData, kodeAkun: e.target.value })
                        }
                        placeholder="1001"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="debit">Debit (Masuk)</Label>
                        <Input
                          id="debit"
                          type="number"
                          value={formData.debit}
                          onChange={(e) =>
                            setFormData({ ...formData, debit: e.target.value })
                          }
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="kredit">Kredit (Keluar)</Label>
                        <Input
                          id="kredit"
                          type="number"
                          value={formData.kredit}
                          onChange={(e) =>
                            setFormData({ ...formData, kredit: e.target.value })
                          }
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <Dialog.Close asChild>
                        <Button type="button" variant="outline">
                          Batal
                        </Button>
                      </Dialog.Close>
                      <Button type="submit">Simpan</Button>
                    </div>
                  </form>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Cari keterangan atau kode akun..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daftar Transaksi</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
              </div>
            ) : filteredCashflows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Kode Akun</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Kredit</TableHead>
                    <TableHead>Tipe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCashflows.map((cf) => (
                    <TableRow key={cf.id}>
                      <TableCell className="font-medium">
                        {formatShortDate(cf.tanggal)}
                      </TableCell>
                      <TableCell>{cf.keterangan}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{cf.kodeAkun}</Badge>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </>
  );
}
