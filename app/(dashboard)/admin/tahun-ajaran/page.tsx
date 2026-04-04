'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { Plus, Pencil, Check, Archive } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface AcademicYear {
  id: string;
  tahunAjaran: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  isActive: boolean;
  isArchived: boolean;
}

const INITIAL_FORM = {
  tahunAjaran: '',
  tanggalMulai: '',
  tanggalSelesai: '',
};

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AcademicYearPage() {
  const { isAdmin } = useAuth();
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<AcademicYear | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/academic-year?includeArchived=true');
      if (res.ok) {
        const data = await res.json();
        setAcademicYears(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch academic years:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/academic-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setIsCreateOpen(false);
        setFormData(INITIAL_FORM);
        fetchData();
      } else {
        setError(data.error || 'Gagal membuat tahun ajaran');
      }
    } catch (error) {
      console.error('Failed to create academic year:', error);
      setError('Terjadi kesalahan');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYear) return;
    setError('');

    try {
      const res = await fetch(`/api/academic-year?id=${selectedYear.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setIsEditOpen(false);
        setSelectedYear(null);
        setFormData(INITIAL_FORM);
        fetchData();
      } else {
        setError(data.error || 'Gagal mengupdate tahun ajaran');
      }
    } catch (error) {
      console.error('Failed to update academic year:', error);
      setError('Terjadi kesalahan');
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      const res = await fetch(`/api/academic-year?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Gagal mengaktifkan tahun ajaran');
      }
    } catch (error) {
      console.error('Failed to set active:', error);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin mengarsipkan tahun ajaran ini?')) return;

    try {
      const res = await fetch(`/api/academic-year?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Gagal mengarsipkan tahun ajaran');
      }
    } catch (error) {
      console.error('Failed to archive:', error);
    }
  };

  const openEditDialog = (year: AcademicYear) => {
    setSelectedYear(year);
    setFormData({
      tahunAjaran: year.tahunAjaran,
      tanggalMulai: year.tanggalMulai.split('T')[0],
      tanggalSelesai: year.tanggalSelesai.split('T')[0],
    });
    setIsEditOpen(true);
  };

  if (!isAdmin) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Akses Ditolak</h2>
          <p className="text-gray-500 mt-2">Halaman ini hanya untuk admin.</p>
        </div>
      </div>
    );
  }

  const activeYears = academicYears.filter(y => !y.isArchived);
  const archivedYears = academicYears.filter(y => y.isArchived);

  const renderForm = (onSubmit: (e: React.FormEvent) => Promise<void>, submitLabel: string, isEdit = false) => (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="tahunAjaran">Tahun Ajaran</Label>
        <Input
          id="tahunAjaran"
          value={formData.tahunAjaran}
          onChange={(e) => setFormData({ ...formData, tahunAjaran: e.target.value })}
          placeholder="Contoh: 2025/2026"
          required
          disabled={isEdit}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tanggalMulai">Tanggal Mulai</Label>
        <Input
          id="tanggalMulai"
          type="date"
          value={formData.tanggalMulai}
          onChange={(e) => setFormData({ ...formData, tanggalMulai: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tanggalSelesai">Tanggal Selesai</Label>
        <Input
          id="tanggalSelesai"
          type="date"
          value={formData.tanggalSelesai}
          onChange={(e) => setFormData({ ...formData, tanggalSelesai: e.target.value })}
          required
        />
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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 pb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Kelola Tahun Ajaran</h1>
          <p className="text-xs md:text-sm text-gray-500">Kelola tahun ajaran untuk laporan keuangan</p>
        </div>

        <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <Dialog.Trigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Tambah Tahun Ajaran
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
              <Dialog.Title className="text-lg font-semibold text-slate-900">
                Tambah Tahun Ajaran Baru
              </Dialog.Title>
              {renderForm(handleSubmit, 'Simpan')}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {/* Active Years */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Tahun Ajaran Aktif</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#059DEA]" />
            </div>
          ) : activeYears.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-gray-500">
              Belum ada tahun ajaran
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50 border-b">
                    <th className="text-left px-4 py-3 font-semibold text-sm">Tahun Ajaran</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Periode</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-sm">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {activeYears.map((year) => (
                    <tr key={year.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{year.tahunAjaran}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(year.tanggalMulai)} - {formatDate(year.tanggalSelesai)}
                      </td>
                      <td className="px-4 py-3">
                        {year.isActive ? (
                          <Badge className="bg-green-100 text-green-700">Aktif</Badge>
                        ) : (
                          <Badge variant="secondary">Nonaktif</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!year.isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSetActive(year.id)}
                              title="Jadikan Aktif"
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(year)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleArchive(year.id)}
                            title="Arsipkan"
                          >
                            <Archive className="h-4 w-4 text-gray-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archived Years */}
      {archivedYears.length > 0 && (
        <Card>
          <CardHeader className="border-b bg-gray-50">
            <CardTitle className="text-lg text-gray-600">Tahun Ajaran Diarsipkan</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50 border-b">
                    <th className="text-left px-4 py-3 font-semibold text-sm">Tahun Ajaran</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Periode</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedYears.map((year) => (
                    <tr key={year.id} className="border-b bg-gray-50/30">
                      <td className="px-4 py-3 font-medium text-gray-600">{year.tahunAjaran}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(year.tanggalMulai)} - {formatDate(year.tanggalSelesai)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-gray-500">Diarsipkan</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog.Root open={isEditOpen} onOpenChange={setIsEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              Edit Tahun Ajaran
            </Dialog.Title>
            {renderForm(handleEdit, 'Update', true)}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
