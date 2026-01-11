'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileSpreadsheet,
  FileText,
  Download,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Account {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
}

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);

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

  const handleExport = async (type: string, format: 'excel' | 'pdf') => {
    setIsExporting(`${type}-${format}`);
    try {
      const endpoint = format === 'excel' ? '/api/export/excel' : '/api/export/pdf';
      const res = await fetch(`${endpoint}?type=${type}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laporan-${type}-${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(null);
    }
  };

  // Calculate Laba Rugi
  const revenues = accounts.filter((a) => a.tipeAkun === 'Revenue');
  const expenses = accounts.filter((a) => a.tipeAkun === 'Expense');
  const totalRevenue = revenues.reduce((sum, a) => sum + a.saldo, 0);
  const totalExpense = expenses.reduce((sum, a) => sum + a.saldo, 0);
  const labaRugi = totalRevenue - totalExpense;

  // Calculate Neraca
  const assets = accounts.filter((a) => a.tipeAkun === 'Asset');
  const liabilities = accounts.filter((a) => a.tipeAkun === 'Liability');
  const equity = accounts.filter((a) => a.tipeAkun === 'Equity');
  const totalAssets = assets.reduce((sum, a) => sum + a.saldo, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.saldo, 0);
  const totalEquity = equity.reduce((sum, a) => sum + a.saldo, 0);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#c6ef4e]" />
          <p className="text-sm text-gray-500">Memuat laporan...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Laporan - Keuangan Sekolah</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Keuangan</h1>
          <p className="text-gray-500">Laporan Laba Rugi dan Neraca</p>
        </div>

        {/* Laba Rugi */}
        <Card className="animate-fade-in">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Laporan Laba Rugi</CardTitle>
              <p className="text-sm text-slate-500">Periode berjalan</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('laba-rugi', 'excel')}
                disabled={isExporting === 'laba-rugi-excel'}
              >
                <FileSpreadsheet className="mr-1 h-4 w-4" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('laba-rugi', 'pdf')}
                disabled={isExporting === 'laba-rugi-pdf'}
              >
                <FileText className="mr-1 h-4 w-4" />
                PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Pendapatan */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#c6ef4e]/30">
                  <TrendingUp className="h-4 w-4 text-gray-700" />
                </div>
                <h3 className="font-semibold text-gray-700">PENDAPATAN</h3>
              </div>
              {revenues.length > 0 ? (
                <div className="overflow-x-auto -mx-1">
                <Table className="min-w-[400px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenues.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge variant="secondary">{a.kodeAkun}</Badge>
                        </TableCell>
                        <TableCell>{a.namaAkun}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(a.saldo)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-[#c6ef4e]/20">
                      <TableCell colSpan={2} className="font-semibold text-gray-900">
                        Total Pendapatan
                      </TableCell>
                      <TableCell className="text-right font-bold text-gray-900">
                        {formatCurrency(totalRevenue)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                </div>
              ) : (
                <p className="text-slate-400">Tidak ada data pendapatan</p>
              )}
            </div>

            {/* Beban */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100">
                  <TrendingDown className="h-4 w-4 text-gray-600" />
                </div>
                <h3 className="font-semibold text-gray-700">BEBAN</h3>
              </div>
              {expenses.length > 0 ? (
                <div className="overflow-x-auto -mx-1">
                <Table className="min-w-[400px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge variant="secondary">{a.kodeAkun}</Badge>
                        </TableCell>
                        <TableCell>{a.namaAkun}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(a.saldo)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-red-50">
                      <TableCell colSpan={2} className="font-semibold">
                        Total Beban
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-600">
                        {formatCurrency(totalExpense)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                </div>
              ) : (
                <p className="text-slate-400">Tidak ada data beban</p>
              )}
            </div>

            {/* Laba/Rugi */}
            <div
              className={`rounded-xl p-4 ${labaRugi >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-slate-700">
                  LABA/RUGI BERSIH
                </span>
                <span
                  className={`text-2xl font-bold ${labaRugi >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {formatCurrency(labaRugi)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Neraca */}
        <Card className="animate-fade-in" style={{ animationDelay: '200ms' }}>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Neraca</CardTitle>
              <p className="text-sm text-slate-500">Posisi keuangan saat ini</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('neraca', 'excel')}
                disabled={isExporting === 'neraca-excel'}
              >
                <FileSpreadsheet className="mr-1 h-4 w-4" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('neraca', 'pdf')}
                disabled={isExporting === 'neraca-pdf'}
              >
                <FileText className="mr-1 h-4 w-4" />
                PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Aset */}
              <div>
                <h3 className="mb-3 font-semibold text-slate-700">ASET</h3>
                {assets.length > 0 ? (
                  <div className="space-y-2">
                    {assets.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{a.kodeAkun}</Badge>
                          <span className="text-sm">{a.namaAkun}</span>
                        </div>
                        <span className="font-medium">
                          {formatCurrency(a.saldo)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-lg bg-blue-100 px-3 py-2">
                      <span className="font-semibold">Total Aset</span>
                      <span className="font-bold text-blue-600">
                        {formatCurrency(totalAssets)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400">Tidak ada data aset</p>
                )}
              </div>

              {/* Kewajiban & Ekuitas */}
              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 font-semibold text-slate-700">KEWAJIBAN</h3>
                  {liabilities.length > 0 ? (
                    <div className="space-y-2">
                      {liabilities.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{a.kodeAkun}</Badge>
                            <span className="text-sm">{a.namaAkun}</span>
                          </div>
                          <span className="font-medium">
                            {formatCurrency(a.saldo)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between rounded-lg bg-red-100 px-3 py-2">
                        <span className="font-semibold">Total Kewajiban</span>
                        <span className="font-bold text-red-600">
                          {formatCurrency(totalLiabilities)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400">Tidak ada data kewajiban</p>
                  )}
                </div>

                <div>
                  <h3 className="mb-3 font-semibold text-slate-700">EKUITAS</h3>
                  {equity.length > 0 ? (
                    <div className="space-y-2">
                      {equity.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{a.kodeAkun}</Badge>
                            <span className="text-sm">{a.namaAkun}</span>
                          </div>
                          <span className="font-medium">
                            {formatCurrency(a.saldo)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between rounded-lg bg-purple-100 px-3 py-2">
                        <span className="font-semibold">Total Ekuitas</span>
                        <span className="font-bold text-purple-600">
                          {formatCurrency(totalEquity)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400">Tidak ada data ekuitas</p>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-200 px-3 py-2">
                  <span className="font-semibold">Total Kewajiban + Ekuitas</span>
                  <span className="font-bold">
                    {formatCurrency(totalLiabilities + totalEquity)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export All */}
        <Card>
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
            <div>
              <h3 className="font-semibold text-slate-900">Export Semua Laporan</h3>
              <p className="text-sm text-slate-500">
                Download Laba Rugi, Neraca, dan Cashflow dalam satu file
              </p>
            </div>
            <Button
              onClick={() => handleExport('all', 'excel')}
              disabled={isExporting === 'all-excel'}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Semua (Excel)
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
