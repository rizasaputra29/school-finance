/**
 * Jurnal Umum Report API
 * Provides journal entry listing with date filtering and status
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/with-auth';
import { roundAmount, isAmountEqual } from '@/lib/accounting/validation';

// ============================================================================
// Types
// ============================================================================

interface JournalEntryRecord {
  id: string;
  tanggal: Date;
  keterangan: string;
  reference: string | null;
  status: string;
  postedAt: Date | null;
  createdAt: Date;
  entries: Array<{
    id: string;
    kodeAkun: string;
    debit: number;
    kredit: number;
    account: {
      namaAkun: string;
      tipeAkun: string;
    };
  }>;
}

// ============================================================================
// Query Parsing
// ============================================================================

interface QueryParams {
  startDate: Date | null;
  endDate: Date | null;
  status: string | null;
  search: string | null;
  page: number;
  limit: number;
}

function parseQueryParams(query: Record<string, string>): QueryParams {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));

  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (query.startDate) {
    startDate = new Date(query.startDate);
  }

  if (query.endDate) {
    endDate = new Date(query.endDate);
  }

  return {
    startDate,
    endDate,
    status: query.status || null,
    search: query.search || null,
    page,
    limit,
  };
}

// ============================================================================
// Where Clause Builder
// ============================================================================

function buildWhereClause(params: QueryParams): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  // Date range filter
  if (params.startDate && params.endDate) {
    where.tanggal = {
      gte: params.startDate,
      lte: new Date(params.endDate.getTime() + 24 * 60 * 60 * 1000 - 1), // End of day
    };
  }

  // Status filter
  if (params.status) {
    where.status = params.status;
  }

  // Search filter (keterangan or reference)
  if (params.search) {
    where.OR = [
      { keterangan: { contains: params.search, mode: 'insensitive' } },
      { reference: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

// ============================================================================
// Response Helpers
// ============================================================================

function formatJournalEntry(entry: JournalEntryRecord) {
  const totalDebit = entry.entries.reduce((sum, e) => sum + e.debit, 0);
  const totalKredit = entry.entries.reduce((sum, e) => sum + e.kredit, 0);

  return {
    id: entry.id,
    tanggal: entry.tanggal.toISOString().split('T')[0],
    reference: entry.reference,
    keterangan: entry.keterangan,
    status: entry.status,
    postedAt: entry.postedAt?.toISOString() || null,
    createdAt: entry.createdAt.toISOString(),
    entries: entry.entries.map((e) => ({
      kodeAkun: e.kodeAkun,
      namaAkun: e.account.namaAkun,
      tipeAkun: e.account.tipeAkun,
      debit: roundAmount(e.debit),
      kredit: roundAmount(e.kredit),
    })),
    totals: {
      totalDebit: roundAmount(totalDebit),
      totalKredit: roundAmount(totalKredit),
      isBalanced: isAmountEqual(totalDebit, totalKredit),
    },
  };
}

function buildFilters(params: QueryParams) {
  return {
    startDate: params.startDate?.toISOString().split('T')[0] || null,
    endDate: params.endDate?.toISOString().split('T')[0] || null,
    status: params.status || null,
    search: params.search || null,
  };
}

// ============================================================================
// API Handler
// ============================================================================

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const query = getQueryParams(request);
    const params = parseQueryParams(query);
    const where = buildWhereClause(params);
    const skip = (params.page - 1) * params.limit;

    // Fetch journal entries with pagination
    const [journals, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          entries: {
            include: {
              account: {
                select: { namaAkun: true, tipeAkun: true },
              },
            },
          },
        },
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: params.limit,
      }) as Promise<JournalEntryRecord[]>,
      prisma.journalEntry.count({ where }),
    ]);

    // Format response
    const data = journals.map(formatJournalEntry);

    // Calculate summary
    let totalDebit = 0;
    let totalKredit = 0;
    let postedCount = 0;
    let draftCount = 0;
    let approvedCount = 0;

    for (const journal of journals) {
      totalDebit += journal.entries.reduce((sum, e) => sum + e.debit, 0);
      totalKredit += journal.entries.reduce((sum, e) => sum + e.kredit, 0);

      switch (journal.status) {
        case 'posted':
          postedCount++;
          break;
        case 'draft':
          draftCount++;
          break;
        case 'approved':
          approvedCount++;
          break;
      }
    }

    return NextResponse.json({
      data,
      summary: {
        totalDebit: roundAmount(totalDebit),
        totalKredit: roundAmount(totalKredit),
        isBalanced: isAmountEqual(totalDebit, totalKredit),
        byStatus: {
          draft: draftCount,
          approved: approvedCount,
          posted: postedCount,
        },
      },
      filters: buildFilters(params),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    });
  });
}
