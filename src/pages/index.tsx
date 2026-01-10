'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface DashboardData {
  summary: {
    totalDebit: number;
    totalKredit: number;
    saldo: number;
    totalStudents: number;
    lunasCount: number;
    belumLunasCount: number;
  };
  monthlyData: { month: string; debit: number; kredit: number }[];
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

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-slate-500">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  // Default empty data
  const summary = data?.summary || {
    totalDebit: 0,
    totalKredit: 0,
    saldo: 0,
    totalStudents: 0,
    lunasCount: 0,
    belumLunasCount: 0,
  };

  const monthlyData = data?.monthlyData || [];
  const accountDistribution = data?.accountDistribution || [];
  const recentTransactions = data?.recentTransactions || [];

  const summaryCards = [
    {
      title: 'Total Pendapatan',
      value: formatCurrency(summary.totalDebit),
      icon: TrendingUp,
      color: 'from-emerald-500 to-emerald-600',
      textColor: 'text-emerald-600',
    },
    {
      title: 'Total Pengeluaran',
      value: formatCurrency(summary.totalKredit),
      icon: TrendingDown,
      color: 'from-red-500 to-red-600',
      textColor: 'text-red-600',
    },
    {
      title: 'Saldo',
      value: formatCurrency(summary.saldo),
      icon: Wallet,
      color: 'from-blue-500 to-blue-600',
      textColor: 'text-blue-600',
    },
    {
      title: 'Jumlah Siswa',
      value: summary.totalStudents.toString(),
      icon: Users,
      color: 'from-purple-500 to-purple-600',
      textColor: 'text-purple-600',
    },
  ];

  return (
    <>
      <Head>
        <title>Dashboard - Keuangan Sekolah</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Ringkasan keuangan sekolah</p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card, index) => (
            <Card
              key={card.title}
              className="animate-fade-in overflow-hidden"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      {card.title}
                    </p>
                    <p className={`mt-1 text-2xl font-bold ${card.textColor}`}>
                      {card.value}
                    </p>
                  </div>
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br ${card.color} shadow-lg`}
                  >
                    <card.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Student Payment Status */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="animate-fade-in" style={{ animationDelay: '400ms' }}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-600 shadow-lg">
                <CheckCircle className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Lunas</p>
                <p className="text-3xl font-bold text-emerald-600">
                  {summary.lunasCount}
                </p>
                <p className="text-xs text-slate-400">siswa</p>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in" style={{ animationDelay: '500ms' }}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-amber-600 shadow-lg">
                <Clock className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Belum Lunas</p>
                <p className="text-3xl font-bold text-amber-600">
                  {summary.belumLunasCount}
                </p>
                <p className="text-xs text-slate-400">siswa</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Line Chart */}
          <Card className="animate-fade-in" style={{ animationDelay: '600ms' }}>
            <CardHeader>
              <CardTitle className="text-lg">Trend Cashflow Bulanan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={12}
                      tickFormatter={(value) =>
                        new Intl.NumberFormat('id-ID', {
                          notation: 'compact',
                        }).format(value)
                      }
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="debit"
                      name="Pendapatan"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="kredit"
                      name="Pengeluaran"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ fill: '#ef4444', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Pie Chart */}
          <Card className="animate-fade-in" style={{ animationDelay: '700ms' }}>
            <CardHeader>
              <CardTitle className="text-lg">Distribusi Pengeluaran</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {accountDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={accountDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {accountDistribution.map((entry, index) => (
                          <Cell
                            key={`cell-${entry.name}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(value as number)}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    Tidak ada data pengeluaran
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Transactions */}
        <Card className="animate-fade-in" style={{ animationDelay: '800ms' }}>
          <CardHeader>
            <CardTitle className="text-lg">Transaksi Terakhir</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTransactions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Kode Akun</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead>Tipe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">
                        {formatDate(tx.tanggal)}
                      </TableCell>
                      <TableCell>{tx.keterangan}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{tx.kodeAkun}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(tx.debit > 0 ? tx.debit : tx.kredit)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tx.debit > 0 ? 'income' : 'expense'}>
                          {tx.debit > 0 ? 'Masuk' : 'Keluar'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex h-32 items-center justify-center text-slate-400">
                Belum ada transaksi
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
