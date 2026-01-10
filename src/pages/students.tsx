'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Student {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  tahunMasuk: number;
  statusBayar: string;
  totalTagihan: number;
  totalBayar: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchData = async (page = 1) => {
    setIsLoading(true);
    try {
      let url = `/api/students?page=${page}&limit=10`;
      if (statusFilter) {
        url += `&statusBayar=${statusFilter}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.data);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch students:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const filteredStudents = students.filter(
    (s) =>
      s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.nis.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.kelas.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lunasCount = students.filter((s) => s.statusBayar === 'Lunas').length;
  const belumLunasCount = students.length - lunasCount;

  return (
    <>
      <Head>
        <title>Data Siswa - Keuangan Sekolah</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Siswa</h1>
          <p className="text-slate-500">Kelola data siswa dan status pembayaran</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Siswa</p>
                <p className="text-2xl font-bold text-slate-900">
                  {pagination.total}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all ${
              statusFilter === 'Lunas' ? 'ring-2 ring-emerald-500' : ''
            }`}
            onClick={() => setStatusFilter(statusFilter === 'Lunas' ? '' : 'Lunas')}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg">
                <span className="text-lg font-bold text-white">✓</span>
              </div>
              <div>
                <p className="text-sm text-slate-500">Lunas</p>
                <p className="text-2xl font-bold text-emerald-600">{lunasCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all ${
              statusFilter === 'Belum Lunas' ? 'ring-2 ring-amber-500' : ''
            }`}
            onClick={() =>
              setStatusFilter(statusFilter === 'Belum Lunas' ? '' : 'Belum Lunas')
            }
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg">
                <span className="text-lg font-bold text-white">!</span>
              </div>
              <div>
                <p className="text-sm text-slate-500">Belum Lunas</p>
                <p className="text-2xl font-bold text-amber-600">{belumLunasCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Cari nama, NIS, atau kelas..."
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
            <CardTitle className="text-lg">
              Daftar Siswa
              {statusFilter && (
                <Badge variant="secondary" className="ml-2">
                  {statusFilter}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
              </div>
            ) : filteredStudents.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NIS</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Tahun Masuk</TableHead>
                    <TableHead className="text-right">Tagihan</TableHead>
                    <TableHead className="text-right">Dibayar</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono font-medium">
                        {s.nis}
                      </TableCell>
                      <TableCell className="font-medium">{s.nama}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{s.kelas}</Badge>
                      </TableCell>
                      <TableCell>{s.tahunMasuk}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(s.totalTagihan)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {formatCurrency(s.totalBayar)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.statusBayar === 'Lunas' ? 'success' : 'warning'}
                        >
                          {s.statusBayar}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex h-48 items-center justify-center text-slate-400">
                Tidak ada data siswa
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Menampilkan {(pagination.page - 1) * pagination.limit + 1} -{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} dari{' '}
                  {pagination.total} siswa
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
