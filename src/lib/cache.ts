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
