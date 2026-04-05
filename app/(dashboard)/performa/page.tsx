'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts';

interface PerformaData {
  year: number;
  summary: { totalPendapatan: number; totalBeban: number; netProfit: number };
  barChart: Array<{ bulan: string; pendapatan: number; beban: number; netProfit: number }>;
  expensePie: Array<{ name: string; value: number }>;
  revenuePie: Array<{ name: string; value: number }>;
  cashflowTrend: Array<{ bulan: string; kas: number; bank: number }>;
}

const PIE_COLORS = [
  '#059DEA', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#06B6D4', '#D946EF',
];

function CustomTooltipRp({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3">
      <p className="text-sm font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function PerformaPage() {
  const [data, setData] = useState<PerformaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tahun, setTahun] = useState(new Date().getFullYear());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/performa?tahun=${tahun}`);
      const result = await res.json();
      if (!result.success) {
        toast.error(result.error?.message || 'Gagal memuat data performa');
        return;
      }
      setData(result.data);
    } catch { 
      toast.error('Terjadi kesalahan saat memuat data performa');
    } finally { 
      setLoading(false); 
    }
  }, [tahun]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Memuat data...</div>
      </div>
    );
  }

  const summary = data?.summary || { totalPendapatan: 0, totalBeban: 0, netProfit: 0 };
  const isProfit = summary.netProfit >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performa Sekolah</h1>
          <p className="text-sm text-gray-500 mt-1">Analisis keuangan berdasarkan jurnal</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Tahun:</label>
          <Input type="number" value={tahun} onChange={(e) => setTahun(parseInt(e.target.value) || new Date().getFullYear())} className="w-24" min="2020" max="2030" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-linear-to-br from-green-50 to-white">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Total Pendapatan</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-xl font-bold text-green-700">{formatCurrency(summary.totalPendapatan)}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-linear-to-br from-red-50 to-white">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Total Beban</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              <span className="text-xl font-bold text-red-700">{formatCurrency(summary.totalBeban)}</span>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm bg-linear-to-br ${isProfit ? 'from-blue-50' : 'from-amber-50'} to-white`}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">{isProfit ? 'Laba Bersih' : 'Rugi Bersih'}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className={`h-5 w-5 ${isProfit ? 'text-blue-500' : 'text-amber-500'}`} />
              <span className={`text-xl font-bold ${isProfit ? 'text-blue-700' : 'text-amber-700'}`}>{formatCurrency(Math.abs(summary.netProfit))}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue vs Expense Bar Chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-gray-500" /> Pendapatan vs Beban (Bulanan)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.barChart || []} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="bulan" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}jt`} tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltipRp />} />
                <Legend />
                <Bar dataKey="pendapatan" name="Pendapatan" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="beban" name="Beban" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Net Profit Trend */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Tren Laba Bersih</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.barChart || []} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="bulan" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}jt`} tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltipRp />} />
                <Area type="monotone" dataKey="netProfit" name="Laba Bersih" stroke="#059DEA" fill="#059DEA" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Expense Pie */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Komposisi Beban</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.expensePie?.length ?? 0) > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.expensePie || []}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) => `${(name || '').substring(0, 12)} ${((percent || 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {(data?.expensePie || []).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value?: number) => formatCurrency(value || 0)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-12">Belum ada data beban</p>
            )}
          </CardContent>
        </Card>

        {/* Revenue Pie */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Komposisi Pendapatan</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.revenuePie?.length ?? 0) > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.revenuePie || []}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) => `${(name || '').substring(0, 12)} ${((percent || 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {(data?.revenuePie || []).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value?: number) => formatCurrency(value || 0)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-12">Belum ada data pendapatan</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cashflow Trend */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Tren Kas & Bank</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.cashflowTrend || []} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="bulan" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}jt`} tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltipRp />} />
                <Legend />
                <Line type="monotone" dataKey="kas" name="Kas" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="bank" name="Bank" stroke="#059DEA" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
