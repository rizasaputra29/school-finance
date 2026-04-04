/**
 * Report Snapshot API - Data freeze and snapshot functionality
 * Task 37: Data Freeze & Snapshot
 * Snapshot reports at closing - cannot change, only regenerate via reopen
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams, AuthUser } from '@/lib/withAuthAppRouter';
import { roundAmount } from '@/lib/accounting/validation';

// ============================================================================
// Validation Schemas
// ============================================================================

const createSnapshotSchema = z.object({
  periode: z.string().regex(/^\d{4}-\d{2}$/, 'Format periode: YYYY-MM'),
  tipe: z.enum(['neraca', 'labarugi', 'cashflow']),
});

const reopenSchema = z.object({
  periode: z.string().regex(/^\d{4}-\d{2}$/, 'Format periode: YYYY-MM'),
  reason: z.string().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate balances for a period
 */
async function calculatePeriodBalances(): Promise<{
  accounts: Array<{ kodeAkun: string; namaAkun: string; tipeAkun: string; saldo: number }>;
  totalAset: number;
  totalKewajiban: number;
  totalEkuitas: number;
  totalPendapatan: number;
  totalBeban: number;
}> {
  const accounts = await prisma.account.findMany({
    select: {
      kodeAkun: true,
      namaAkun: true,
      tipeAkun: true,
      saldo: true,
    },
  });

  // Calculate totals by type
  const accountsWithBalances = accounts.map((a) => ({
    ...a,
    saldo: roundAmount(a.saldo),
  }));

  const totalAset = accountsWithBalances
    .filter((a) => a.tipeAkun === 'Asset')
    .reduce((sum, a) => sum + a.saldo, 0);

  const totalKewajiban = accountsWithBalances
    .filter((a) => a.tipeAkun === 'Liability')
    .reduce((sum, a) => sum + a.saldo, 0);

  const totalEkuitas = accountsWithBalances
    .filter((a) => a.tipeAkun === 'Equity')
    .reduce((sum, a) => sum + a.saldo, 0);

  const totalPendapatan = accountsWithBalances
    .filter((a) => a.tipeAkun === 'Revenue')
    .reduce((sum, a) => sum + a.saldo, 0);

  const totalBeban = accountsWithBalances
    .filter((a) => a.tipeAkun === 'Expense')
    .reduce((sum, a) => sum + a.saldo, 0);

  return {
    accounts: accountsWithBalances,
    totalAset: roundAmount(totalAset),
    totalKewajiban: roundAmount(totalKewajiban),
    totalEkuitas: roundAmount(totalEkuitas),
    totalPendapatan: roundAmount(totalPendapatan),
    totalBeban: roundAmount(totalBeban),
  };
}

/**
 * Create snapshot for a report type
 */
async function createSnapshot(
  periode: string,
  tipe: 'neraca' | 'labarugi' | 'cashflow',
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Calculate balances
    const balances = await calculatePeriodBalances();

    // Calculate totals for the snapshot
    let totalDebit = 0;
    let totalKredit = 0;

    switch (tipe) {
      case 'neraca':
        totalDebit = balances.totalAset;
        totalKredit = balances.totalKewajiban + balances.totalEkuitas;
        break;
      case 'labarugi':
        totalDebit = balances.totalBeban;
        totalKredit = balances.totalPendapatan;
        break;
      case 'cashflow':
        // For cashflow, calculate from cash accounts
        const cashAccounts = balances.accounts.filter(
          (a) => a.kodeAkun.startsWith('111') || a.kodeAkun === '102'
        );
        totalDebit = cashAccounts.reduce((sum, a) => sum + a.saldo, 0);
        totalKredit = totalDebit;
        break;
    }

    // Delete existing snapshot if any
    await prisma.snapshot.deleteMany({
      where: { periode, tipe },
    });

    // Create new snapshot
    await prisma.snapshot.create({
      data: {
        periode,
        tipe,
        data: balances as unknown as import('@prisma/client').Prisma.InputJsonValue,
        totalDebit: roundAmount(totalDebit),
        totalKredit: roundAmount(totalKredit),
        createdBy: userId,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Create snapshot error:', error);
    return { success: false, error: 'Gagal membuat snapshot' };
  }
}

// ============================================================================
// API Handlers
// ============================================================================

export async function GET(request: NextRequest) {
  return withAuthAppRouter(
    request,
    async () => {
      const query = getQueryParams(request);
      const { periode, tipe } = query;

      if (!periode) {
        return NextResponse.json({ error: 'Periode wajib diisi' }, { status: 400 });
      }

      const where: Record<string, unknown> = { periode };

      if (tipe) {
        where.tipe = tipe;
      }

      const snapshots = await prisma.snapshot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        periode,
        snapshots: snapshots.map((s) => ({
          id: s.id,
          tipe: s.tipe,
          totalDebit: s.totalDebit,
          totalKredit: s.totalKredit,
          createdAt: s.createdAt,
          createdBy: s.createdBy,
        })),
      });
    },
    { requireAdmin: true }
  );
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(
    request,
    async (user: AuthUser) => {
      // Create snapshot (typically called when closing period)

      // Validate request
      const body = await request.json();
      const validation = createSnapshotSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          {
            error: 'Validasi gagal',
            details: validation.error.errors,
          },
          { status: 400 }
        );
      }

      const { periode, tipe } = validation.data;

      // Check if period is closed
      const periodRecord = await prisma.period.findUnique({
        where: { kode: periode },
      });

      if (!periodRecord || periodRecord.status !== 'closed') {
        return NextResponse.json(
          {
            error: `Periode ${periode} belum ditutup. Snapshot hanya bisa dibuat untuk periode yang sudah ditutup.`,
          },
          { status: 422 }
        );
      }

      // Create snapshot
      const result = await createSnapshot(periode, tipe, user.id);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json(
        {
          success: true,
          message: `Snapshot ${tipe} untuk periode ${periode} berhasil dibuat`,
          periode,
          tipe,
        },
        { status: 201 }
      );
    },
    { requireAdmin: true }
  );
}

export async function DELETE(request: NextRequest) {
  return withAuthAppRouter(
    request,
    async (user: AuthUser) => {
      // Reopen period and regenerate snapshot
      // Only owner can reopen closed periods

      if (user.role !== 'owner') {
        return NextResponse.json(
          {
            error: 'Hanya owner yang dapat membuka kembali periode yang ditutup',
          },
          { status: 403 }
        );
      }

      const body = await request.json();
      const validation = reopenSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          {
            error: 'Validasi gagal',
            details: validation.error.errors,
          },
          { status: 400 }
        );
      }

      const { periode, reason } = validation.data;

      // Delete snapshots for this period
      await prisma.snapshot.deleteMany({
        where: { periode },
      });

      // Reopen period
      await prisma.period.update({
        where: { kode: periode },
        data: {
          status: 'open',
          reopenedAt: new Date(),
          reopenedBy: user.id,
        },
      });

      // Create audit trail
      await prisma.auditTrail.create({
        data: {
          action: 'reopen',
          entity: 'period',
          entityId: periode,
          userId: user.id,
          newData: JSON.stringify({ reason }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Periode ${periode} berhasil dibuka kembali. Snapshot telah dihapus.`,
        periode,
      });
    },
    { requireAdmin: true }
  );
}
