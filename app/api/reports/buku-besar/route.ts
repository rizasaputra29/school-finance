import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/withAuthAppRouter';
import { Account, Prisma } from '@prisma/client';

type JournalEntryLineWithJournal = Prisma.JournalEntryLineGetPayload<{
  include: {
    journalEntry: {
      select: {
        tanggal: true;
        keterangan: true;
        reference: true;
      };
    };
  };
}>;

interface ReportWhere {
  kodeAkun?: string | { in: string[] };
  journalEntry?: {
    tanggal: {
      gte?: Date;
      lte?: Date;
    };
  };
}

const DEBIT_NORMAL_ACCOUNTS = ['Asset', 'Aset', 'Expense', 'Beban'];

function parseQueryParams(query: Record<string, string>) {
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 1000, 5000);
  const startDate = query.startDate ? new Date(query.startDate) : null;
  const endDate = query.endDate ? new Date(query.endDate) : null;
  const kodeAkun = query.kodeAkun || undefined;

  return { startDate, endDate, kodeAkun, page, limit };
}

async function getLedgerForAccount(
  account: Account,
  params: ReturnType<typeof parseQueryParams>,
  priorBalances: Map<string, number>,
  periodLines: Map<string, JournalEntryLineWithJournal[]>
) {
  const isDebitNormal = DEBIT_NORMAL_ACCOUNTS.includes(account.tipeAkun);

  // Calculate opening balance using pre-fetched aggregate
  let openingBalance = account.saldo;
  if (params.startDate) {
    const priorNet = priorBalances.get(account.kodeAkun) || 0;
    openingBalance += isDebitNormal ? priorNet : -priorNet;
  }

  // Get lines for this account from pre-fetched data
  const lines = periodLines.get(account.kodeAkun) || [];

  const skip = (params.page - 1) * params.limit;
  const paginatedLines = lines.slice(skip, skip + params.limit);
  const totalLines = lines.length;

  // Calculate running balance
  let runningBalance = openingBalance;
  const data = paginatedLines.map((line) => {
    runningBalance += isDebitNormal
      ? line.debit - line.kredit
      : line.kredit - line.debit;

    return {
      id: line.id,
      tanggal: line.journalEntry.tanggal.toISOString().split('T')[0],
      keterangan: line.journalEntry.keterangan || '-',
      reference: line.journalEntry.reference,
      debit: line.debit,
      kredit: line.kredit,
      saldo: runningBalance,
    };
  });

  let totalDebit = 0;
  let totalKredit = 0;
  lines.forEach((line) => {
    totalDebit += line.debit;
    totalKredit += line.kredit;
  });

  return {
    account: {
      kodeAkun: account.kodeAkun,
      namaAkun: account.namaAkun,
      tipeAkun: account.tipeAkun,
    },
    data,
    summary: {
      openingBalance,
      totalDebit,
      totalKredit,
      endingBalance: runningBalance,
    },
    pagination: {
      page: params.page,
      limit: params.limit,
      total: totalLines,
      totalPages: Math.ceil(totalLines / params.limit),
    },
  };
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const query = getQueryParams(request);
    const params = parseQueryParams(query);

    let targetAccounts: Account[] = [];

    if (params.kodeAkun && params.kodeAkun !== 'Semua') {
      const account = await prisma.account.findUnique({
        where: { kodeAkun: params.kodeAkun },
      });
      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
      targetAccounts = [account];
    } else {
      targetAccounts = await prisma.account.findMany({
        orderBy: { kodeAkun: 'asc' },
      });
    }

    const kodeAkuns = targetAccounts.map((a) => a.kodeAkun);

    // Batch fetch 1: Get all opening balance aggregates in one query
    const priorBalances = new Map<string, number>();
    if (params.startDate) {
      const priorLinesByAccount = await prisma.journalEntryLine.groupBy({
        by: ['kodeAkun'],
        where: {
          kodeAkun: { in: kodeAkuns },
          journalEntry: {
            tanggal: { lt: params.startDate },
            status: 'posted',
          },
        },
        _sum: { debit: true, kredit: true },
      });

      for (const group of priorLinesByAccount) {
        const pd = group._sum.debit || 0;
        const pk = group._sum.kredit || 0;
        priorBalances.set(group.kodeAkun, pd - pk);
      }
    }

    // Batch fetch 2: Get all period lines in one query
    const periodWhere: ReportWhere = {
      kodeAkun: { in: kodeAkuns },
    };

    if (params.startDate || params.endDate) {
      periodWhere.journalEntry = { tanggal: {} };
      if (params.startDate) periodWhere.journalEntry!.tanggal.gte = params.startDate;
      if (params.endDate) periodWhere.journalEntry!.tanggal.lte = params.endDate;
    }

    const allPeriodLines = await prisma.journalEntryLine.findMany({
      where: periodWhere,
      include: {
        journalEntry: {
          select: {
            tanggal: true,
            keterangan: true,
            reference: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { tanggal: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
      ],
    });

    // Group lines by account
    const periodLinesByAccount = new Map<string, JournalEntryLineWithJournal[]>();
    for (const line of allPeriodLines) {
      const existing = periodLinesByAccount.get(line.kodeAkun) || [];
      existing.push(line);
      periodLinesByAccount.set(line.kodeAkun, existing);
    }

    // Process each account with pre-fetched data
    const reports = await Promise.all(
      targetAccounts.map((account) =>
        getLedgerForAccount(account, params, priorBalances, periodLinesByAccount)
      )
    );

    // If only one account requested, still return inside reports array for consistency
    return NextResponse.json({
      reports,
    });
  });
}
