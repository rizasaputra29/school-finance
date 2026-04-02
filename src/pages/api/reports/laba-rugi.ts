import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

// Types for Prisma v7
interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
}

interface CashflowRecord {
  id: string;
  tanggal: Date;
  kodeAkun: string;
  debit: number;
  kredit: number;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse query params for period filtering
    const { bulan, tahun } = req.query;

    // Build date filter for cashflows
    const cashflowWhere: Record<string, unknown> = {};
    
    if (bulan && tahun) {
      const month = parseInt(bulan as string, 10);
      const year = parseInt(tahun as string, 10);
      
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of month
      
      cashflowWhere.tanggal = {
        gte: startDate,
        lte: endDate,
      };
    } else if (tahun) {
      // Filter by year only
      const year = parseInt(tahun as string, 10);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      
      cashflowWhere.tanggal = {
        gte: startDate,
        lte: endDate,
      };
    }

    // Get all Revenue and Expense accounts
    const accounts = await prisma.account.findMany({
      where: {
        tipeAkun: { in: ['Revenue', 'Expense'] },
      },
      orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
    }) as AccountRecord[];

    // Get cashflows for the period
    const cashflows = await prisma.cashflow.findMany({
      where: cashflowWhere,
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    }) as CashflowRecord[];

    // Calculate totals from cashflows (more accurate for period filtering)
    const revenueAccounts = accounts.filter((a) => a.tipeAkun === 'Revenue');
    const expenseAccounts = accounts.filter((a) => a.tipeAkun === 'Expense');

    // Calculate totals for each Revenue account from cashflows
    const revenueData = revenueAccounts.map((account) => {
      const accountCashflows = cashflows.filter((cf) => cf.kodeAkun === account.kodeAkun);
      const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
      const totalKredit = accountCashflows.reduce((sum, cf) => sum + cf.kredit, 0);
      
      // For Revenue accounts: kredit increases revenue
      const jumlah = totalKredit - totalDebit;
      
      return {
        kodeAkun: account.kodeAkun,
        namaAkun: account.namaAkun,
        tipeAkun: account.tipeAkun,
        jumlah: Math.max(0, jumlah), // Ensure non-negative
      };
    });

    // Calculate totals for each Expense account from cashflows
    const expenseData = expenseAccounts.map((account) => {
      const accountCashflows = cashflows.filter((cf) => cf.kodeAkun === account.kodeAkun);
      const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
      const totalKredit = accountCashflows.reduce((sum, cf) => sum + cf.kredit, 0);
      
      // For Expense accounts: debit increases expense
      const jumlah = totalDebit - totalKredit;
      
      return {
        kodeAkun: account.kodeAkun,
        namaAkun: account.namaAkun,
        tipeAkun: account.tipeAkun,
        jumlah: Math.max(0, jumlah),
      };
    });

    // Calculate summary totals
    const totalPendapatan = revenueData.reduce((sum, item) => sum + item.jumlah, 0);
    const totalBeban = expenseData.reduce((sum, item) => sum + item.jumlah, 0);
    const labaRugi = totalPendapatan - totalBeban;

    // Determine status: LABA (profit) or RUGI (loss)
    const status = labaRugi >= 0 ? 'LABA' : 'RUGI';

    // Build response data - combine revenues and expenses
    const data = [
      ...revenueData.map((item) => ({
        ...item,
        kategori: 'PENDAPATAN',
      })),
      ...expenseData.map((item) => ({
        ...item,
        kategori: 'BEBAN',
      })),
    ];

    return res.status(200).json({
      data,
      summary: {
        totalPendapatan,
        totalBeban,
        labaRugi: Math.abs(labaRugi), // Return absolute value for display
        status,
        isPositive: labaRugi >= 0,
      },
      filters: {
        bulan: bulan ? parseInt(bulan as string, 10) : null,
        tahun: tahun ? parseInt(tahun as string, 10) : null,
      },
    });
  } catch (error) {
    console.error('Laba Rugi API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });