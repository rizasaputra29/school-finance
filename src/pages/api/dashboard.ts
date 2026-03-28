import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { getCachedDashboardData } from '@/lib/cache';

// Define types inline for Prisma v7 compatibility
interface CashflowRecord {
  id: string;
  tanggal: Date;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
  createdAt: Date;
  updatedAt: Date;
}

interface StudentRecord {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  tahunMasuk: number;
  statusBayar: string;
  totalTagihan: number;
  totalBayar: number;
  createdAt: Date;
  updatedAt: Date;
}

interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
  createdAt: Date;
  updatedAt: Date;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  try {
    // Use cached dashboard data for better performance
    const cachedData = await getCachedDashboardData();
    
    // Process cached data
    const cashflows = cachedData.recentCashflows as CashflowRecord[];
    const allAccounts = cachedData.totalAccounts as AccountRecord[];
    
    // Calculate totals from cached cashflows
    const totalDebit = cashflows.reduce((sum: number, cf) => sum + cf.debit, 0);
    const totalKredit = cashflows.reduce((sum: number, cf) => sum + cf.kredit, 0);
    const saldo = totalDebit - totalKredit;

    // Get student stats (less frequently changing, so not cached)
    const students = await prisma.student.findMany({ where: { status: 'Active' } }) as StudentRecord[];
    const totalStudents = students.length;
    const lunasCount = students.filter((s) => s.statusBayar === 'Lunas').length;
    const belumLunasCount = totalStudents - lunasCount;

    // Get account distribution from cached accounts
    const accountDistribution = allAccounts
      .filter((a) => a.tipeAkun === 'Expense' && a.saldo > 0)
      .map((a) => ({
        name: a.namaAkun,
        value: a.saldo,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Get recent transactions (not cached - needs to be fresh)
    const recentTransactions = await prisma.cashflow.findMany({
      orderBy: { tanggal: 'desc' },
      take: 5,
    });

    // Return raw cashflow data for client-side filtering
    return res.status(200).json({
      summary: {
        totalDebit,
        totalKredit,
        saldo,
        totalStudents,
        lunasCount,
        belumLunasCount,
      },
      cashflows: cashflows.map(cf => ({
        id: cf.id,
        tanggal: cf.tanggal,
        debit: cf.debit,
        kredit: cf.kredit,
      })),
      accountDistribution,
      recentTransactions,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
