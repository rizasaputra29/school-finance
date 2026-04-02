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

/**
 * Calculate account balance from cashflows for a given period
 * This ensures accurate period-based calculations
 */
function calculateAccountBalance(
  cashflows: CashflowRecord[],
  kodeAkun: string,
  accountType: string
): number {
  const accountCashflows = cashflows.filter((cf) => cf.kodeAkun === kodeAkun);
  const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
  const totalKredit = accountCashflows.reduce((sum, cf) => sum + cf.kredit, 0);

  // Asset: debit increases (normal balance is debit)
  // Liability & Equity: credit increases (normal balance is credit)
  // Akumulasi Penyusutan is a contra-asset (credit increases, shown as negative)

  if (accountType === 'Asset') {
    // For Asset accounts: debit - credit
    return totalDebit - totalKredit;
  } else if (accountType === 'Liability' || accountType === 'Equity') {
    // For Liability & Equity: credit - debit
    return totalKredit - totalDebit;
  }

  return 0;
}

/**
 * Calculate current period profit/loss (Laba/Rugi)
 */
async function calculateLabaRugi(
  cashflows: CashflowRecord[],
  accounts: AccountRecord[]
): Promise<number> {
  const revenueAccounts = accounts.filter((a) => a.tipeAkun === 'Revenue');
  const expenseAccounts = accounts.filter((a) => a.tipeAkun === 'Expense');

  const totalRevenue = revenueAccounts.reduce((sum, account) => {
    return sum + calculateAccountBalance(cashflows, account.kodeAkun, 'Revenue');
  }, 0);

  const totalExpense = expenseAccounts.reduce((sum, account) => {
    return sum + calculateAccountBalance(cashflows, account.kodeAkun, 'Expense');
  }, 0);

  // Laba = Revenue - Expense (can be positive or negative)
  return totalRevenue - totalExpense;
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
      const endDate = new Date(year, month, 0, 23, 59, 59);

      cashflowWhere.tanggal = {
        gte: startDate,
        lte: endDate,
      };
    } else if (tahun) {
      const year = parseInt(tahun as string, 10);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      cashflowWhere.tanggal = {
        gte: startDate,
        lte: endDate,
      };
    }

    // Get all Asset, Liability, and Equity accounts
    const accounts = await prisma.account.findMany({
      where: {
        tipeAkun: { in: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] },
      },
      orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
    }) as AccountRecord[];

    // Get cashflows for the period
    const cashflows = await prisma.cashflow.findMany({
      where: cashflowWhere,
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    }) as CashflowRecord[];

    // Get account type groups
    const assetAccounts = accounts.filter((a) => a.tipeAkun === 'Asset');
    const liabilityAccounts = accounts.filter((a) => a.tipeAkun === 'Liability');
    const equityAccounts = accounts.filter((a) => a.tipeAkun === 'Equity');

    // Calculate current period profit/loss
    const labaRugi = await calculateLabaRugi(cashflows, accounts);

    // Calculate Aset (Asset) items
    // For Akumulasi Penyusutan, we need special handling (contra-asset)
    const asetData = assetAccounts.map((account) => {
      const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Asset');

      // Check if this is Akumulasi Penyusutan (contra-asset)
      const isAkumulasiPenyusutan =
        account.namaAkun.toLowerCase().includes('akumulasi') ||
        account.namaAkun.toLowerCase().includes('penyusutan');

      return {
        kodeAkun: account.kodeAkun,
        namaAkun: account.namaAkun,
        jumlah: isAkumulasiPenyusutan ? -Math.abs(jumlah) : Math.max(0, jumlah),
      };
    });

    // Calculate Total Aset
    // Sum of all assets minus accumulated depreciation
    const totalAset = asetData.reduce((sum, item) => sum + item.jumlah, 0);

    // Calculate Kewajiban (Liability) items - shown as negative
    const kewajibanData = liabilityAccounts.map((account) => {
      const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Liability');

      // Show liabilities as negative (credit balance)
      return {
        kodeAkun: account.kodeAkun,
        namaAkun: account.namaAkun,
        jumlah: -Math.abs(jumlah), // Always negative for display
      };
    });

    // Calculate Total Kewajiban (Liabilities)
    const totalKewajiban = kewajibanData.reduce((sum, item) => sum + item.jumlah, 0);

    // Calculate Ekuitas (Equity) items
    const ekuitasData = equityAccounts.map((account) => {
      const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Equity');

      return {
        kodeAkun: account.kodeAkun,
        namaAkun: account.namaAkun,
        jumlah,
      };
    });

    // Add Laba/Rugi as separate line item in Ekuitas
    // If profit: adds to equity. If loss: reduces equity
    const labaRugiItem = {
      kodeAkun: 'LABA_RUGI',
      namaAkun: 'Laba/Rugi Berjalan',
      jumlah: labaRugi,
    };

    // Calculate Total Ekuitas (including current period profit/loss)
    const totalEkuitas =
      ekuitasData.reduce((sum, item) => sum + item.jumlah, 0) + labaRugi;

    // Total Liabilitas + Ekuitas
    const totalLiabilitasEkuitas = totalKewajiban + totalEkuitas;

    // Balance check: Aset = Liabilitas + Ekuitas
    const balanceDifference = totalAset - totalLiabilitasEkuitas;
    const isBalance = balanceDifference === 0;

    return res.status(200).json({
      data: {
        aset: asetData,
        kewajiban: kewajibanData,
        ekuitas: [...ekuitasData, labaRugiItem],
      },
      summary: {
        totalAset,
        totalKewajiban,
        totalEkuitas,
        totalLiabilitasEkuitas,
        isBalance,
        balanceDifference,
      },
      filters: {
        bulan: bulan ? parseInt(bulan as string, 10) : null,
        tahun: tahun ? parseInt(tahun as string, 10) : null,
      },
    });
  } catch (error) {
    console.error('Neraca API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
