import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

interface Billing {
  statusBayar: string;
}

interface StudentWithBillings {
  id: string;
  billings: Billing[];
}

interface DashboardFilterParams {
  bulan?: number;
  tahun?: number;
  startDate?: string;
  endDate?: string;
}

function parseFilterParams(req: NextApiRequest): DashboardFilterParams {
  const { bulan, tahun, startDate, endDate } = req.query;
  
  return {
    bulan: bulan ? parseInt(bulan as string) : undefined,
    tahun: tahun ? parseInt(tahun as string) : undefined,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  };
}

async function buildDashboardData(
  params: DashboardFilterParams
): Promise<{
  summary: { totalPendapatan: number; totalBeban: number; saldo: number };
  pieChart: Array<{ name: string; value: number; color: string }>;
  barChart: Array<{ bulan: string; pendapatan: number; beban: number }>;
}> {
  let start: Date;
  let end: Date;
  
  if (params.startDate && params.endDate) {
    start = new Date(params.startDate);
    end = new Date(params.endDate);
  } else if (params.bulan && params.tahun) {
    start = new Date(params.tahun, params.bulan - 1, 1);
    end = new Date(params.tahun, params.bulan, 0, 23, 59, 59);
  } else if (params.tahun) {
    start = new Date(params.tahun, 0, 1);
    end = new Date(params.tahun, 11, 31, 23, 59, 59);
  } else {
    end = new Date();
    start = new Date();
    start.setMonth(start.getMonth() - 6);
  }
  
  const chartYear = params.tahun || end.getFullYear();
  const yearStart = new Date(chartYear, 0, 1);
  const yearEnd = new Date(chartYear, 11, 31, 23, 59, 59);

  // Fetch accounts and all lines in a single year query
  const [accounts, allLines] = await Promise.all([
    prisma.account.findMany(),
    prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          tanggal: { gte: yearStart, lte: yearEnd },
          status: 'posted'
        }
      },
      include: {
        journalEntry: { select: { tanggal: true } }
      }
    })
  ]);
  
  const accountMap = new Map(accounts.map(a => [a.kodeAkun, a]));

  // 1. Calculate Current Total Saldo from ALL asset accounts
  const assetAccounts = accounts.filter(a => a.tipeAkun === 'Asset' || a.tipeAkun === 'Aset');
  let currentSaldo = 0;
  
  for (const acc of assetAccounts) {
    const lines = allLines.filter(l => l.kodeAkun === acc.kodeAkun);
    const netMovement = lines.reduce((sum, l) => sum + (l.debit - l.kredit), 0);
    currentSaldo += acc.saldo + netMovement;
  }

  // 2. Calculate Period Summary from journal entries within date range
  const periodLines = allLines.filter(l => {
    const d = new Date(l.journalEntry.tanggal);
    return d >= start && d <= end;
  });

  let totalPendapatan = 0;
  let totalBeban = 0;
  const expenseByCategory: Record<string, number> = {};

  for (const line of periodLines) {
    const acc = accountMap.get(line.kodeAkun);
    if (!acc) continue;

    if (acc.tipeAkun === 'Revenue') {
      totalPendapatan += (line.kredit - line.debit);
    } else if (acc.tipeAkun === 'Expense') {
      const amount = (line.debit - line.kredit);
      totalBeban += amount;
      if (amount > 0) {
        expenseByCategory[acc.namaAkun] = (expenseByCategory[acc.namaAkun] || 0) + amount;
      }
    }
  }

  // 3. Build Pie Chart
  const COLORS = ['#059DEA', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  const pieChart = Object.entries(expenseByCategory)
    .map(([name, value], index) => ({ 
      name, 
      value, 
      color: COLORS[index % COLORS.length] 
    }))
    .sort((a, b) => b.value - a.value);

  // 4. Build Bar Chart (12 months) - Single pass aggregation
  const barChart: Array<{ bulan: string; pendapatan: number; beban: number }> = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  
  // Pre-initialize monthly data
  const monthlyData = Array.from({ length: 12 }, () => ({ pendapatan: 0, beban: 0 }));
  
  // Single pass through allLines to aggregate by month
  for (const line of allLines) {
    const acc = accountMap.get(line.kodeAkun);
    if (!acc) continue;
    
    const d = new Date(line.journalEntry.tanggal);
    const month = d.getMonth();
    
    if (acc.tipeAkun === 'Revenue') {
      monthlyData[month].pendapatan += (line.kredit - line.debit);
    } else if (acc.tipeAkun === 'Expense') {
      monthlyData[month].beban += (line.debit - line.kredit);
    }
  }
  
  for (let m = 0; m < 12; m++) {
    barChart.push({
      bulan: monthNames[m],
      pendapatan: Math.max(0, monthlyData[m].pendapatan),
      beban: Math.max(0, monthlyData[m].beban),
    });
  }

  return {
    summary: { totalPendapatan, totalBeban, saldo: currentSaldo },
    pieChart,
    barChart,
  };
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const filterParams = parseFilterParams(req);
    const dashboardData = await buildDashboardData(filterParams);
    
    // Get student stats using aggregate queries
    const totalStudents = await prisma.student.count({ where: { status: 'Active' } });
    
    // Count students with all billings paid (Lunas)
    const studentsWithBillings = await prisma.student.findMany({
      where: { status: 'Active' },
      select: {
        id: true,
        billings: {
          select: { statusBayar: true }
        }
      }
    });
    
    let lunasCount = 0;
    for (const s of studentsWithBillings) {
      if (s.billings.length > 0 && s.billings.every(b => b.statusBayar === 'Lunas')) {
        lunasCount++;
      }
    }
    const belumLunasCount = totalStudents - lunasCount;
    
    // Get recent transactions from cashflow for display
    const recentTransactions = await prisma.cashflow.findMany({
      where: { status: 'posted' },
      orderBy: { tanggal: 'desc' },
      take: 5,
    });
    
    return res.status(200).json({
      summary: {
        totalDebit: dashboardData.summary.totalPendapatan,
        totalKredit: dashboardData.summary.totalBeban,
        saldo: dashboardData.summary.saldo,
        totalStudents,
        lunasCount,
        belumLunasCount,
      },
      pieChart: dashboardData.pieChart,
      barChart: dashboardData.barChart,
      recentTransactions,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
