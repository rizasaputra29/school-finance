/**
 * Journal Posting System API
 * Handles transaction posting: draft -> approved -> posted
 * Only POSTED transactions enter ledger and reports
 */

import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { 
  validateTransaction, 
  formatPeriode,
  roundAmount,
  isAmountEqual,
  type TransactionData,
  type TransactionEntry,
  type PeriodInfo
} from '@/lib/accounting/validation';
import { invalidateReportsCache } from '@/lib/cache';

// ============================================================================
// Validation Schemas
// ============================================================================

const createJournalSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  keterangan: z.string().min(1, 'Keterangan wajib diisi').max(500, 'Keterangan maksimal 500 karakter'),
  entries: z.array(z.object({
    kodeAkun: z.string().min(1, 'Kode akun wajib diisi'),
    debit: z.number().min(0, 'Debit tidak boleh negatif').default(0),
    kredit: z.number().min(0, 'Kredit tidak boleh negatif').default(0),
    keterangan: z.string().optional(),
  })).min(2, 'Minimal harus ada 2 entri (debit dan kredit)'),
  allowBackdated: z.boolean().optional().default(false),
  overrideClosedPeriod: z.boolean().optional().default(false), // Owner override
  reason: z.string().optional(), // Reason for backdated/adjusting entry
});


const approveSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

const postSchema = z.object({
  forcePost: z.boolean().optional().default(false),
});

// ============================================================================
// Status Transition Functions
// ============================================================================

/**
 * Valid status transitions
 */
function isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
  const transitions: Record<string, string[]> = {
    draft: ['approved', 'rejected'],
    approved: ['posted', 'draft'], // Can go back to draft
    posted: ['draft'], // Can reopen
  };
  return transitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * Calculate balance change for an account
 */
function calculateBalanceChange(
  accountType: string,
  debit: number,
  kredit: number
): number {
  const isDebitNormal = ['Asset', 'Expense'].includes(accountType);
  return isDebitNormal ? debit - kredit : kredit - debit;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current period info
 */
async function getCurrentPeriod(): Promise<PeriodInfo | null> {
  const now = new Date();
  const periode = formatPeriode(now);
  
  const period = await prisma.period.findUnique({
    where: { kode: periode },
  });
  
  if (!period) {
    // If no period exists, create a default open period
    const tahun = now.getFullYear();
    const bulan = now.getMonth() + 1;
    const tanggalMulai = new Date(tahun, bulan - 1, 1);
    const tanggalAkhir = new Date(tahun, bulan, 0);
    
    return {
      kode: periode,
      status: 'open',
      tahun,
      bulan,
      tanggalMulai: tanggalMulai.toISOString(),
      tanggalAkhir: tanggalAkhir.toISOString(),
    };
  }
  
  return {
    kode: period.kode,
    status: period.status as 'open' | 'closed' | 'archived',
    tahun: period.tahun,
    bulan: period.bulan,
    tanggalMulai: period.tanggalMulai.toISOString(),
    tanggalAkhir: period.tanggalAkhir.toISOString(),
  };
}

/**
 * Get account types map
 */
async function getAccountTypesMap(): Promise<Map<string, string>> {
  const accounts = await prisma.account.findMany({
    select: { kodeAkun: true, tipeAkun: true },
  });
  
  return new Map(accounts.map(a => [a.kodeAkun, a.tipeAkun]));
}

/**
 * Generate journal number: JNL-YYYY-XXXX
 */
async function generateJournalNumber(): Promise<string> {
  const tahun = new Date().getFullYear();
  const prefix = `JNL-${tahun}-`;
  
  // Get latest journal for this year
  const latest = await prisma.journalEntry.findFirst({
    where: {
      reference: { startsWith: prefix },
    },
    orderBy: { reference: 'desc' },
  });
  
  let sequence = 1;
  if (latest && latest.reference) {
    const lastSeq = parseInt(latest.reference.split('-')[2] || '0', 10);
    sequence = lastSeq + 1;
  }
  
  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create audit trail
 */
async function logAudit(
  action: string,
  entity: string,
  entityId: string,
  userId: string | undefined,
  oldData?: unknown,
  newData?: unknown
): Promise<void> {
  try {
    await prisma.auditTrail.create({
      data: {
        action,
        entity,
        entityId,
        oldData: oldData ? JSON.stringify(oldData) : undefined,
        newData: newData ? JSON.stringify(newData) : undefined,
        userId,
      },
    });
  } catch (error) {
    console.error('Failed to create audit trail:', error);
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
  
  try {
    switch (req.method) {
      case 'GET': {
        // Get journal entries with filters
        const { 
          page = '1', 
          limit = '20', 
          status, 
          startDate, 
          endDate, 
          search,
          isBackdated,
        } = req.query;
        
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        
        const where: Record<string, unknown> = {};
        
        if (status) {
          where.status = status;
        }
        
        if (isBackdated !== undefined) {
          where.isBackdated = isBackdated === 'true';
        }
        
        if (startDate && endDate) {
          where.tanggal = {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          };
        }
        
        if (search) {
          where.keterangan = { contains: search as string, mode: 'insensitive' };
        }
        
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
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit as string),
          }),
          prisma.journalEntry.count({ where }),
        ]);
        
        // Calculate totals
        const totalDebit = journals.reduce((sum, j) => 
          sum + j.entries.reduce((s, e) => s + e.debit, 0), 0
        );
        const totalKredit = journals.reduce((sum, j) => 
          sum + j.entries.reduce((s, e) => s + e.kredit, 0), 0
        );
        
        return res.status(200).json({
          data: journals,
          summary: {
            totalDebit: roundAmount(totalDebit),
            totalKredit: roundAmount(totalKredit),
            count: journals.length,
          },
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            totalPages: Math.ceil(total / parseInt(limit as string)),
          },
        });
      }
      
      case 'POST': {
        // Create new journal entry (draft)
        const validation = createJournalSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: 'Validasi gagal',
            details: validation.error.errors,
          });
        }
        
        const { tanggal, keterangan, entries, allowBackdated, overrideClosedPeriod, reason } = validation.data;
        
        // Security: Check owner role for closed period override
        const userRole = req.user?.role;
        const isOwner = userRole === 'owner';
        
        // If override requested but user is not owner → reject
        if (overrideClosedPeriod && !isOwner) {
          return res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: 'Hanya owner yang dapat meng_override periode yang sudah ditutup',
              details: [{
                field: 'overrideClosedPeriod',
                message: 'Anda tidak memiliki otorisasi untuk input transaksi di periode yang sudah ditutup',
                code: 'OWNER_REQUIRED',
              }],
            },
          });
        }
        
        // Get current period
        const currentPeriod = await getCurrentPeriod();
        
        // Get the period for the transaction date
        const transactionDate = new Date(tanggal);
        const transactionPeriode = formatPeriode(transactionDate);
        
        // Check if the transaction date is for a different period
        let targetPeriod = currentPeriod;
        let isBackdatedEntry = false;
        let originalPeriod: string | null = null;
        
        if (currentPeriod && transactionPeriode !== currentPeriod.kode) {
          // Transaction is for a different period - check its status
          const periodRecord = await prisma.period.findUnique({
            where: { kode: transactionPeriode },
          });
          
          if (periodRecord) {
            // Period exists - check if it's closed
            if (periodRecord.status === 'closed' && !overrideClosedPeriod) {
              return res.status(422).json({
                error: {
                  code: 'PERIOD_CLOSED',
                  message: `Periode ${transactionPeriode} sudah ditutup. Transaksi backdated tidak diperbolehkan tanpa otorisasi.`,
                  details: [{
                    field: 'tanggal',
                    message: `Tanggal ${tanggal} berada di periode ${transactionPeriode} yang sudah ditutup. Hubungi administrator untuk membuka kembali periode.`,
                    code: 'PERIOD_CLOSED',
                  }],
                },
              });
            }
            
            targetPeriod = {
              kode: periodRecord.kode,
              status: periodRecord.status as 'open' | 'closed' | 'archived',
              tahun: periodRecord.tahun,
              bulan: periodRecord.bulan,
              tanggalMulai: periodRecord.tanggalMulai.toISOString(),
              tanggalAkhir: periodRecord.tanggalAkhir.toISOString(),
            };
            isBackdatedEntry = true;
            originalPeriod = transactionPeriode;
          } else {
            // Period doesn't exist - treat as backdated to non-existent period
            isBackdatedEntry = true;
            originalPeriod = transactionPeriode;
          }
        } else if (currentPeriod && transactionDate < new Date(currentPeriod.tanggalMulai || '')) {
          // Transaction date is before current period start
          isBackdatedEntry = true;
          originalPeriod = transactionPeriode;
        }
        
        // Get account types
        const accountTypes = await getAccountTypesMap();
        
        // Determine adjustment type
        const adjustmentType = isBackdatedEntry ? (reason ? 'adjusting' : 'regular') : 'regular';
        
        // Validate transaction
        const transactionData: Partial<TransactionData> = {
          tanggal,
          keterangan,
          entries: entries as TransactionEntry[],
        };
        
        const validationResult = validateTransaction(transactionData, {
          accountTypes,
          period: targetPeriod,
          allowBackdated,
        });
        
        if (!validationResult.isValid) {
          return res.status(422).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Transaksi tidak valid',
              details: validationResult.errors,
            },
          });
        }
        
        // Task 33: Auto Balance Validation - Check Debit = Kredit BEFORE saving
        const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
        const totalKredit = entries.reduce((sum, e) => sum + (e.kredit || 0), 0);
        
        if (!isAmountEqual(totalDebit, totalKredit)) {
          return res.status(422).json({
            error: {
              code: 'IMBALANCED_ENTRY',
              message: `Total Debit (${roundAmount(totalDebit).toLocaleString('id-ID')}) tidak sama dengan Total Kredit (${roundAmount(totalKredit).toLocaleString('id-ID')}). Transaksi tidak bisa disimpan.`,
              details: [{
                field: 'entries',
                message: `Selisih: ${roundAmount(totalDebit - totalKredit).toLocaleString('id-ID')}`,
                code: 'DEBIT_KREDIT_MISMATCH',
              }],
            },
          });
        }
        
        // Generate journal number
        const reference = await generateJournalNumber();
        
        // Create journal entry in transaction
        const result = await prisma.$transaction(async (tx) => {
          // Create journal header with backdated tracking
          const journal = await tx.journalEntry.create({
            data: {
              tanggal: new Date(tanggal),
              keterangan,
              reference,
              status: 'draft',
              version: 1,
              // Backdated entry tracking
              isBackdated: isBackdatedEntry,
              originalPeriod: originalPeriod,
              adjustmentType: adjustmentType,
              backdatedBy: isBackdatedEntry ? userId || undefined : undefined,
              backdatedAt: isBackdatedEntry ? new Date() : undefined,
              reason: reason,
            },
          });
          
          // Add periode to each entry
          const periode = formatPeriode(new Date(tanggal));
          
          // Create journal lines using createMany for better performance
          const journalLineData = entries.map(entry => ({
            journalEntryId: journal.id,
            kodeAkun: entry.kodeAkun,
            debit: roundAmount(entry.debit),
            kredit: roundAmount(entry.kredit),
          }));
          
          await tx.journalEntryLine.createMany({
            data: journalLineData,
          });
          
          // Fetch created lines for return data
          const createdEntries = await tx.journalEntryLine.findMany({
            where: { journalEntryId: journal.id },
          });
          
          // Create cashflow records using createMany for better performance
          const cashflowData: Prisma.CashflowCreateManyInput[] = entries.map(entry => {
            const isBankAccount = 
              entry.kodeAkun.startsWith('111') || 
              entry.kodeAkun === '102';
            
            return {
              tanggal: new Date(tanggal),
              keterangan: entry.keterangan || `${keterangan} - ${entry.kodeAkun}`,
              kodeAkun: entry.kodeAkun,
              kategori: 'journal',
              debit: roundAmount(entry.debit),
              kredit: roundAmount(entry.kredit),
              source: isBankAccount ? 'bank' : 'kas',
              status: 'draft',
              periode,
              version: 1,
            };
          });
          
          await tx.cashflow.createMany({
            data: cashflowData,
          });
          
          // Audit trail
          await logAudit('create', 'journal', journal.id, userId, undefined, {
            reference,
            tanggal,
            keterangan,
            entryCount: entries.length,
          });
          
          return { journal, entries: createdEntries };
        });
        
        // Invalidate cache
        invalidateReportsCache();
        
        return res.status(201).json({
          success: true,
          data: {
            id: result.journal.id,
            reference: result.journal.reference,
            tanggal: result.journal.tanggal,
            keterangan: result.journal.keterangan,
            status: result.journal.status,
            isBackdated: result.journal.isBackdated,
            originalPeriod: result.journal.originalPeriod,
            adjustmentType: result.journal.adjustmentType,
            reason: result.journal.reason,
            entries: result.entries,
          },
          message: result.journal.isBackdated 
            ? 'Jurnal backdated berhasil dibuat (status: draft)' 
            : 'Jurnal berhasil dibuat (status: draft)',
        });
      }

      case 'PUT': {
        // Update journal status (approve/reject/post)
        const { action } = req.body;
        
        // Parse approve/post schemas based on action
        if (action === 'approve' || action === 'reject') {
          const validation = approveSchema.safeParse(req.body);
          if (!validation.success) {
            return res.status(400).json({
              error: 'Validasi gagal',
              details: validation.error.errors,
            });
          }
        } else if (action === 'post') {
          const validation = postSchema.safeParse(req.body);
          if (!validation.success) {
            return res.status(400).json({
              error: 'Validasi gagal',
              details: validation.error.errors,
            });
          }
        } else {
          return res.status(400).json({
            error: 'Action tidak valid. Gunakan: approve, reject, atau post',
          });
        }

        // Get journal ID from query
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
          return res.status(400).json({ error: 'ID jurnal wajib diisi' });
        }

        // Get current journal
        const currentJournal = await prisma.journalEntry.findUnique({
          where: { id },
          include: { entries: true },
        });

        if (!currentJournal) {
          return res.status(404).json({ error: 'Jurnal tidak ditemukan' });
        }

        // Determine new status
        let newStatus: string;
        switch (action) {
          case 'approve':
            newStatus = 'approved';
            break;
          case 'reject':
            newStatus = 'rejected';
            break;
          case 'post':
            newStatus = 'posted';
            break;
          default:
            return res.status(400).json({ error: 'Action tidak valid' });
        }

        // Validate status transition
        if (!isValidStatusTransition(currentJournal.status, newStatus)) {
          return res.status(422).json({
            error: `Tidak dapat mengubah status dari ${currentJournal.status} ke ${newStatus}`,
          });
        }

        // For posting: validate balance (debit = kredit)
        if (action === 'post') {
          const totalDebit = currentJournal.entries.reduce((sum, e) => sum + e.debit, 0);
          const totalKredit = currentJournal.entries.reduce((sum, e) => sum + e.kredit, 0);
          
          if (!isAmountEqual(totalDebit, totalKredit)) {
            return res.status(422).json({
              error: `Total Debit (${totalDebit}) tidak sama dengan Total Kredit (${totalKredit})`,
            });
          }
        }

        // Process status change in transaction
        const result = await prisma.$transaction(async (tx) => {
          // If posting, update account balances
          if (action === 'post') {
            for (const entry of currentJournal.entries) {
              const account = await tx.account.findUnique({
                where: { kodeAkun: entry.kodeAkun },
              });

              if (!account) {
                throw new Error(`Akun dengan kode ${entry.kodeAkun} tidak ditemukan`);
              }

              const saldoChange = calculateBalanceChange(
                account.tipeAkun,
                entry.debit,
                entry.kredit
              );

              await tx.account.update({
                where: { kodeAkun: entry.kodeAkun },
                data: {
                  saldo: { increment: roundAmount(saldoChange) },
                },
              });
            }

            // Update cashflow records to posted status
            await tx.cashflow.updateMany({
              where: {
                referenceId: currentJournal.reference,
                status: 'draft',
              },
              data: {
                status: 'posted',
              },
            });
          }

          // Update journal status
          const journal = await tx.journalEntry.update({
            where: { id },
            data: {
              status: newStatus,
              version: { increment: 1 },
              ...(action === 'post' ? { postedAt: new Date(), postedBy: userId } : {}),
            },
          });

          // Audit trail
          await logAudit(action, 'journal', id, userId, 
            { status: currentJournal.status }, 
            { status: newStatus }
          );

          return journal;
        });

        invalidateReportsCache();

        return res.status(200).json({
          success: true,
          data: {
            id: result.id,
            reference: result.reference,
            status: result.status,
            postedAt: result.postedAt,
          },
          message: `Jurnal berhasil di${action === 'approve' ? 'setuju' : action === 'reject' ? 'tolak' : 'posting'}`,
        });
      }
       
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Journal API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}

// Export with auth
export default withAuth(handler, { requireAdmin: true });