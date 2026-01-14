'use client';

import { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  CheckCircle,
  Clock,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface CashflowItem {
  id: string;
  tanggal: string;
  debit: number;
  kredit: number;
}

interface DashboardData {
  summary: {
    totalDebit: number;
    totalKredit: number;
    saldo: number;
    totalStudents: number;
    lunasCount: number;
    belumLunasCount: number;
  };
  cashflows: CashflowItem[];
  accountDistribution: { name: string; value: number }[];
  recentTransactions: {
    id: string;
    tanggal: string;
    keterangan: string;
    kodeAkun: string;
    debit: number;
    kredit: number;
  }[];
}

const COLORS = ['#059DEA', '#94a3b8', '#64748b', '#e2e8f0', '#cbd5e1'];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Generate last 6 months for dropdown
  const getLast6Months = () => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      months.push({
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        year: date.getFullYear(),
        month: date.getMonth()
      });
    }
    return months;
  };
  
  const last6Months = getLast6Months();
  const [selectedMonth, setSelectedMonth] = useState(last6Months[0].value);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/dashboard');
        if (res.ok) {
          const dashboardData = await res.json();
          setData(dashboardData);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Client-side filtering for chart data - show daily breakdown for selected month
  const chartData = useMemo(() => {
    if (!data?.cashflows) return [];
    
    const cashflows = data.cashflows;
    const [year, month] = selectedMonth.split('-').map(Number);
    
    // Get number of days in the selected month
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Group by week (4 weeks per month)
    const weeks = [
      { start: 1, end: 7, label: 'Minggu 1' },
      { start: 8, end: 14, label: 'Minggu 2' },
      { start: 15, end: 21, label: 'Minggu 3' },
      { start: 22, end: daysInMonth, label: 'Minggu 4' },
    ];
    
    return weeks.map(week => {
      const weekCashflows = cashflows.filter((cf) => {
        const cfDate = new Date(cf.tanggal);
        const cfDay = cfDate.getDate();
        return cfDate.getFullYear() === year && 
               cfDate.getMonth() + 1 === month && 
               cfDay >= week.start && 
               cfDay <= week.end;
      });
      
      return {
        month: week.label,
        debit: weekCashflows.reduce((sum, cf) => sum + cf.debit, 0),
        kredit: weekCashflows.reduce((sum, cf) => sum + cf.kredit, 0),
      };
    });
  }, [data?.cashflows, selectedMonth]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#059DEA]" />
          <p className="text-sm text-gray-500">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary || {
    totalDebit: 0,
    totalKredit: 0,
    saldo: 0,
    totalStudents: 0,
    lunasCount: 0,
    belumLunasCount: 0,
  };

  const accountDistribution = data?.accountDistribution || [];
  const recentTransactions = data?.recentTransactions || [];

  const lunasPercentage = summary.totalStudents > 0 
    ? Math.round((summary.lunasCount / summary.totalStudents) * 100) 
    : 0;

  return (
    <>
      <Head>
        <title>Dashboard - Keuangan Sekolah</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-xs md:text-sm text-gray-500">Ringkasan keuangan</p>
          </div>
          <Link href="/cashflow">
            <Button size="sm" className="text-xs md:text-sm">
              <Plus className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Tambah Transaksi</span>
              <span className="sm:hidden">Tambah</span>
            </Button>
          </Link>
        </div>

        {/* Compact Bento Grid Layout */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
          {/* Saldo - spans 2 cols on all screens */}
          <Card className="col-span-2 bg-[#059DEA] border-0">
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl bg-white/30 flex items-center justify-center">
                  <Wallet className="h-6 w-6 md:h-7 md:w-7 text-white" />
                </div>
                <div>
                  <p className="text-sm md:text-base font-medium text-white/80">Total Saldo</p>
                  <p className="text-xl md:text-2xl font-bold text-white">{formatCurrency(summary.saldo)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pendapatan */}
          <Card className="col-span-1 bg-white">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-500">Pendapatan</p>
                  <p className="text-base md:text-xl font-bold text-gray-900 mt-1 truncate">{formatCurrency(summary.totalDebit)}</p>
                </div>
                <div className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pengeluaran */}
          <Card className="col-span-1 bg-white">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-500">Pengeluaran</p>
                  <p className="text-base md:text-xl font-bold text-gray-900 mt-1 truncate">{formatCurrency(summary.totalKredit)}</p>
                </div>
                <div className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <ArrowDownRight className="h-5 w-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Siswa */}
          <Card className="col-span-1 bg-white">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs md:text-sm font-medium text-gray-500">Total Siswa</p>
                  <p className="text-base md:text-xl font-bold text-gray-900 mt-1">{summary.totalStudents}</p>
                </div>
                <div className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-gray-700" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tingkat Lunas */}
          <Card className="col-span-1 bg-white">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs md:text-sm font-medium text-gray-500">Lunas</p>
                  <p className="text-base md:text-xl font-bold text-[#059DEA] mt-1">{lunasPercentage}%</p>
                </div>
                <div className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-[#059DEA]/10 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-5 w-5 text-[#059DEA]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chart - spans 4 cols on large screens */}
          <Card className="col-span-2 md:col-span-4 lg:col-span-4 bg-white row-span-2">
            <CardHeader className="pb-2 px-3 md:px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm md:text-base font-semibold text-gray-900">Arus Kas</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="hidden md:flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-[#059DEA]" />
                      <span className="text-gray-600">Masuk</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
                      <span className="text-gray-600">Keluar</span>
                    </div>
                  </div>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="appearance-none pl-2 pr-6 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:ring-1 focus:ring-[#059DEA]/50 outline-none cursor-pointer"
                  >
                    {last6Months.map((month) => (
                      <option key={month.value} value={month.value}>{month.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-2 md:px-4 pb-3">
              {chartData.length > 0 && chartData.some(d => d.debit > 0 || d.kredit > 0) ? (
                <div className="w-full">
                  <div className="flex items-end justify-around gap-2 md:gap-4 h-[120px] md:h-[160px]">
                    {(() => {
                      const maxValue = Math.max(...chartData.map(d => Math.max(d.debit, d.kredit)));
                      return chartData.map((week, index) => {
                        const debitHeight = maxValue > 0 ? (week.debit / maxValue) * 100 : 0;
                        const kreditHeight = maxValue > 0 ? (week.kredit / maxValue) * 100 : 0;
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center gap-2">
                            <div className="w-full flex items-end justify-center gap-1 h-[80px] md:h-[120px]">
                              <div className="relative group flex-1 h-full flex items-end">
                                <div 
                                  className="w-full bg-[#059DEA] rounded-t-md transition-all duration-300 hover:bg-[#0589d4] cursor-pointer"
                                  style={{ height: week.debit > 0 ? `${debitHeight}%` : '0%', minHeight: week.debit > 0 ? '4px' : '0' }}
                                />
                                {week.debit > 0 && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20">
                                    <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">{formatCurrency(week.debit)}</div>
                                  </div>
                                )}
                              </div>
                              <div className="relative group flex-1 h-full flex items-end">
                                <div 
                                  className="w-full bg-gray-400 rounded-t-md transition-all duration-300 hover:bg-gray-500 cursor-pointer"
                                  style={{ height: week.kredit > 0 ? `${kreditHeight}%` : '0%', minHeight: week.kredit > 0 ? '4px' : '0' }}
                                />
                                {week.kredit > 0 && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20">
                                    <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">{formatCurrency(week.kredit)}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] md:text-xs text-gray-500">{week.month.replace('Minggu ', 'M')}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div className="mt-3 pt-2 border-t border-gray-100 grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 rounded-lg p-2 md:p-3">
                      <p className="text-[10px] md:text-xs text-gray-500">Total Masuk</p>
                      <p className="text-xs md:text-sm font-bold text-[#059DEA]">{formatCurrency(chartData.reduce((sum, d) => sum + d.debit, 0))}</p>
                    </div>
                    <div className="bg-gray-100 rounded-lg p-2 md:p-3">
                      <p className="text-[10px] md:text-xs text-gray-500">Total Keluar</p>
                      <p className="text-xs md:text-sm font-bold text-gray-700">{formatCurrency(chartData.reduce((sum, d) => sum + d.kredit, 0))}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[160px] flex flex-col items-center justify-center text-gray-400">
                  <p className="text-xs">Tidak ada data</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Status - spans 2 cols */}
          <Card className="col-span-2 bg-white row-span-2">
            <CardHeader className="pb-2 px-3 md:px-4">
              <CardTitle className="text-sm md:text-base font-semibold text-gray-900">Status Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="px-3 md:px-4 pb-3 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">Tingkat Kelulusan</span>
                  <span className="font-semibold text-gray-900">{lunasPercentage}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#059DEA] rounded-full" style={{ width: `${lunasPercentage}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 md:p-3 rounded-lg bg-[#059DEA]/10">
                  <div className="flex items-center gap-1 mb-0.5">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span className="text-[10px] md:text-xs text-gray-600">Lunas</span>
                  </div>
                  <p className="text-lg md:text-xl font-bold text-gray-900">{summary.lunasCount}</p>
                </div>
                <div className="p-2 md:p-3 rounded-lg bg-gray-100">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span className="text-[10px] md:text-xs text-gray-600">Belum</span>
                  </div>
                  <p className="text-lg md:text-xl font-bold text-gray-900">{summary.belumLunasCount}</p>
                </div>
              </div>
              <Link href="/billing" className="block">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  Kelola Tagihan <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Transactions - spans 4 cols on large screens */}
          <Card className="col-span-2 md:col-span-4 lg:col-span-4 bg-white">
            <CardHeader className="pb-2 px-3 md:px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm md:text-base font-semibold text-gray-900">Transaksi Terakhir</CardTitle>
                <Link href="/cashflow">
                  <Button variant="ghost" size="sm" className="text-xs text-gray-500 hover:text-gray-900 h-7 px-2">
                    Lihat Semua <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-3 md:px-4 pb-3">
              <div className="space-y-0">
                {recentTransactions.slice(0, 4).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`h-7 w-7 md:h-8 md:w-8 rounded-lg flex items-center justify-center shrink-0 ${tx.debit > 0 ? 'bg-[#059DEA]/20' : 'bg-gray-100'}`}>
                        {tx.debit > 0 ? <TrendingUp className="h-3.5 w-3.5 text-gray-700" /> : <TrendingDown className="h-3.5 w-3.5 text-gray-500" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-xs text-gray-900 truncate">{tx.keterangan}</p>
                        <p className="text-[10px] text-gray-400">{formatDate(tx.tanggal)}</p>
                      </div>
                    </div>
                    <p className={`font-semibold text-xs shrink-0 ml-2 ${tx.debit > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                      {tx.debit > 0 ? '+' : '-'} {formatCurrency(tx.debit > 0 ? tx.debit : tx.kredit)}
                    </p>
                  </div>
                ))}
                {recentTransactions.length === 0 && (
                  <div className="py-6 text-center text-gray-400 text-xs">Belum ada transaksi</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions - spans 2 cols */}
          <Card className="col-span-2 bg-white">
            <CardHeader className="pb-2 px-3 md:px-4">
              <CardTitle className="text-sm md:text-base font-semibold text-gray-900">Aksi Cepat</CardTitle>
            </CardHeader>
            <CardContent className="px-3 md:px-4 pb-3 grid grid-cols-2 gap-2">
              <Link href="/students" className="block">
                <Button variant="secondary" size="sm" className="w-full justify-start text-xs h-9">
                  <Users className="h-3.5 w-3.5" /> Siswa
                </Button>
              </Link>
              <Link href="/accounts" className="block">
                <Button variant="secondary" size="sm" className="w-full justify-start text-xs h-9">
                  <Wallet className="h-3.5 w-3.5" /> Akun
                </Button>
              </Link>
              <Link href="/cashflow" className="block">
                <Button variant="secondary" size="sm" className="w-full justify-start text-xs h-9">
                  <TrendingUp className="h-3.5 w-3.5" /> Cashflow
                </Button>
              </Link>
              <Link href="/reports" className="block">
                <Button variant="secondary" size="sm" className="w-full justify-start text-xs h-9">
                  <ChevronRight className="h-3.5 w-3.5" /> Laporan
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
