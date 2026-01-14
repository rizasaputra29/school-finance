'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Search, ChevronLeft, ChevronRight, Users, Plus, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';

interface Student {
  id: string;
  nis: string;
  nama: string;
  jenisKelamin: string | null;
  kelas: string;
  tahunMasuk: number;
  tahunAjaran: string | null;
  namaOrtu: string | null;
  noTelp: string | null;
  statusBayar: string;
  status: string;
  totalTagihan: number;
  totalBayar: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Class options matching Excel structure
const KELAS_OPTIONS = ['PLAYGROUP', 'KINDERGARTEN'];

const INITIAL_FORM = {
  nis: '',
  nama: '',
  jenisKelamin: '',
  kelas: '',
  tahunMasuk: new Date().getFullYear().toString(),
  tahunAjaran: '',
  namaOrtu: '',
  noTelp: '',
};

export default function StudentsPage() {
  const { isAdmin } = useAuth();
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
  const [showInactive, setShowInactive] = useState(false);
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [error, setError] = useState('');

  const fetchData = async (page = 1) => {
    setIsLoading(true);
    try {
      let url = `/api/students?page=${page}&limit=10`;
      if (statusFilter) url += `&statusBayar=${statusFilter}`;
      if (showInactive) url += `&status=Inactive`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      
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
  }, [statusFilter, showInactive, searchTerm]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal menambah siswa');
        return;
      }

      setIsCreateOpen(false);
      setFormData(INITIAL_FORM);
      fetchData(pagination.page);
    } catch (error) {
      console.error('Failed to create student:', error);
      setError('Terjadi kesalahan');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setError('');
    
    try {
      const res = await fetch(`/api/students/${selectedStudent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengupdate siswa');
        return;
      }

      setIsEditOpen(false);
      setSelectedStudent(null);
      setFormData(INITIAL_FORM);
      fetchData(pagination.page);
    } catch (error) {
      console.error('Failed to update student:', error);
      setError('Terjadi kesalahan');
    }
  };

  const handleDelete = async () => {
    if (!selectedStudent) return;
    
    try {
      const res = await fetch(`/api/students/${selectedStudent.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setIsDeleteOpen(false);
        setSelectedStudent(null);
        fetchData(pagination.page);
      }
    } catch (error) {
      console.error('Failed to delete student:', error);
    }
  };

  const openEditDialog = (student: Student) => {
    setSelectedStudent(student);
    setFormData({
      nis: student.nis,
      nama: student.nama,
      jenisKelamin: student.jenisKelamin || '',
      kelas: student.kelas,
      tahunMasuk: student.tahunMasuk.toString(),
      tahunAjaran: student.tahunAjaran || '',
      namaOrtu: student.namaOrtu || '',
      noTelp: student.noTelp || '',
    });
    setIsEditOpen(true);
  };

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
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Data Siswa</h1>
            <p className="text-xs md:text-sm text-gray-500">Kelola data siswa dan status pembayaran</p>
          </div>

          {isAdmin && (
            <Button onClick={() => setIsCreateOpen(true)} size="sm" className="text-xs md:text-sm">
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Tambah Siswa</span>
              <span className="md:hidden">Tambah</span>
            </Button>
          )}
        </div>

          {/* Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          <Card className="bg-[#059DEA] shadow-sm col-span-2 md:col-span-1">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/50 shrink-0">
                <Users className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-white/80 truncate">Total Siswa</p>
                <p className="text-sm md:text-xl font-bold text-white truncate">
                  {pagination.total}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-[#059DEA]/20 shrink-0">
                <span className="text-sm md:text-lg font-bold text-gray-700">✓</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">Lunas</p>
                <p className="text-sm md:text-xl font-bold text-gray-900 truncate">{lunasCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-amber-50 shrink-0">
                <span className="text-sm md:text-lg font-bold text-amber-600">!</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">Belum Lunas</p>
                <p className="text-sm md:text-xl font-bold text-slate-900 font-mono truncate">{belumLunasCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Cari nama, NIS, atau kelas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 hide-scrollbar flex-1">
                  <Button
                    variant={statusFilter === '' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('')}
                    className="whitespace-nowrap"
                  >
                    Semua
                  </Button>
                  <Button
                    variant={statusFilter === 'Lunas' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('Lunas')}
                    className="whitespace-nowrap"
                  >
                    Lunas
                  </Button>
                  <Button
                    variant={statusFilter === 'Belum Lunas' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('Belum Lunas')}
                    className="whitespace-nowrap"
                  >
                    Belum Lunas
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs md:text-sm text-gray-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Tampilkan non-aktif
                </label>
              </div>
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
              <div className="overflow-x-auto -mx-4 px-4">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>NIS</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Tahun Masuk</TableHead>
                    <TableHead className="text-right">Tagihan</TableHead>
                    <TableHead className="text-right">Dibayar</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((s) => (
                    <TableRow key={s.id} className={s.status === 'Inactive' ? 'opacity-50' : ''}>
                      <TableCell className="font-mono font-medium">
                        {s.nis}
                      </TableCell>
                      <TableCell className="font-medium">
                        {s.nama}
                        {s.status === 'Inactive' && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            Tidak Aktif
                          </Badge>
                        )}
                      </TableCell>
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
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditDialog(s)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {s.status === 'Active' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setSelectedStudent(s);
                                  setIsDeleteOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
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

      {/* Create Dialog */}
      <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              Tambah Siswa Baru
            </Dialog.Title>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nis">NIS *</Label>
                  <Input
                    id="nis"
                    value={formData.nis}
                    onChange={(e) => setFormData({ ...formData, nis: e.target.value })}
                    placeholder="12345"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jenisKelamin">Jenis Kelamin</Label>
                  <select
                    id="jenisKelamin"
                    value={formData.jenisKelamin}
                    onChange={(e) => setFormData({ ...formData, jenisKelamin: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Pilih</option>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nama">Nama Lengkap *</Label>
                <Input
                  id="nama"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  placeholder="Nama lengkap siswa"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="kelas">Kelas *</Label>
                  <select
                    id="kelas"
                    value={formData.kelas}
                    onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Pilih Kelas</option>
                    {KELAS_OPTIONS.map((kelas) => (
                      <option key={kelas} value={kelas}>
                        {kelas}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tahunMasuk">Tahun Masuk *</Label>
                  <Input
                    id="tahunMasuk"
                    type="number"
                    value={formData.tahunMasuk}
                    onChange={(e) => setFormData({ ...formData, tahunMasuk: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tahunAjaran">Tahun Ajaran</Label>
                <Input
                  id="tahunAjaran"
                  value={formData.tahunAjaran}
                  onChange={(e) => setFormData({ ...formData, tahunAjaran: e.target.value })}
                  placeholder="2025/2026"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="namaOrtu">Nama Orang Tua</Label>
                <Input
                  id="namaOrtu"
                  value={formData.namaOrtu}
                  onChange={(e) => setFormData({ ...formData, namaOrtu: e.target.value })}
                  placeholder="Nama orang tua/wali"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="noTelp">No. Telepon</Label>
                <Input
                  id="noTelp"
                  value={formData.noTelp}
                  onChange={(e) => setFormData({ ...formData, noTelp: e.target.value })}
                  placeholder="08xxxxxxxxxx"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">Batal</Button>
                </Dialog.Close>
                <Button type="submit">Simpan</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Dialog */}
      <Dialog.Root open={isEditOpen} onOpenChange={setIsEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              Edit Data Siswa
            </Dialog.Title>
            <form onSubmit={handleEdit} className="mt-4 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-nis">NIS</Label>
                  <Input id="edit-nis" value={formData.nis} disabled className="bg-slate-100" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-jenisKelamin">Jenis Kelamin</Label>
                  <select
                    id="edit-jenisKelamin"
                    value={formData.jenisKelamin}
                    onChange={(e) => setFormData({ ...formData, jenisKelamin: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Pilih</option>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-nama">Nama Lengkap *</Label>
                <Input
                  id="edit-nama"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-kelas">Kelas *</Label>
                  <select
                    id="edit-kelas"
                    value={formData.kelas}
                    onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Pilih Kelas</option>
                    {KELAS_OPTIONS.map((kelas) => (
                      <option key={kelas} value={kelas}>
                        {kelas}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-tahunMasuk">Tahun Masuk</Label>
                  <Input
                    id="edit-tahunMasuk"
                    type="number"
                    value={formData.tahunMasuk}
                    onChange={(e) => setFormData({ ...formData, tahunMasuk: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-tahunAjaran">Tahun Ajaran</Label>
                <Input
                  id="edit-tahunAjaran"
                  value={formData.tahunAjaran}
                  onChange={(e) => setFormData({ ...formData, tahunAjaran: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-namaOrtu">Nama Orang Tua</Label>
                <Input
                  id="edit-namaOrtu"
                  value={formData.namaOrtu}
                  onChange={(e) => setFormData({ ...formData, namaOrtu: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-noTelp">No. Telepon</Label>
                <Input
                  id="edit-noTelp"
                  value={formData.noTelp}
                  onChange={(e) => setFormData({ ...formData, noTelp: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">Batal</Button>
                </Dialog.Close>
                <Button type="submit">Update</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              Hapus Siswa Permanen
            </Dialog.Title>
            <p className="mt-2 text-sm text-slate-600">
              Apakah Anda yakin ingin menghapus data siswa <strong>{selectedStudent?.nama}</strong>?
              Data tagihan dan history pembayaran juga akan dihapus secara permanen.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="outline">Batal</Button>
              </Dialog.Close>
              <Button variant="destructive" onClick={handleDelete}>
                Nonaktifkan
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
