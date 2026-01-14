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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

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

const COLORS = ['#c6ef4e', '#94a3b8', '#64748b', '#e2e8f0', '#cbd5e1'];

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
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#c6ef4e]" />
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

        {/* Summary Cards */}
        <div className="grid gap-2 md:gap-4 grid-cols-2 lg:grid-cols-4">
          {/* Saldo */}
          <Card className="col-span-2 lg:col-span-1 bg-[#c6ef4e] border-0">
            <CardContent className="p-3 md:p-5">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg md:rounded-xl bg-white/30 flex items-center justify-center">
                  <Wallet className="h-5 w-5 md:h-6 md:w-6 text-gray-900" />
                </div>
                <div>
                  <p className="text-xs md:text-sm font-medium text-gray-700">Total Saldo</p>
                  <p className="text-lg md:text-2xl font-bold text-gray-900">{formatCurrency(summary.saldo)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pendapatan */}
          <Card className="bg-white">
            <CardContent className="p-3 md:p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-500">Pendapatan</p>
                  <p className="text-sm md:text-xl font-bold text-gray-900 mt-0.5 truncate">{formatCurrency(summary.totalDebit)}</p>
                </div>
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0 ml-2">
                  <ArrowUpRight className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pengeluaran */}
          <Card className="bg-white">
            <CardContent className="p-3 md:p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-500">Pengeluaran</p>
                  <p className="text-sm md:text-xl font-bold text-gray-900 mt-0.5 truncate">{formatCurrency(summary.totalKredit)}</p>
                </div>
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0 ml-2">
                  <ArrowDownRight className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Siswa */}
          <Card className="bg-white">
            <CardContent className="p-3 md:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs md:text-sm font-medium text-gray-500">Total Siswa</p>
                  <p className="text-sm md:text-xl font-bold text-gray-900 mt-0.5">{summary.totalStudents}</p>
                </div>
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 md:h-5 md:w-5 text-black" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Grid */}
        <div className="grid gap-3 md:gap-6 lg:grid-cols-3">
          {/* Left Column - Chart & Transactions */}
          <div className="lg:col-span-2 space-y-3 md:space-y-6">
            {/* Trend Chart */}
            <Card className="bg-white">
              <CardHeader className="pb-2 md:pb-4 px-3 md:px-6">
                <div className="flex flex-col gap-2 md:gap-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base md:text-lg font-semibold text-gray-900">Arus Kas</CardTitle>
                    <div className="relative">
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-1.5 md:pl-4 md:pr-10 md:py-2 text-xs md:text-sm font-medium rounded-lg md:rounded-xl border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:ring-2 focus:ring-[#c6ef4e]/50 focus:border-[#c6ef4e] focus:bg-white outline-none cursor-pointer transition-all shadow-sm"
                      >
                        {last6Months.map((month) => (
                          <option key={month.value} value={month.value}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-3 h-3 md:w-4 md:h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-[#c6ef4e]" />
                      <span className="text-gray-600">Pendapatan</span>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-gray-400" />
                      <span className="text-gray-600">Pengeluaran</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-2 md:px-6">
                <div style={{ width: '100%', height: 200 }} className="md:h-[300px]!">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 5, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDebit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#c6ef4e" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#c6ef4e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorKredit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="month" 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        tickLine={false}
                        axisLine={false}
                        dy={5}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={9}
                        tickLine={false}
                        axisLine={false}
                        width={45}
                        tickFormatter={(value) =>
                          new Intl.NumberFormat('id-ID', { notation: 'compact' }).format(value)
                        }
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(value as number)}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                          backgroundColor: 'white',
                          padding: '8px 12px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#374151', fontWeight: 600, marginBottom: 4 }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="debit" 
                        name="Pendapatan"
                        stroke="#c6ef4e" 
                        strokeWidth={2}
                        fill="url(#colorDebit)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="kredit" 
                        name="Pengeluaran"
                        stroke="#94a3b8" 
                        strokeWidth={1.5}
                        fill="url(#colorKredit)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card className="bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-gray-900">Transaksi Terakhir</CardTitle>
                  <Link href="/cashflow">
                    <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">
                      Lihat Semua
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-3 md:px-6">
                <div className="space-y-0">
                  {recentTransactions.slice(0, 5).map((tx) => (
                    <div 
                      key={tx.id} 
                      className="flex items-center justify-between py-2 md:py-3 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                        <div className={`h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl flex items-center justify-center shrink-0 ${
                          tx.debit > 0 ? 'bg-[#c6ef4e]/20' : 'bg-gray-100'
                        }`}>
                          {tx.debit > 0 ? (
                            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-gray-700" />
                          ) : (
                            <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-gray-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs md:text-sm text-gray-900 truncate">{tx.keterangan}</p>
                          <p className="text-[10px] md:text-xs text-gray-400">{formatDate(tx.tanggal)}</p>
                        </div>
                      </div>
                      <p className={`font-semibold text-xs md:text-sm shrink-0 ml-2 ${tx.debit > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                        {tx.debit > 0 ? '+' : '-'} {formatCurrency(tx.debit > 0 ? tx.debit : tx.kredit)}
                      </p>
                    </div>
                  ))}
                  {recentTransactions.length === 0 && (
                    <div className="py-8 text-center text-gray-400 text-sm">
                      Belum ada transaksi
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-3 md:space-y-6">

            {/* Student Payment Status */}
            <Card className="bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-gray-900">Status Pembayaran</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-500">Tingkat Kelulusan</span>
                    <span className="font-semibold text-gray-900">{lunasPercentage}%</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#c6ef4e] rounded-full transition-all"
                      style={{ width: `${lunasPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#c6ef4e]/10">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-xs font-medium text-gray-600">Lunas</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{summary.lunasCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-600">Belum</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{summary.belumLunasCount}</p>
                  </div>
                </div>

                <Link href="/billing" className="block">
                  <Button variant="outline" className="w-full">
                    Kelola Tagihan
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-gray-900">Aksi Cepat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/students" className="block">
                  <Button variant="secondary" className="w-full justify-start">
                    <Users className="h-4 w-4" />
                    Kelola Siswa
                  </Button>
                </Link>
                <Link href="/accounts" className="block">
                  <Button variant="secondary" className="w-full justify-start">
                    <Wallet className="h-4 w-4" />
                    Kelola Akun
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
