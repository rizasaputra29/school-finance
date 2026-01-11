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
  const [chartPeriod, setChartPeriod] = useState<'week' | 'month' | 'year'>('month');

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

  // Client-side filtering for chart data
  const chartData = useMemo(() => {
    if (!data?.cashflows) return [];
    
    const cashflows = data.cashflows;
    const now = new Date();
    
    if (chartPeriod === 'week') {
      // Last 7 days
      const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const result = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        
        const dayCashflows = cashflows.filter((cf) => {
          const cfDate = new Date(cf.tanggal);
          return cfDate >= dayStart && cfDate < dayEnd;
        });

        result.push({
          month: days[date.getDay()],
          debit: dayCashflows.reduce((sum, cf) => sum + cf.debit, 0),
          kredit: dayCashflows.reduce((sum, cf) => sum + cf.kredit, 0),
        });
      }
      return result;
    } else if (chartPeriod === 'month') {
      // Last 4 weeks
      const result = [];
      for (let i = 3; i >= 0; i--) {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - (i * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 7);
        
        const weekCashflows = cashflows.filter((cf) => {
          const cfDate = new Date(cf.tanggal);
          return cfDate >= weekStart && cfDate <= weekEnd;
        });

        result.push({
          month: `Minggu ${4 - i}`,
          debit: weekCashflows.reduce((sum, cf) => sum + cf.debit, 0),
          kredit: weekCashflows.reduce((sum, cf) => sum + cf.kredit, 0),
        });
      }
      return result;
    } else {
      // Last 12 months
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const result = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - i);
        
        const monthCashflows = cashflows.filter((cf) => {
          const cfDate = new Date(cf.tanggal);
          return cfDate.getMonth() === date.getMonth() && cfDate.getFullYear() === date.getFullYear();
        });

        result.push({
          month: months[date.getMonth()],
          debit: monthCashflows.reduce((sum, cf) => sum + cf.debit, 0),
          kredit: monthCashflows.reduce((sum, cf) => sum + cf.kredit, 0),
        });
      }
      return result;
    }
  }, [data?.cashflows, chartPeriod]);

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Ringkasan keuangan sekolah</p>
          </div>
          <Link href="/cashflow">
            <Button size="lg" className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Tambah Transaksi
            </Button>
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {/* Saldo */}
          <Card className="col-span-2 lg:col-span-1 bg-[#c6ef4e] border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/30 flex items-center justify-center">
                  <Wallet className="h-6 w-6 text-gray-900" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Total Saldo</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.saldo)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pendapatan */}
          <Card className="bg-white">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Pendapatan</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(summary.totalDebit)}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <ArrowUpRight className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pengeluaran */}
          <Card className="bg-white">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Pengeluaran</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(summary.totalKredit)}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <ArrowDownRight className="h-5 w-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Siswa */}
          <Card className="bg-white">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Siswa</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{summary.totalStudents}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-black" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Chart & Transactions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Trend Chart */}
            <Card className="bg-white">
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">Arus Kas</CardTitle>
                    <div className="flex gap-1 border border-gray-200 p-1 rounded-xl bg-gray-50">
                      <button
                        onClick={() => setChartPeriod('week')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                          chartPeriod === 'week' 
                            ? 'bg-white text-gray-900 shadow-sm border border-gray-200' 
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        7 Hari
                      </button>
                      <button
                        onClick={() => setChartPeriod('month')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                          chartPeriod === 'month' 
                            ? 'bg-white text-gray-900 shadow-sm border border-gray-200' 
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        30 Hari
                      </button>
                      <button
                        onClick={() => setChartPeriod('year')}
                        className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                          chartPeriod === 'year' 
                            ? 'bg-white text-gray-900 shadow-sm border border-gray-200' 
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        12 Bulan
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-[#c6ef4e]" />
                      <span className="text-gray-600">Pendapatan</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gray-400" />
                      <span className="text-gray-600">Pengeluaran</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                        tickFormatter={(value) =>
                          new Intl.NumberFormat('id-ID', { notation: 'compact' }).format(value)
                        }
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(value as number)}
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          backgroundColor: 'white',
                          padding: '12px 16px',
                        }}
                        labelStyle={{ color: '#374151', fontWeight: 600, marginBottom: 4 }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="debit" 
                        name="Pendapatan"
                        stroke="#c6ef4e" 
                        strokeWidth={2.5}
                        fill="url(#colorDebit)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="kredit" 
                        name="Pengeluaran"
                        stroke="#94a3b8" 
                        strokeWidth={2}
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
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {recentTransactions.slice(0, 5).map((tx) => (
                    <div 
                      key={tx.id} 
                      className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                          tx.debit > 0 ? 'bg-[#c6ef4e]/20' : 'bg-gray-100'
                        }`}>
                          {tx.debit > 0 ? (
                            <TrendingUp className="h-5 w-5 text-gray-700" />
                          ) : (
                            <TrendingDown className="h-5 w-5 text-gray-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm text-gray-900">{tx.keterangan}</p>
                          <p className="text-xs text-gray-400">{formatDate(tx.tanggal)}</p>
                        </div>
                      </div>
                      <p className={`font-semibold text-sm ${tx.debit > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
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
          <div className="space-y-6">

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
