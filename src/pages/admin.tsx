'use client';

import { useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: Record<string, { inserted: number; errors: number }>;
  } | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([
    'Cashflow',
    'Data Siswa',
    'Akun',
  ]);

  // Redirect non-admin
  if (!isAdmin) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-16 w-16 text-amber-500" />
        <h1 className="text-2xl font-bold text-gray-900">Akses Ditolak</h1>
        <p className="text-gray-500">Halaman ini hanya untuk admin</p>
        <Button onClick={() => router.push('/login')}>Login sebagai Admin</Button>
      </div>
    );
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (
      droppedFile &&
      (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls') || droppedFile.name.endsWith('.json'))
    ) {
      setFile(droppedFile);
      setResult(null);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const toggleSheet = (sheet: string) => {
    setSelectedSheets((prev) =>
      prev.includes(sheet) ? prev.filter((s) => s !== sheet) : [...prev, sheet]
    );
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setResult(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        const isJson = file.name.endsWith('.json');

        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64,
            sheets: selectedSheets,
            type: isJson ? 'json' : 'excel',
          }),
        });

        const data = await res.json();

        if (res.ok) {
          setResult({
            success: true,
            message: 'Import berhasil!',
            details: data.results,
          });
        } else {
          setResult({
            success: false,
            message: data.error || 'Gagal mengimport data',
          });
        }

        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload error:', error);
      setResult({
        success: false,
        message: 'Terjadi kesalahan saat upload',
      });
      setIsUploading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/export');
      if (!res.ok) throw new Error('Failed to export');
      
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `school-finance-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Gagal mengekspor data');
    }
  };

  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    if (resetConfirmation !== 'RESET_DATABASE') return;
    
    setIsResetting(true);
    try {
      const res = await fetch('/api/reset', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ confirmation: 'RESET_DATABASE' }),
      });

      if (res.ok) {
        alert('Database telah di-reset sepenuhnya.');
        setIsResetOpen(false);
        setResetConfirmation('');
      } else {
        alert('Gagal melakukan reset database.');
      }
    } catch (error) {
      console.error('Reset failed:', error);
      alert('Terjadi kesalahan saat reset.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin - Import/Export Data</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Import & Export Data</h1>
          <p className="text-slate-500">Kelola backup dan restore data sistem</p>
        </div>

        {/* Export Area */}
        <Card className="bg-white border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Export Data</CardTitle>
            <CardDescription className="text-slate-500">
              Download seluruh data sistem (Cashflow, Akun, Siswa) dalam format JSON.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExport} variant="outline" className="w-full sm:w-auto border-slate-200 text-slate-700 hover:bg-slate-50">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Download Backup JSON
            </Button>
          </CardContent>
        </Card>

        {/* Upload Area */}
        <Card className="bg-white border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Import Data</CardTitle>
            <CardDescription className="text-slate-500">
              Upload file Excel (.xlsx) atau Backup JSON (.json)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Drag & Drop Zone */}
            <div
              className={`relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : file
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.json"
                className="hidden"
                onChange={handleFileChange}
              />

              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-100">
                    <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setResult(null);
                    }}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Hapus
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
                    <Upload className="h-8 w-8 text-slate-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-slate-700">
                      Drag & drop file Excel/JSON di sini
                    </p>
                    <p className="text-sm text-slate-500">
                      atau klik untuk memilih file
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Sheet Selection (Only relevant for Excel really, but harmless for JSON to keep UI simple or we can hide it) */}
            {file && !file.name.endsWith('.json') && (
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">
                  Pilih sheet yang akan diimport (Excel):
                </p>
                <div className="flex flex-wrap gap-2">
                  {['Cashflow', 'Data Siswa', 'Akun'].map((sheet) => (
                    <Badge
                      key={sheet}
                      variant={selectedSheets.includes(sheet) ? 'default' : 'outline'}
                      className="cursor-pointer px-4 py-2 text-sm transition-all hover:scale-105"
                      onClick={() => toggleSheet(sheet)}
                    >
                      {selectedSheets.includes(sheet) && (
                        <CheckCircle className="mr-1 h-3 w-3" />
                      )}
                      {sheet}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Button */}
            <Button
              className="w-full border"
              disabled={!file || (file && !file.name.endsWith('.json') && selectedSheets.length === 0) || isUploading}
              onClick={handleUpload}
            >
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white text-white" />
                  Mengimport...
                </div>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Data
                </>
              )}
            </Button>

            {/* Result */}
            {result && (
              <div
                className={`rounded-xl p-4 ${
                  result.success ? 'bg-emerald-50' : 'bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <p
                    className={`font-medium ${
                      result.success ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {result.message}
                  </p>
                </div>

                {result.details && (
                  <div className="mt-4 space-y-2">
                    {Object.entries(result.details).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-lg bg-white/50 px-3 py-2"
                      >
                        <span className="font-medium capitalize text-slate-700">
                          {key}
                        </span>
                        <div className="flex gap-4 text-sm">
                          <span className="text-emerald-600">
                            ✓ {value.inserted} berhasil
                          </span>
                          {value.errors > 0 && (
                            <span className="text-red-600">
                              ✗ {value.errors} gagal
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 bg-red-50/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-red-900">Danger Zone</CardTitle>
            <CardDescription className="text-red-700/70">
              Tindakan di bawah ini tidak dapat dibatalkan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-red-200 bg-white p-4">
              <div>
                <h4 className="font-medium text-slate-900">Reset Data</h4>
                <p className="text-sm text-slate-500">
                  Hapus semua data (Cashflow, Akun, Siswa, Tagihan) secara permanen.
                </p>
              </div>
              <Dialog.Root open={isResetOpen} onOpenChange={setIsResetOpen}>
                <Dialog.Trigger asChild>
                  <Button variant="destructive" onClick={() => setResetConfirmation('')}>
                    Reset Data
                  </Button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl border border-red-200">
                    <Dialog.Title className="text-lg font-bold text-red-600">
                       PERINGATAN: HAPUS SEMUA DATA?
                    </Dialog.Title>
                    <Dialog.Description className="mt-3 text-slate-600">
                      Tindakan ini akan menghapus <strong>SELURUH DATA</strong> di sistem, termasuk:
                      <ul className="list-disc list-inside mt-2 text-sm text-slate-600">
                        <li>Semua Akun & Saldo</li>
                        <li>Semua Data Siswa</li>
                        <li>Semua Tagihan & Pembayaran</li>
                        <li>Semua Riwayat Cashflow</li>
                      </ul>
                      <p className="mt-4 font-semibold text-slate-900">
                        Data yang dihapus TIDAK DAPAT dipulihkan kembali.
                      </p>
                    </Dialog.Description>
                    
                    <div className="mt-4 space-y-3">
                      <Label htmlFor="confirm-reset" className="text-sm text-slate-700">
                        Ketik <strong>RESET_DATABASE</strong> untuk konfirmasi:
                      </Label>
                      <Input
                        id="confirm-reset"
                        value={resetConfirmation}
                        onChange={(e) => setResetConfirmation(e.target.value)}
                        placeholder="RESET_DATABASE"
                        className="border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      />
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <Dialog.Close asChild>
                        <Button variant="outline">Batal</Button>
                      </Dialog.Close>
                      <Button 
                        variant="destructive" 
                        onClick={handleReset}
                        disabled={resetConfirmation !== 'RESET_DATABASE' || isResetting}
                      >
                        {isResetting ? 'Menghapus...' : 'Ya, Hapus Semua Data'}
                      </Button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="bg-white border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Format File Excel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold text-slate-700">Sheet: Cashflow</h4>
              <p className="text-sm text-slate-500">
                Kolom: Tanggal, Keterangan, Kode Akun, Debit, Kredit
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-700">Sheet: Data Siswa</h4>
              <p className="text-sm text-slate-500">
                Kolom: NIS, Nama, Kelas, Tahun Masuk, Status Bayar, Total Tagihan,
                Total Bayar
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-700">Sheet: Akun</h4>
              <p className="text-sm text-slate-500">
                Kolom: Kode Akun, Nama Akun, Tipe Akun (Asset/Liability/Equity/Revenue/Expense), Saldo
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
