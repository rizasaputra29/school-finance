import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/withAuthAppRouter';

// Month names in Indonesian
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Color palette for pie chart
const COLORS = ['#059DEA', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isChart = searchParams.get('chart') === 'true';
    const bulan = parseInt(searchParams.get('bulan') || '1');
    const tahun = parseInt(searchParams.get('tahun') || new Date().getFullYear().toString());

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (startDate && endDate) {
      dateFilter.gte = new Date(startDate);
      dateFilter.lte = new Date(endDate);
    }

    if (isChart) {
      // Return chart data
      const chartData = await getChartData(bulan, tahun);
      return NextResponse.json(chartData);
    }

    // Return main dashboard data
    const [
      totalStudents,
      paidBillings,
      unpaidBillings,
      cashflowTotals,
      recentTransactions,
    ] = await Promise.all([
      prisma.student.count({ where: { status: 'Active' } }),
      prisma.billing.count({ where: { statusBayar: 'Lunas' } }),
      prisma.billing.count({ where: { statusBayar: 'Belum Lunas' } }),
      prisma.cashflow.aggregate({
        _sum: {
          debit: true,
          kredit: true,
        },
        where: startDate && endDate ? { tanggal: dateFilter } : {},
      }),
      prisma.cashflow.findMany({
        where: startDate && endDate ? { tanggal: dateFilter } : {},
        orderBy: { tanggal: 'desc' },
        take: 10,
        include: {
          account: {
            select: {
              kodeAkun: true,
              namaAkun: true,
            },
          },
        },
      }),
    ]);

    const totalDebit = cashflowTotals._sum.debit || 0;
    const totalKredit = cashflowTotals._sum.kredit || 0;
    const saldo = totalDebit - totalKredit;

    return NextResponse.json({
      summary: {
        totalStudents,
        totalDebit,
        totalKredit,
        saldo,
        lunasCount: paidBillings,
        belumLunasCount: unpaidBillings,
      },
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        tanggal: tx.tanggal.toISOString(),
        keterangan: tx.keterangan,
        kodeAkun: tx.kodeAkun,
        debit: tx.debit,
        kredit: tx.kredit,
      })),
    });
  });
}

async function getChartData(bulan: number, tahun: number) {
  // Get start and end of selected month
  const startOfMonth = new Date(tahun, bulan - 1, 1);
  const endOfMonth = new Date(tahun, bulan, 0, 23, 59, 59, 999);

  // Get expense data by category for pie chart
  const expensesByCategory = await prisma.cashflow.groupBy({
    by: ['kategori'],
    where: {
      kredit: { gt: 0 },
      tanggal: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
    _sum: {
      kredit: true,
    },
  });

  // Format pie chart data
  const pieChart = expensesByCategory
    .filter((item) => item._sum.kredit && item._sum.kredit > 0)
    .map((item, index) => ({
      name: item.kategori || 'Lainnya',
      value: item._sum.kredit || 0,
      color: COLORS[index % COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6); // Top 6 categories

  // Get monthly data for bar chart (current year)
  const monthlyData = await Promise.all(
    Array.from({ length: 12 }, (_, i) => {
      const monthStart = new Date(tahun, i, 1);
      const monthEnd = new Date(tahun, i + 1, 0, 23, 59, 59, 999);
      
      return prisma.cashflow.aggregate({
        _sum: {
          debit: true,
          kredit: true,
        },
        where: {
          tanggal: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      });
    })
  );

  // Format bar chart data
  const barChart = monthlyData.map((data, index) => ({
    bulan: monthNames[index],
    pendapatan: data._sum.debit || 0,
    beban: data._sum.kredit || 0,
  }));

  return {
    pieChart,
    barChart,
  };
}
