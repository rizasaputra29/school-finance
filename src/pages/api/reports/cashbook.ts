import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

// Define cashflow record type
interface CashflowRecord {
  id: string;
  tanggal: Date;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const where: Record<string, unknown> = {};
    if (startDate && endDate) {
      where.tanggal = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    // Get all cashflow entries ordered by date
    const cashflows = await prisma.cashflow.findMany({
      where,
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    }) as CashflowRecord[];

    // Get initial cash balance from Kas account (account 1100)
    const kasAccount = await prisma.account.findUnique({
      where: { kodeAkun: '1100' },
    });

    // Calculate running balance like Excel Buku Kas
    // If filtering by date, calculate opening balance from transactions before startDate
    let openingBalance = kasAccount?.saldo || 0;
    
    if (startDate) {
      // Get sum of transactions before the start date
      const priorTransactions = await prisma.cashflow.findMany({
        where: {
          tanggal: {
            lt: new Date(startDate as string),
          },
        },
      }) as CashflowRecord[];

      const priorDebit = priorTransactions.reduce((sum, cf) => sum + cf.debit, 0);
      const priorKredit = priorTransactions.reduce((sum, cf) => sum + cf.kredit, 0);
      openingBalance = priorDebit - priorKredit;
    }

    // Calculate running balance for each entry
    let runningBalance = openingBalance;
    const cashbookEntries = cashflows.map((cf) => {
      runningBalance = runningBalance + cf.debit - cf.kredit;
      return {
        id: cf.id,
        tanggal: cf.tanggal,
        keterangan: cf.keterangan,
        kodeAkun: cf.kodeAkun,
        debit: cf.debit,
        kredit: cf.kredit,
        saldo: runningBalance,
      };
    });

    // Calculate totals
    const totalDebit = cashflows.reduce((sum, cf) => sum + cf.debit, 0);
    const totalKredit = cashflows.reduce((sum, cf) => sum + cf.kredit, 0);

    return res.status(200).json({
      data: cashbookEntries,
      summary: {
        saldoAwal: openingBalance,
        totalPemasukan: totalDebit,
        totalPengeluaran: totalKredit,
        saldoAkhir: runningBalance,
        transactionCount: cashflows.length,
      },
    });
  } catch (error) {
    console.error('Cashbook API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
