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
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface CashflowItem {
  id: string;
  tanggal: string;
  debit: number;
  kredit: number;
}

interface ChartData {
  pieChart: {
    name: string;
    value: number;
    color: string;
  }[];
  barChart: {
    bulan: string;
    pendapatan: number;
    beban: number;
  }[];
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
  recentTransactions: {
    id: string;
    tanggal: string;
    keterangan: string;
    kodeAkun: string;
    debit: number;
    kredit: number;
  }[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter state
  const currentDate = new Date();
  const [selectedBulan, setSelectedBulan] = useState(currentDate.getMonth() + 1);
  const [selectedTahun, setSelectedTahun] = useState(currentDate.getFullYear());
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  
  // Month names for dropdown
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  // Generate years for dropdown (current year and 2 years back)
  const years = [currentDate.getFullYear(), currentDate.getFullYear() - 1, currentDate.getFullYear() - 2];

  // Fetch chart data when filters change
  useEffect(() => {
    const fetchChartData = async () => {
      setChartLoading(true);
      try {
        const res = await fetch(`/api/dashboard?chart=true&bulan=${selectedBulan}&tahun=${selectedTahun}`);
        if (res.ok) {
          const data = await res.json();
          setChartData(data);
        }
      } catch (error) {
        console.error('Failed to fetch chart data:', error);
      } finally {
        setChartLoading(false);
      }
    };
    fetchChartData();
  }, [selectedBulan, selectedTahun]);

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

  // Compute summary and derived values before conditional returns
  const summary = data?.summary || {
    totalDebit: 0,
    totalKredit: 0,
    saldo: 0,
    totalStudents: 0,
    lunasCount: 0,
    belumLunasCount: 0,
  };

  const recentTransactions = data?.recentTransactions || [];

  const lunasPercentage = useMemo(() =>
    summary.totalStudents > 0 
      ? Math.round((summary.lunasCount / summary.totalStudents) * 100) 
      : 0,
    [summary.totalStudents, summary.lunasCount]
  );

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
          <Card className="col-span-2 bg-white">
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
          <Card className="col-span-2 bg-white">
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

          {/* Charts Section */}
          <Card className="col-span-2 md:col-span-4 lg:col-span-4 bg-white row-span-2">
            <CardHeader className="pb-2 px-3 md:px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm md:text-base font-semibold text-gray-900">Grafik Keuangan</CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedBulan}
                    onChange={(e) => setSelectedBulan(parseInt(e.target.value))}
                    className="appearance-none pl-2 pr-6 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:ring-1 focus:ring-[#059DEA]/50 outline-none cursor-pointer"
                  >
                    {monthNames.map((name, index) => (
                      <option key={index + 1} value={index + 1}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={selectedTahun}
                    onChange={(e) => setSelectedTahun(parseInt(e.target.value))}
                    className="appearance-none pl-2 pr-6 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:ring-1 focus:ring-[#059DEA]/50 outline-none cursor-pointer"
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-2 md:px-4 pb-3">
              {chartLoading ? (
                <div className="h-[200px] flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-200 border-t-[#059DEA]" />
                </div>
              ) : chartData && chartData.pieChart && chartData.pieChart.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Pie Chart - Expense by Category */}
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2 text-center">Pengeluaran per Kategori</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={chartData.pieChart}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {chartData.pieChart.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => formatCurrency(Number(value))}
                          contentStyle={{ fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                        />
                        <Legend 
                          layout="horizontal" 
                          verticalAlign="bottom" 
                          align="center"
                          wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Bar Chart - Monthly Comparison */}
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2 text-center">Pendapatan vs Beban Bulanan</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData.barChart} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <XAxis 
                          dataKey="bulan" 
                          tick={{ fontSize: 10 }} 
                          axisLine={{ stroke: '#E5E7EB' }}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 10 }} 
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value) => {
                            if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
                            if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                            return String(value);
                          }}
                        />
                        <Tooltip 
                          formatter={(value) => formatCurrency(Number(value))}
                          contentStyle={{ fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                          labelStyle={{ fontSize: '12px', fontWeight: '600' }}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }}
                        />
                        <Bar dataKey="pendapatan" name="Pendapatan" fill="#059DEA" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="beban" name="Beban" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
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
