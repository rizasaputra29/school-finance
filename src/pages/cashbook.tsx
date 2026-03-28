'use client';

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileSpreadsheet,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency, formatShortDate } from '@/lib/utils';

interface CashbookEntry {
  id: string;
  tanggal: string;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
  saldo: number;
}

interface Summary {
  saldoAwal: number;
  totalPemasukan: number;
  totalPengeluaran: number;
  saldoAkhir: number;
  transactionCount: number;
}

const ITEMS_PER_PAGE = 15;

export default function CashbookPage() {
  const [entries, setEntries] = useState<CashbookEntry[]>([]);
  const [summary, setSummary] = useState<Summary>({
    saldoAwal: 0,
    totalPemasukan: 0,
    totalPengeluaran: 0,
    saldoAkhir: 0,
    transactionCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Data fetching - using useCallback to fix exhaustive-deps warning
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = `/api/reports/cashbook`;
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.data);
        setSummary(data.summary);
        setCurrentPage(1); // Reset to first page on new fetch
      }
    } catch (error) {
      console.error('Failed to fetch cashbook:', error);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = async (format: 'excel' | 'pdf') => {
    window.open(
      `/api/export/${format}?type=cashbook&startDate=${startDate}&endDate=${endDate}`,
      '_blank'
    );
  };

  // Pagination calculations
  const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentEntries = entries.slice(startIndex, endIndex);

  return (
    <>
      <Head>
        <title>Buku Kas - Keuangan Sekolah</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Buku Kas</h1>
            <p className="text-xs md:text-sm text-gray-500">
              Catatan kas masuk dan keluar dengan saldo berjalan
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('excel')} className="flex-1 sm:flex-none text-xs md:text-sm">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} className="flex-1 sm:flex-none text-xs md:text-sm">
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-blue-50 shrink-0">
                <Wallet className="h-5 w-5 md:h-6 md:w-6 text-[#059DEA]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">Saldo Awal</p>
                <p className="text-sm md:text-2xl font-bold text-gray-900 truncate">
                  {formatCurrency(summary.saldoAwal)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-emerald-50 shrink-0">
                <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">Pemasukan</p>
                <p className="text-sm md:text-2xl font-bold text-emerald-600 truncate">
                  +{formatCurrency(summary.totalPemasukan)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-red-50 shrink-0">
                <TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">Pengeluaran</p>
                <p className="text-sm md:text-2xl font-bold text-red-600 truncate">
                  -{formatCurrency(summary.totalPengeluaran)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#059DEA] shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-5">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/50 shrink-0">
                <BookOpen className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-white/80 truncate">Saldo Akhir</p>
                <p className="text-sm md:text-2xl font-bold text-white truncate">
                  {formatCurrency(summary.saldoAkhir)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Date Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="w-full sm:flex-1 min-w-[150px]">
                <Label htmlFor="startDate" className="text-xs text-gray-500">
                  Dari Tanggal
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full text-xs"
                />
              </div>
              <div className="w-full sm:flex-1 min-w-[150px]">
                <Label htmlFor="endDate" className="text-xs text-gray-500">
                  Sampai Tanggal
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full text-xs"
                />
              </div>
              <div className="flex w-full sm:w-auto gap-2">
                <Button variant="outline" size="sm" onClick={fetchData} className="flex-1 sm:flex-none">
                  Filter
                </Button>
                {(startDate || endDate) && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="flex-1 sm:flex-none text-xs"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cash Book Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Buku Kas
              <span className="text-sm font-normal text-slate-500">
                ({summary.transactionCount} transaksi)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#059DEA]" />
              </div>
            ) : entries.length > 0 ? (
              <>
                <div className="overflow-x-auto -mx-4 px-4">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold w-12">No</TableHead>
                        <TableHead className="font-semibold">Tanggal</TableHead>
                        <TableHead className="font-semibold">Keterangan</TableHead>
                        <TableHead className="font-semibold">Kode Akun</TableHead>
                        <TableHead className="text-right font-semibold text-emerald-600">
                          Pemasukan
                        </TableHead>
                        <TableHead className="text-right font-semibold text-red-600">
                          Pengeluaran
                        </TableHead>
                        <TableHead className="text-right font-semibold">
                          Saldo
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Opening Balance Row - only on first page */}
                      {currentPage === 1 && (
                        <TableRow className="bg-blue-50/50 font-medium">
                          <TableCell>-</TableCell>
                          <TableCell>{startDate ? formatShortDate(startDate) : '-'}</TableCell>
                          <TableCell className="italic">Saldo Awal</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(summary.saldoAwal)}
                          </TableCell>
                        </TableRow>
                      )}
                      
                      {currentEntries.map((entry, idx) => (
                        <TableRow key={entry.id} className="hover:bg-slate-50">
                          <TableCell className="text-gray-500">
                            {startIndex + idx + 1}
                          </TableCell>
                          <TableCell>{formatShortDate(entry.tanggal)}</TableCell>
                          <TableCell>{entry.keterangan}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {entry.kodeAkun}
                          </TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">
                            {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {entry.kredit > 0 ? formatCurrency(entry.kredit) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(entry.saldo)}
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* Closing Balance Row - only on last page */}
                      {currentPage === totalPages && (
                        <TableRow className="bg-[#059DEA]/30 font-bold">
                          <TableCell>-</TableCell>
                          <TableCell>{endDate ? formatShortDate(endDate) : '-'}</TableCell>
                          <TableCell className="italic">Saldo Akhir</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-right text-emerald-700">
                            {formatCurrency(summary.totalPemasukan)}
                          </TableCell>
                          <TableCell className="text-right text-red-700">
                            {formatCurrency(summary.totalPengeluaran)}
                          </TableCell>
                          <TableCell className="text-right text-lg">
                            {formatCurrency(summary.saldoAkhir)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 border-t pt-4">
                    <p className="text-xs md:text-sm text-slate-500 text-center sm:text-left">
                      Menampilkan {startIndex + 1} - {Math.min(endIndex, entries.length)} dari {entries.length} transaksi
                    </p>
                    <div className="flex justify-center gap-2">
                       <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="w-10 px-0 sm:w-auto sm:px-3"
                      >
                        <ChevronLeft className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Prev</span>
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum = i + 1;
                          if (totalPages > 5 && currentPage > 3) {
                            pageNum = currentPage - 2 + i;
                            if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                          }
                          
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className="w-8 h-8 p-0"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="w-10 px-0 sm:w-auto sm:px-3"
                      >
                         <span className="hidden sm:inline">Next</span>
                        <ChevronRight className="h-4 w-4 sm:ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-48 items-center justify-center text-slate-400">
                Tidak ada transaksi pada periode ini
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
