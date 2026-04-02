import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody, sendValidationError } from '@/lib/validation';

type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Debt (Hutang) Management API
 * 
 * Handles:
 * - Creating new debts with configurable tenor
 * - Recording debt payments
 * - Overdue debt detection
 * - Negative value storage for liability tracking
 */

// ==================== Validation Schemas ====================

// Schema for creating a new debt
const createDebtSchema = z.object({
  nama: z.string().min(1, 'Nama hutang wajib diisi').max(200, 'Nama maksimal 200 karakter'),
  kodeAkun: z.string().min(1, 'Kode akun wajib diisi'),
  jumlahAwal: z.union([z.number(), z.string()])
    .transform(val => typeof val === 'string' ? parseFloat(val) : val)
    .pipe(z.number().positive('Jumlah awal harus lebih dari 0')),
  tenor: z.union([z.number(), z.string()])
    .transform(val => typeof val === 'string' ? parseInt(val) : val)
    .pipe(z.number().int().positive('Tenor minimal 1 bulan').min(1).max(360)),
  tanggalMulai: z.string().min(1, 'Tanggal mulai wajib diisi'),
  cicilanPerBulan: z.union([z.number(), z.string()])
    .transform(val => typeof val === 'string' ? parseFloat(val) : val)
    .pipe(z.number().min(0, 'Cicilan per bulan tidak boleh negatif')),
  kreditur: z.string().optional(),
});

// Schema for debt payment
const debtPaymentSchema = z.object({
  debtId: z.string().min(1, 'ID hutang wajib diisi'),
  jumlahPembayaran: z.union([z.number(), z.string()])
    .transform(val => typeof val === 'string' ? parseFloat(val) : val)
    .pipe(z.number().positive('Jumlah pembayaran harus lebih dari 0')),
  kodeAkun: z.string().min(1, 'Kode akun (Kas/Bank) wajib diisi'),
  tanggalPembayaran: z.string().optional(),
  keterangan: z.string().optional(),
});

// ==================== Helper Functions ====================

/**
 * Calculate due date from start date and tenor
 */
function calculateDueDate(tanggalMulai: Date, tenor: number): Date {
  const dueDate = new Date(tanggalMulai);
  dueDate.setMonth(dueDate.getMonth() + tenor);
  return dueDate;
}

/**
 * Check if debt is overdue
 */
function isOverdue(tanggalJatuhTempo: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(tanggalJatuhTempo);
  dueDate.setHours(0, 0, 0, 0);
  return today > dueDate;
}

/**
 * Find cash or bank account for transactions
 */
async function findCashAccount(tx: PrismaTransactionClient): Promise<string | null> {
  const cashAccount = await tx.account.findFirst({
    where: {
      OR: [
        { namaAkun: { contains: 'Kas', mode: 'insensitive' } },
        { namaAkun: { contains: 'Bank', mode: 'insensitive' } },
      ],
      tipeAkun: 'Asset',
    },
  });
  return cashAccount?.kodeAkun || null;
}

/**
 * Process debt creation with double-entry bookkeeping
 * Debit: Kas (asset increase from receiving debt proceeds)
 * Credit: Hutang (liability increase)
 */
async function processDebtCreation(
  tx: PrismaTransactionClient,
  debtData: {
    nama: string;
    kodeAkun: string;
    jumlahAwal: number;
    tanggalMulai: Date;
    tanggalJatuhTempo: Date;
    cicilanPerBulan: number;
    kreditur?: string;
  }
) {
  // Find cash/bank account
  const cashAccount = await findCashAccount(tx);
  if (!cashAccount) {
    throw new Error('Akun Kas/Bank tidak ditemukan');
  }

  // Create the debt record with negative value for liability
  const debt = await tx.debt.create({
    data: {
      nama: debtData.nama,
      kodeAkun: debtData.kodeAkun,
      jumlahAwal: debtData.jumlahAwal,
      jumlahSisa: -Math.abs(debtData.jumlahAwal), // Store as negative (liability)
      tenor: Math.ceil(debtData.jumlahAwal / debtData.cicilanPerBulan),
      tanggalMulai: debtData.tanggalMulai,
      tanggalJatuhTempo: debtData.tanggalJatuhTempo,
      cicilanPerBulan: debtData.cicilanPerBulan,
      status: 'Aktif',
    },
  });

  // Create cashflow entries for double-entry:
  // Kas (Debit) - Receive money from debt
  // Hutang (Kredit) - Record liability
  const isBank = cashAccount.startsWith('111');
  await tx.cashflow.create({
    data: {
      tanggal: debtData.tanggalMulai,
      keterangan: `${debtData.nama} - Penerimaan Pinjaman`,
      kodeAkun: cashAccount,
      kategori: 'hutang',
      debit: debtData.jumlahAwal,
      kredit: 0,
      source: isBank ? 'bank' : 'kas',
    },
  } as never);

  await tx.cashflow.create({
    data: {
      tanggal: debtData.tanggalMulai,
      keterangan: `${debtData.nama} - Pembentukan Hutang`,
      kodeAkun: debtData.kodeAkun,
      kategori: 'hutang',
      debit: 0,
      kredit: debtData.jumlahAwal,
    },
  } as never);

  // Update account balances
  const [cashAccountRecord, liabilityAccount] = await Promise.all([
    tx.account.findUnique({ where: { kodeAkun: cashAccount } }),
    tx.account.findUnique({ where: { kodeAkun: debtData.kodeAkun } }),
  ]);

  if (cashAccountRecord) {
    const isCashDebitNormal = ['Asset', 'Expense'].includes(cashAccountRecord.tipeAkun);
    const cashChange = isCashDebitNormal ? debtData.jumlahAwal : 0;
    await tx.account.update({
      where: { kodeAkun: cashAccount },
      data: { saldo: { increment: cashChange } },
    });
  }

  if (liabilityAccount && liabilityAccount.tipeAkun === 'Liability') {
    // For liabilities, credit increases (positive change)
    await tx.account.update({
      where: { kodeAkun: debtData.kodeAkun },
      data: { saldo: { increment: debtData.jumlahAwal } },
    });
  }

  return debt;
}

/**
 * Process debt payment with double-entry bookkeeping
 * Debit: Hutang (reduce liability)
 * Credit: Kas (reduce asset)
 */
async function processDebtPayment(
  tx: PrismaTransactionClient,
  paymentData: {
    debtId: string;
    jumlahPembayaran: number;
    kodeAkun: string;
    tanggalPembayaran: Date;
    keterangan?: string;
  }
) {
  // Get existing debt
  const existingDebt = await tx.debt.findUnique({
    where: { id: paymentData.debtId },
  });

  if (!existingDebt) {
    throw new Error('Hutang tidak ditemukan');
  }

  // Calculate new remaining balance (stored as negative)
  const newJumlahSisa = existingDebt.jumlahSisa + paymentData.jumlahPembayaran;
  const isPaidOff = newJumlahSisa >= 0;

  // Determine payment amount for cashflow (positive value for display)
  const paymentAmount = Math.min(paymentData.jumlahPembayaran, Math.abs(existingDebt.jumlahSisa));

  // Update debt record
  const updatedDebt = await tx.debt.update({
    where: { id: paymentData.debtId },
    data: {
      jumlahSisa: newJumlahSisa,
      status: isPaidOff ? 'Lunas' : 'Aktif',
    },
  });

  // Create cashflow entries for double-entry:
  // Hutang (Debit) - Reduce liability
  // Kas (Kredit) - Payment made
  await tx.cashflow.create({
    data: {
      tanggal: paymentData.tanggalPembayaran,
      keterangan: paymentData.keterangan || `${existingDebt.nama} - Pembayaran Hutang`,
      kodeAkun: existingDebt.kodeAkun,
      kategori: 'hutang',
      debit: paymentAmount,
      kredit: 0,
    },
  } as never);

  const isBank = paymentData.kodeAkun.startsWith('111');
  await tx.cashflow.create({
    data: {
      tanggal: paymentData.tanggalPembayaran,
      keterangan: paymentData.keterangan || `${existingDebt.nama} - Pembayaran`,
      kodeAkun: paymentData.kodeAkun,
      kategori: 'hutang',
      debit: 0,
      kredit: paymentAmount,
      source: isBank ? 'bank' : 'kas',
    },
  } as never);

  // Update account balances
  const [liabilityAccount, cashAccount] = await Promise.all([
    tx.account.findUnique({ where: { kodeAkun: existingDebt.kodeAkun } }),
    tx.account.findUnique({ where: { kodeAkun: paymentData.kodeAkun } }),
  ]);

  // Reduce liability balance
  if (liabilityAccount && liabilityAccount.tipeAkun === 'Liability') {
    await tx.account.update({
      where: { kodeAkun: existingDebt.kodeAkun },
      data: { saldo: { decrement: paymentAmount } },
    });
  }

  // Reduce cash/bank balance
  if (cashAccount && cashAccount.tipeAkun === 'Asset') {
    await tx.account.update({
      where: { kodeAkun: paymentData.kodeAkun },
      data: { saldo: { decrement: paymentAmount } },
    });
  }

  return updatedDebt;
}

// ==================== API Handler ====================

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const ip = getClientIp(req);

  try {
    switch (req.method) {
      case 'GET': {
        // Get all debts with optional filters
        const { 
          page = '1', 
          limit = '10', 
          status, 
          search 
        } = req.query;

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const where: Record<string, unknown> = {};

        // Filter by status
        if (status) {
          where.status = status;
        }

        // Search by nama or kreditur
        if (search) {
          where.OR = [
            { nama: { contains: search as string, mode: 'insensitive' } },
            { kreditur: { contains: search as string, mode: 'insensitive' } },
          ];
        }

        const [debts, total] = await Promise.all([
          prisma.debt.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit as string),
            include: {
              account: true,
            },
          }),
          prisma.debt.count({ where }),
        ]);

        // Calculate overdue status for each debt
        const debtsWithOverdueStatus = debts.map(debt => ({
          ...debt,
          jumlahSisaDisplay: Math.abs(debt.jumlahSisa), // Positive for display
          isOverdue: debt.status === 'Aktif' && isOverdue(debt.tanggalJatuhTempo),
        }));

        // Calculate summary
        const summary = await prisma.debt.aggregate({
          where: { status: 'Aktif' },
          _sum: {
            jumlahAwal: true,
            jumlahSisa: true,
          },
        });

        return res.status(200).json({
          data: debtsWithOverdueStatus,
          summary: {
            totalHutangAwal: summary._sum.jumlahAwal || 0,
            totalHutangSisa: Math.abs(summary._sum.jumlahSisa || 0), // Display as positive
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
        // Determine if this is a payment or new debt creation
        const isPayment = req.body.debtId !== undefined;

        if (isPayment) {
          // Handle debt payment
          const rateLimitResult = rateLimit(`debt-payment:${ip}`, RATE_LIMITS.create);
          if (!rateLimitResult.success) {
            res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
            return res.status(429).json({ 
              error: formatRateLimitError(rateLimitResult),
              code: 'RATE_LIMIT_EXCEEDED'
            });
          }

          const validationErrors = validateBody(req.body, debtPaymentSchema);
          if (validationErrors) {
            return sendValidationError(res, validationErrors);
          }

          const { debtId, jumlahPembayaran, kodeAkun, tanggalPembayaran, keterangan } = req.body as z.infer<typeof debtPaymentSchema>;

          try {
            const result = await prisma.$transaction(async (tx) => {
              return processDebtPayment(tx, {
                debtId,
                jumlahPembayaran,
                kodeAkun,
                tanggalPembayaran: tanggalPembayaran ? new Date(tanggalPembayaran) : new Date(),
                keterangan,
              });
            });

            return res.status(201).json({
              success: true,
              data: {
                ...result,
                jumlahSisaDisplay: Math.abs(result.jumlahSisa),
              },
              message: result.status === 'Lunas' 
                ? 'Hutang telah lunas' 
                : 'Pembayaran hutang berhasil',
            });
          } catch (error) {
            console.error('Debt payment error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            return res.status(400).json({ error: message });
          }
        } else {
          // Handle new debt creation
          const rateLimitResult = rateLimit(`debt-create:${ip}`, RATE_LIMITS.create);
          if (!rateLimitResult.success) {
            res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
            return res.status(429).json({ 
              error: formatRateLimitError(rateLimitResult),
              code: 'RATE_LIMIT_EXCEEDED'
            });
          }

          const validationErrors = validateBody(req.body, createDebtSchema);
          if (validationErrors) {
            return sendValidationError(res, validationErrors);
          }

          const { 
            nama, 
            kodeAkun, 
            jumlahAwal, 
            tenor, 
            tanggalMulai, 
            cicilanPerBulan, 
            kreditur 
          } = req.body as z.infer<typeof createDebtSchema>;

          // Validate account exists and is a liability account
          const account = await prisma.account.findUnique({
            where: { kodeAkun },
          });

          if (!account) {
            return res.status(400).json({ error: `Akun dengan kode ${kodeAkun} tidak ditemukan` });
          }

          if (account.tipeAkun !== 'Liability') {
            return res.status(400).json({ error: 'Akun hutang harus bertipe Liability' });
          }

          const tanggalMulaiDate = new Date(tanggalMulai);
          const tanggalJatuhTempo = calculateDueDate(tanggalMulaiDate, tenor);

          try {
            const result = await prisma.$transaction(async (tx) => {
              return processDebtCreation(tx, {
                nama,
                kodeAkun,
                jumlahAwal,
                tanggalMulai: tanggalMulaiDate,
                tanggalJatuhTempo,
                cicilanPerBulan,
                kreditur,
              });
            });

            return res.status(201).json({
              success: true,
              data: {
                ...result,
                jumlahSisaDisplay: Math.abs(result.jumlahSisa),
              },
              message: 'Hutang berhasil dibuat',
            });
          } catch (error) {
            console.error('Debt creation error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            return res.status(400).json({ error: message });
          }
        }
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Debt API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
