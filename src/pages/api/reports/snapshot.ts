/**
 * Report Snapshot API - Data freeze and snapshot functionality
 * Task 37: Data Freeze & Snapshot
 * Snapshot reports at closing - cannot change, only regenerate via reopen
 */

import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
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
  const accountsWithBalances = accounts.map(a => ({
    ...a,
    saldo: roundAmount(a.saldo),
  }));

  const totalAset = accountsWithBalances
    .filter(a => a.tipeAkun === 'Asset')
    .reduce((sum, a) => sum + a.saldo, 0);

  const totalKewajiban = accountsWithBalances
    .filter(a => a.tipeAkun === 'Liability')
    .reduce((sum, a) => sum + a.saldo, 0);

  const totalEkuitas = accountsWithBalances
    .filter(a => a.tipeAkun === 'Equity')
    .reduce((sum, a) => sum + a.saldo, 0);

  const totalPendapatan = accountsWithBalances
    .filter(a => a.tipeAkun === 'Revenue')
    .reduce((sum, a) => sum + a.saldo, 0);

  const totalBeban = accountsWithBalances
    .filter(a => a.tipeAkun === 'Expense')
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
        const cashAccounts = balances.accounts.filter(a => 
          a.kodeAkun.startsWith('111') || a.kodeAkun === '102'
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

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const userId = req.user?.id;
  const userRole = req.user?.role;

  try {
    switch (req.method) {
      case 'GET': {
        // Get snapshots for a period
        const { periode, tipe } = req.query;

        if (!periode || typeof periode !== 'string') {
          return res.status(400).json({ error: 'Periode wajib diisi' });
        }

        const where: Record<string, unknown> = { periode };

        if (tipe && typeof tipe === 'string') {
          where.tipe = tipe;
        }

        const snapshots = await prisma.snapshot.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });

        return res.status(200).json({
          periode,
          snapshots: snapshots.map(s => ({
            id: s.id,
            tipe: s.tipe,
            totalDebit: s.totalDebit,
            totalKredit: s.totalKredit,
            createdAt: s.createdAt,
            createdBy: s.createdBy,
          })),
        });
      }

      case 'POST': {
        // Create snapshot (typically called when closing period)
        
        // Validate request
        const validation = createSnapshotSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: 'Validasi gagal',
            details: validation.error.errors,
          });
        }

        const { periode, tipe } = validation.data;

        // Check if period is closed
        const periodRecord = await prisma.period.findUnique({
          where: { kode: periode },
        });

        if (!periodRecord || periodRecord.status !== 'closed') {
          return res.status(422).json({
            error: `Periode ${periode} belum ditutup. Snapshot hanya bisa dibuat untuk periode yang sudah ditutup.`,
          });
        }

        // Create snapshot
        const result = await createSnapshot(periode, tipe, userId);

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }

        return res.status(201).json({
          success: true,
          message: `Snapshot ${tipe} untuk periode ${periode} berhasil dibuat`,
          periode,
          tipe,
        });
      }

      case 'DELETE': {
        // Reopen period and regenerate snapshot
        // Only owner can reopen closed periods
        
        if (userRole !== 'owner') {
          return res.status(403).json({
            error: 'Hanya owner yang dapat membuka kembali periode yang ditutup',
          });
        }

        const validation = reopenSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: 'Validasi gagal',
            details: validation.error.errors,
          });
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
            reopenedBy: userId,
          },
        });

        // Create audit trail
        await prisma.auditTrail.create({
          data: {
            action: 'reopen',
            entity: 'period',
            entityId: periode,
            userId,
            newData: JSON.stringify({ reason }),
          },
        });

        return res.status(200).json({
          success: true,
          message: `Periode ${periode} berhasil dibuka kembali. Snapshot telah dihapus.`,
          periode,
        });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Snapshot API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });