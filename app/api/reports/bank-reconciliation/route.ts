import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/withAuthAppRouter';

// Get all transactions for a specific account
async function getAccountTransactions(
  kodeAkun: string,
  startDate?: Date,
  endDate?: Date
) {
  const where: Record<string, unknown> = { kodeAkun };

  if (startDate && endDate) {
    where.tanggal = {
      gte: startDate,
      lte: endDate,
    };
  }

  return prisma.cashflow.findMany({
    where,
    orderBy: { tanggal: 'asc' },
  });
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const query = getQueryParams(request);
    const { startDate, endDate, kodeAkun } = query;

    // Parse dates
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    // Find bank account (if not specified, try to find one)
    let bankCode = kodeAkun;

    if (!bankCode) {
      const bankAccount = await prisma.account.findFirst({
        where: {
          OR: [{ kodeAkun: '1110' }, { kodeAkun: '102' }],
          tipeAkun: 'Asset',
        },
      });
      if (!bankAccount?.kodeAkun) {
        return NextResponse.json(
          {
            error: 'Akun Bank tidak ditemukan. Silakan buat akun Bank terlebih dahulu.',
          },
          { status: 404 }
        );
      }
      bankCode = bankAccount.kodeAkun;
    }

    if (!bankCode) {
      return NextResponse.json(
        {
          error: 'Akun Bank tidak ditemukan. Silakan buat akun Bank terlebih dahulu.',
        },
        { status: 404 }
      );
    }

    // Get bank account details
    const bankAccount = await prisma.account.findUnique({
      where: { kodeAkun: bankCode },
    });

    if (!bankAccount) {
      return NextResponse.json({ error: 'Akun Bank tidak ditemukan' }, { status: 404 });
    }

    // Get all bank transactions
    const transactions = await getAccountTransactions(bankCode, start, end);

    // Calculate opening balance
    let openingBalance = 0;

    if (start) {
      // Calculate balance before start date
      const priorTransactions = await prisma.cashflow.findMany({
        where: {
          kodeAkun: bankCode,
          tanggal: { lt: start },
        },
        select: { debit: true, kredit: true },
      });

      openingBalance = priorTransactions.reduce(
        (sum, t) => sum + (t.debit || 0) - (t.kredit || 0),
        0
      );
    } else {
      openingBalance = bankAccount.saldo;
      // Subtract current transactions to get opening
      const currentDebit = transactions.reduce((sum, t) => sum + (t.debit || 0), 0);
      const currentKredit = transactions.reduce((sum, t) => sum + (t.kredit || 0), 0);
      openingBalance = openingBalance - currentDebit + currentKredit;
    }

    // Calculate running balance
    let runningBalance = openingBalance;
    const entries = transactions.map((t) => {
      runningBalance = runningBalance + (t.debit || 0) - (t.kredit || 0);
      return {
        id: t.id,
        tanggal: t.tanggal,
        keterangan: t.keterangan,
        kodeAkun: t.kodeAkun,
        debit: t.debit,
        kredit: t.kredit,
        saldo: runningBalance,
        type: (t.debit || 0) > 0 ? 'debit' : 'kredit',
      };
    });

    // Separate deposits and withdrawals for reconciliation
    const deposits = transactions.filter((t) => (t.debit || 0) > 0);
    const withdrawals = transactions.filter((t) => (t.kredit || 0) > 0);

    const totalDebit = deposits.reduce((sum, t) => sum + (t.debit || 0), 0);
    const totalKredit = withdrawals.reduce((sum, t) => sum + (t.kredit || 0), 0);

    // Get all cash transactions (Kas) for related report
    const kasTransactions = await prisma.cashflow.findMany({
      where: {
        kodeAkun: '1100',
        ...(start && end ? { tanggal: { gte: start, lte: end } } : {}),
      },
      orderBy: { tanggal: 'asc' },
    });

    return NextResponse.json({
      bankAccount: {
        kodeAkun: bankAccount.kodeAkun,
        namaAkun: bankAccount.namaAkun,
        saldo: bankAccount.saldo,
      },
      transactions: entries,
      summary: {
        saldoAwal: openingBalance,
        totalPemasukan: totalDebit,
        totalPengeluaran: totalKredit,
        saldoAkhir: runningBalance,
        transactionCount: transactions.length,
      },
      reconciliation: {
        deposits: deposits.map((d) => ({
          date: d.tanggal,
          description: d.keterangan,
          amount: d.debit,
        })),
        withdrawals: withdrawals.map((w) => ({
          date: w.tanggal,
          description: w.keterangan,
          amount: w.kredit,
        })),
      },
      relatedCash: {
        // Total cash balance
        cashBalance: kasTransactions.reduce(
          (sum, t) => sum + (t.debit || 0) - (t.kredit || 0),
          0
        ),
        transactionCount: kasTransactions.length,
      },
    });
  });
}
