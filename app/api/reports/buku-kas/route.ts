import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/with-auth';
import { success } from '@/lib/api-response';
import { handlePrismaErrorResponse } from '@/lib/prisma-errors';

// Type definitions
interface CashflowRecord {
  id: string;
  tanggal: Date;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
  kategori: string | null;
}

interface CashflowWhere {
  tanggal?: {
    gte: Date;
    lte: Date;
  };
  kodeAkun?: string;
  kategori?: string;
}

// Query validation schema
const querySchema = {
  startDate: (val: string | undefined) => (val ? new Date(val) : null),
  endDate: (val: string | undefined) => (val ? new Date(val) : null),
  kodeAkun: (val: string | undefined) => val || undefined,
  kategori: (val: string | undefined) => val || undefined,
  page: (val: string | undefined) => parseInt(val || '') || 1,
  limit: (val: string | undefined) => parseInt(val || '') || 50,
};

// Parse and validate query parameters
function parseQueryParams(query: Record<string, string>) {
  const page = querySchema.page(query.page);
  const limit = Math.min(querySchema.limit(query.limit), 100); // Cap at 100
  const startDate = querySchema.startDate(query.startDate);
  const endDate = querySchema.endDate(query.endDate);
  const kodeAkun = querySchema.kodeAkun(query.kodeAkun);
  const kategori = querySchema.kategori(query.kategori);

  return { startDate, endDate, kodeAkun, kategori, page, limit };
}

// Build Prisma where clause
function buildWhereClause(params: ReturnType<typeof parseQueryParams>): CashflowWhere {
  const where: CashflowWhere = {};

  if (params.startDate && params.endDate) {
    where.tanggal = {
      gte: params.startDate,
      lte: params.endDate,
    };
  }

  if (params.kodeAkun) {
    where.kodeAkun = params.kodeAkun;
  }

  if (params.kategori) {
    where.kategori = params.kategori;
  }

  return where;
}

// Calculate opening balance from transactions before start date
async function calculateOpeningBalance(startDate: Date | null): Promise<number> {
  if (!startDate) return 0;

  const priorCashflows = (await prisma.cashflow.findMany({
    where: {
      tanggal: { lt: startDate },
    },
  })) as CashflowRecord[];

  return priorCashflows.reduce((sum, cf) => sum + cf.debit - cf.kredit, 0);
}

// Calculate running balance for entries
function calculateRunningBalance(
  cashflows: CashflowRecord[],
  openingBalance: number
): Array<{
  id: string;
  tanggal: string;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
  saldo: number;
}> {
  let runningBalance = openingBalance;

  return cashflows.map((cf) => {
    runningBalance = runningBalance + cf.debit - cf.kredit;
    return {
      id: cf.id,
      tanggal: cf.tanggal.toISOString().split('T')[0],
      keterangan: cf.keterangan,
      kodeAkun: cf.kodeAkun,
      debit: cf.debit,
      kredit: cf.kredit,
      saldo: runningBalance,
    };
  });
}

// Verify double-entry balance
function verifyDoubleEntry(totalDebit: number, totalKredit: number): {
  isBalanced: boolean;
  difference: number;
} {
  const difference = Math.abs(totalDebit - totalKredit);
  return {
    isBalanced: difference === 0,
    difference,
  };
}

// Build response filters object
function buildFilters(params: ReturnType<typeof parseQueryParams>) {
  return {
    startDate: params.startDate?.toISOString().split('T')[0] || null,
    endDate: params.endDate?.toISOString().split('T')[0] || null,
    kodeAkun: params.kodeAkun || null,
    kategori: params.kategori || null,
  };
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const query = getQueryParams(request);
      const params = parseQueryParams(query);
      const where = buildWhereClause(params);
      const skip = (params.page - 1) * params.limit;

      // Fetch cashflows with pagination
      const [cashflows, total, summaryAgg] = await Promise.all([
        prisma.cashflow.findMany({
          where,
          orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
          skip,
          take: params.limit,
        }) as Promise<CashflowRecord[]>,
        prisma.cashflow.count({ where }),
        prisma.cashflow.aggregate({
          where,
          _sum: {
            debit: true,
            kredit: true,
          },
        }),
      ]);

      // Calculate opening balance
      const openingBalance = await calculateOpeningBalance(params.startDate);

      // Calculate running balance for each entry
      const data = calculateRunningBalance(cashflows, openingBalance);

      // Get totals from aggregation
      const totalDebit = summaryAgg._sum.debit || 0;
      const totalKredit = summaryAgg._sum.kredit || 0;

      // Verify double-entry
      const balanceCheck = verifyDoubleEntry(totalDebit, totalKredit);

      // Calculate final balance
      const saldoAkhir = openingBalance + totalDebit - totalKredit;

      return success(data, {
        message: 'Laporan buku kas berhasil diambil',
        meta: {
          pagination: {
            page: params.page,
            limit: params.limit,
            total,
            totalPages: Math.ceil(total / params.limit),
          },
          summary: {
            totalDebit,
            totalKredit,
            saldoAkhir,
            isBalanced: balanceCheck.isBalanced,
            openingBalance,
          },
          filters: buildFilters(params),
        },
      });
    } catch (error) {
      return handlePrismaErrorResponse(error);
    }
  });
}
