import { unstable_cache, revalidateTag } from 'next/cache';
import prisma from './prisma';

/**
 * Cache utility for database queries using Next.js unstable_cache
 * 
 * Note: In Next.js 16, unstable_cache takes 2 required arguments:
 * - fetchData: async function to cache
 * - keyParts: string[] for cache key
 * - Options are NOT passed as third argument (unlike older versions)
 * 
 * Usage:
 * const getCachedAccounts = unstable_cache(
 *   () => prisma.account.findMany(),
 *   ['accounts']
 * );
 * 
 * Then call: await getCachedAccounts()
 */

// Cache key prefix for accounts
const ACCOUNTS_KEY = ['accounts'];
const DASHBOARD_KEY = ['dashboard'];

/**
 * Creates a cached account query
 * Returns cached accounts list
 */
export const getCachedAccounts = unstable_cache(
  async () => {
    return prisma.account.findMany({
      orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
    });
  },
  ACCOUNTS_KEY
);

/**
 * Creates a cached dashboard data query
 */
export const getCachedDashboardData = unstable_cache(
  async () => {
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
  },
  DASHBOARD_KEY
);

/**
 * Creates a cached cashflow query
 */
export function getCachedCashflows(page: number = 1, limit: number = 10) {
  const key = ['cashflows', String(page), String(limit)];
  
  return unstable_cache(
    async () => {
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
    },
    key
  );
}

/**
 * Revalidates cache by tag
 * Call this after creating/updating/deleting data
 * Usage: revalidateCache('accounts')
 * Note: In Next.js 16, revalidateTag takes tag + optional cacheLife
 */
export function revalidateCache(tag: string): void {
  revalidateTag(tag, 'max');
}

/**
 * Revalidates accounts cache
 */
export function invalidateAccountsCache(): void {
  revalidateTag('accounts', 'max');
}

/**
 * Revalidates reports cache
 */
export function invalidateReportsCache(): void {
  revalidateTag('reports', 'max');
  revalidateTag('neraca', 'max');
  revalidateTag('labarugi', 'max');
  revalidateTag('cashflow', 'max');
}

/**
 * Revalidates dashboard cache
 */
export function invalidateDashboardCache(): void {
  revalidateTag('dashboard', 'max');
  revalidateTag('dashboard-filtered', 'max');
}

/**
 * Creates a filtered dashboard cache key
 */
function getFilteredDashboardKey(params: {
  bulan?: number;
  tahun?: number;
  startDate?: string;
  endDate?: string;
}): string[] {
  const { bulan, tahun, startDate, endDate } = params;
  if (startDate && endDate) {
    return ['dashboard-filtered', 'date', startDate, endDate];
  }
  if (bulan && tahun) {
    return ['dashboard-filtered', 'bulan', String(bulan), String(tahun)];
  }
  if (tahun) {
    return ['dashboard-filtered', 'tahun', String(tahun)];
  }
  return DASHBOARD_KEY;
}

/**
 * Creates a cached dashboard data query with filters
 * Returns dashboard data including summary, pie chart, and bar chart
 */
export function getFilteredDashboardCache(bulan?: number, tahun?: number, startDate?: string, endDate?: string) {
  const key = getFilteredDashboardKey({ bulan, tahun, startDate, endDate });
  
  return unstable_cache(
    async () => {
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
      
      // Calculate summary totals
      const totalDebit = cashflows.reduce((sum, cf) => sum + cf.debit, 0);
      const totalKredit = cashflows.reduce((sum, cf) => sum + cf.kredit, 0);
      const totalPendapatan = totalDebit;
      const totalBeban = totalKredit;
      const saldo = totalPendapatan - totalBeban;
      
      // Build pie chart data - expense by category (kredit = expense/ beban)
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
      
      // Build bar chart data - monthly income vs expense
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const barChart: Array<{ bulan: string; pendapatan: number; beban: number }> = [];
      
      // Determine year from filter or use current year
      const year = tahun || new Date().getFullYear();
      
      for (let m = 1; m <= 12; m++) {
        const mStart = new Date(year, m - 1, 1);
        const mEnd = new Date(year, m, 0);
        
        // Filter cashflows for this month
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
    },
    key
  );
}
