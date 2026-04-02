import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

interface ReportWhere {
  kodeAkun?: string;
  journalEntry?: {
    tanggal: {
      gte?: Date;
      lte?: Date;
    };
  };
}

const DEBIT_NORMAL_ACCOUNTS = ['Asset', 'Aset', 'Expense', 'Beban'];

function parseQueryParams(query: Record<string, unknown>) {
  const page = parseInt(query.page as string) || 1;
  const limit = Math.min(parseInt(query.limit as string) || 1000, 5000); 
  const startDate = query.startDate && typeof query.startDate === 'string' ? new Date(query.startDate) : null;
  const endDate = query.endDate && typeof query.endDate === 'string' ? new Date(query.endDate) : null;
  const kodeAkun = typeof query.kodeAkun === 'string' ? query.kodeAkun : undefined;

  return { startDate, endDate, kodeAkun, page, limit };
}

import { Account } from '@prisma/client';

async function getLedgerForAccount(account: Account, params: ReturnType<typeof parseQueryParams>) {
  const isDebitNormal = DEBIT_NORMAL_ACCOUNTS.includes(account.tipeAkun);

  // Calculate opening balance before startDate
  let openingBalance = account.saldo; // starting balance from seed
  if (params.startDate) {
    const priorLines = await prisma.journalEntryLine.aggregate({
      where: {
        kodeAkun: account.kodeAkun,
        journalEntry: {
          tanggal: { lt: params.startDate },
          status: 'posted'
        }
      },
      _sum: { debit: true, kredit: true }
    });

    const pd = priorLines._sum.debit || 0;
    const pk = priorLines._sum.kredit || 0;
    openingBalance += isDebitNormal ? (pd - pk) : (pk - pd);
  }

  // Build where clause for the current period
  const where: ReportWhere = { kodeAkun: account.kodeAkun };
  
  if (params.startDate || params.endDate) {
    where.journalEntry = { tanggal: {} };
    if (params.startDate) where.journalEntry.tanggal.gte = params.startDate;
    if (params.endDate) where.journalEntry.tanggal.lte = params.endDate;
  }

  const skip = (params.page - 1) * params.limit;

  const lines = await prisma.journalEntryLine.findMany({
    where,
    include: {
      journalEntry: {
        select: {
          tanggal: true,
          keterangan: true,
          reference: true
        }
      }
    },
    orderBy: [
      { journalEntry: { tanggal: 'asc' } },
      { journalEntry: { createdAt: 'asc' } }
    ],
    skip,
    take: params.limit,
  });

  const totalLines = await prisma.journalEntryLine.count({ where });

  // Calculate running balance
  let runningBalance = openingBalance;
  const data = lines.map(line => {
    runningBalance += isDebitNormal 
      ? (line.debit - line.kredit) 
      : (line.kredit - line.debit);
      
    return {
      id: line.id,
      tanggal: line.journalEntry.tanggal.toISOString().split('T')[0],
      keterangan: line.journalEntry.keterangan || '-',
      reference: line.journalEntry.reference,
      debit: line.debit,
      kredit: line.kredit,
      saldo: runningBalance
    };
  });

  let totalDebit = 0;
  let totalKredit = 0;
  lines.forEach(line => {
    totalDebit += line.debit;
    totalKredit += line.kredit;
  });

  return {
    account: {
      kodeAkun: account.kodeAkun,
      namaAkun: account.namaAkun,
      tipeAkun: account.tipeAkun
    },
    data,
    summary: {
      openingBalance,
      totalDebit,
      totalKredit,
      endingBalance: runningBalance
    },
    pagination: {
      page: params.page,
      limit: params.limit,
      total: totalLines,
      totalPages: Math.ceil(totalLines / params.limit),
    }
  };
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const params = parseQueryParams(req.query);

    let targetAccounts = [];
    
    if (params.kodeAkun && params.kodeAkun !== 'Semua') {
      const account = await prisma.account.findUnique({
        where: { kodeAkun: params.kodeAkun }
      });
      if (!account) return res.status(404).json({ error: 'Account not found' });
      targetAccounts = [account];
    } else {
      targetAccounts = await prisma.account.findMany({
        orderBy: { kodeAkun: 'asc' }
      });
    }

    const reports = await Promise.all(
      targetAccounts.map(account => getLedgerForAccount(account, params))
    );

    // If only one account requested, still return inside reports array for consistency
    return res.status(200).json({
      reports
    });

  } catch (error) {
    console.error('Buku Besar API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
