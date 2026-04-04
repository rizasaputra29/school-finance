import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/with-auth';

interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
}

interface DateRangeFilter {
  gte?: Date;
  lte?: Date;
}

interface JournalWhereClause {
  journalEntry?: {
    tanggal: DateRangeFilter;
  };
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const query = getQueryParams(request);
    const { bulan, tahun } = query;

    const journalWhereDate: DateRangeFilter = {};

    if (bulan && tahun) {
      const month = parseInt(bulan, 10);
      const year = parseInt(tahun, 10);
      journalWhereDate.gte = new Date(year, month - 1, 1);
      journalWhereDate.lte = new Date(year, month, 0, 23, 59, 59);
    } else if (tahun) {
      const year = parseInt(tahun, 10);
      journalWhereDate.gte = new Date(year, 0, 1);
      journalWhereDate.lte = new Date(year, 11, 31, 23, 59, 59);
    }

    const accounts = (await prisma.account.findMany({
      where: {
        tipeAkun: { in: ['Revenue', 'Expense'] },
      },
      orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
    })) as AccountRecord[];

    // If there is no specific date bounds that slice out the beginning of the system,
    // we should include initial seeded saldo in calculation (e.g. they want overall view or YTD)
    // If there's a strict `gte` start date, we likely only want net movement in that specific period.
    const shouldIncludeSeededSaldo = !journalWhereDate.gte;

    const queryWhere: JournalWhereClause = {};
    if (journalWhereDate.gte || journalWhereDate.lte) {
      queryWhere.journalEntry = { tanggal: journalWhereDate };
    }

    const lineTotals = await prisma.journalEntryLine.groupBy({
      by: ['kodeAkun'],
      _sum: { debit: true, kredit: true },
      where: queryWhere,
    });

    const accountMap = new Map<string, { debit: number; kredit: number }>();
    for (const line of lineTotals) {
      accountMap.set(line.kodeAkun, {
        debit: line._sum.debit || 0,
        kredit: line._sum.kredit || 0,
      });
    }

    const revenueAccounts = accounts.filter((a) => a.tipeAkun === 'Revenue');
    const expenseAccounts = accounts.filter((a) => a.tipeAkun === 'Expense');

    const revenueData = revenueAccounts.map((account) => {
      const movements = accountMap.get(account.kodeAkun) || { debit: 0, kredit: 0 };
      // Revenue is normal credit balance
      const netMovement = movements.kredit - movements.debit;
      let total = netMovement;
      if (shouldIncludeSeededSaldo) total += account.saldo;

      return {
        kodeAkun: account.kodeAkun,
        namaAkun: account.namaAkun,
        tipeAkun: account.tipeAkun,
        jumlah: Math.max(0, total),
      };
    });

    const expenseData = expenseAccounts.map((account) => {
      const movements = accountMap.get(account.kodeAkun) || { debit: 0, kredit: 0 };
      // Expense is normal debit balance
      const netMovement = movements.debit - movements.kredit;
      let total = netMovement;
      if (shouldIncludeSeededSaldo) total += account.saldo;

      return {
        kodeAkun: account.kodeAkun,
        namaAkun: account.namaAkun,
        tipeAkun: account.tipeAkun,
        jumlah: Math.max(0, total),
      };
    });

    const totalPendapatan = revenueData.reduce((sum, item) => sum + item.jumlah, 0);
    const totalBeban = expenseData.reduce((sum, item) => sum + item.jumlah, 0);
    const labaRugi = totalPendapatan - totalBeban;

    const status = labaRugi >= 0 ? 'LABA' : 'RUGI';

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

    return NextResponse.json({
      data,
      summary: {
        totalPendapatan,
        totalBeban,
        labaRugi: Math.abs(labaRugi),
        status,
        isPositive: labaRugi >= 0,
      },
      filters: {
        bulan: bulan ? parseInt(bulan, 10) : null,
        tahun: tahun ? parseInt(tahun, 10) : null,
      },
    });
  });
}
