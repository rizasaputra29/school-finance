import prisma from './prisma';

/**
 * Cache utility for database queries.
 * Originally used Next.js unstable_cache, but this throws 
 * 'Invariant: static generation store missing' in Pages Router API routes.
 * 
 * We now bypass the Next.js cache to query Prisma directly to avoid stale data 
 * issues and Pages Router incompatibilities.
 */

export async function getCachedAccounts() {
  return prisma.account.findMany({
    orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
  });
}

export async function getCachedDashboardData() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  
  const [
    totalStudents,
    totalAccounts,
    recentCashflows,
    accountSummary,
  ] = await Promise.all([
    prisma.student.count({ where: { status: 'Active' } }),
    prisma.account.findMany(),
    prisma.cashflow.findMany({
      where: { tanggal: { gte: startDate, lte: endDate } },
      orderBy: { tanggal: 'desc' },
      take: 10,
    }),
    prisma.account.groupBy({
      by: ['tipeAkun'],
      _sum: { saldo: true },
    }),
  ]);
  
  return { totalStudents, totalAccounts, recentCashflows, accountSummary };
}

export async function getCachedCashflows(page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.cashflow.findMany({
      orderBy: { tanggal: 'desc' },
      skip,
      take: limit,
    }),
    prisma.cashflow.count(),
  ]);
  
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/**
 * No-op cache invalidation functions since we querying directly now.
 */
export function revalidateCache(tag: string): void {}
export function invalidateAccountsCache(): void {}
export function invalidateReportsCache(): void {}
export function invalidateDashboardCache(): void {}

export async function getFilteredDashboardCache(bulan?: number, tahun?: number, startDate?: string, endDate?: string) {
  let start: Date;
  let end: Date;
  
  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else if (bulan && tahun) {
    start = new Date(tahun, bulan - 1, 1);
    end = new Date(tahun, bulan, 0);
  } else if (tahun) {
    start = new Date(tahun, 0, 1);
    end = new Date(tahun, 11, 31);
  } else {
    end = new Date();
    start = new Date();
    start.setFullYear(start.getFullYear() - 1);
  }
  
  const [
    cashflows,
    accounts,
  ] = await Promise.all([
    prisma.cashflow.findMany({
      where: { tanggal: { gte: start, lte: end } },
      orderBy: { tanggal: 'asc' },
    }),
    prisma.account.findMany(),
  ]);
  
  const totalDebit = cashflows.reduce((sum, cf) => sum + cf.debit, 0);
  const totalKredit = cashflows.reduce((sum, cf) => sum + cf.kredit, 0);
  const totalPendapatan = totalDebit;
  const totalBeban = totalKredit;
  const saldo = totalPendapatan - totalBeban;
  
  const expenseByCategory: Record<string, number> = {};
  cashflows.forEach((cf) => {
    if (cf.kredit > 0) {
      const account = accounts.find(a => a.kodeAkun === cf.kodeAkun);
      const categoryName = account?.namaAkun || cf.kodeAkun;
      expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + cf.kredit;
    }
  });
  
  const pieChart = Object.entries(expenseByCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const barChart: Array<{ bulan: string; pendapatan: number; beban: number }> = [];
  
  const year = tahun || new Date().getFullYear();
  
  for (let m = 1; m <= 12; m++) {
    const mStart = new Date(year, m - 1, 1);
    const mEnd = new Date(year, m, 0);
    
    const monthlyCashflows = cashflows.filter(cf => {
      const cfDate = new Date(cf.tanggal);
      return cfDate >= mStart && cfDate <= mEnd;
    });
    
    const pendapatan = monthlyCashflows.reduce((sum, cf) => sum + cf.debit, 0);
    const beban = monthlyCashflows.reduce((sum, cf) => sum + cf.kredit, 0);
    
    barChart.push({
      bulan: monthNames[m - 1],
      pendapatan,
      beban,
    });
  }
  
  return {
    summary: {
      totalPendapatan,
      totalBeban,
      saldo,
    },
    pieChart,
    barChart,
  };
}
