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
        <h1 className="text-2xl font-bold text-slate-900">Akses Ditolak</h1>
        <p className="text-slate-500">Halaman ini hanya untuk admin</p>
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
      (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))
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
    if (!file || selectedSheets.length === 0) return;

    setIsUploading(true);
    setResult(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];

        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64,
            sheets: selectedSheets,
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

  return (
    <>
      <Head>
        <title>Admin - Import Data</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Import Data</h1>
          <p className="text-slate-500">Upload file Excel untuk mengimport data</p>
        </div>

        {/* Upload Area */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload File Excel</CardTitle>
            <CardDescription>
              File harus memiliki sheet: Cashflow, Data Siswa, dan/atau Akun
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
                accept=".xlsx,.xls"
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
                      Drag & drop file Excel di sini
                    </p>
                    <p className="text-sm text-slate-500">
                      atau klik untuk memilih file
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Sheet Selection */}
            <div>
              <p className="mb-3 text-sm font-medium text-slate-700">
                Pilih sheet yang akan diimport:
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

            {/* Upload Button */}
            <Button
              className="w-full"
              disabled={!file || selectedSheets.length === 0 || isUploading}
              onClick={handleUpload}
            >
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Format File Excel</CardTitle>
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
