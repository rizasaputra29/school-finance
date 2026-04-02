import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody, sendValidationError } from '@/lib/validation';

// Account codes
const BANK_ACCOUNT_CODE = '102'; // Bank
const PIUTANG_ACCOUNT_CODE = '103'; // Piutang Siswa


// Map billing type to revenue account code
function getRevenueAccountCode(jenisBiaya: string): string {
  const mapping: Record<string, string> = {
    'SPP': '405', // Penerimaan Uang SPP
    'Uang Pangkal': '401', // Penerimaan Uang Gedung
    'Uang Gedung': '401', // Penerimaan Uang Gedung
    'Uang Kegiatan': '402', // Penerimaan Uang Kegiatan
    'Uang Seragam': '403', // Penerimaan Uang Seragam
    'Uang ATK': '404', // Penerimaan Uang ATK
    'Pendaftaran': '400', // Penerimaan Dana Pendaftaran
  };
  return mapping[jenisBiaya] || '406'; // Default to Pendapatan Lain-Lain
}

// Validation schema for manual payment
const manualPaymentSchema = z.object({
  billingId: z.string().min(1, 'Tagihan wajib dipilih'),
  jumlahBayar: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return num;
  }).refine(val => val >= 0, 'Jumlah pembayaran harus positif'),
  tanggalBayar: z.string().optional(),
  catatan: z.string().optional(),
});

// Check if billing is overdue based on period (end of month)
function isBillingOverdue(billing: { periodeBulan: string }): boolean {
  if (!billing.periodeBulan) return false;
  
  // Parse the period (format: YYYY-MM)
  const [year, month] = billing.periodeBulan.split('-').map(Number);
  
  // Due date is end of the billing month
  const dueDate = new Date(year, month - 1); // First day of next month
  const now = new Date();
  
  return now > dueDate;
}

// Process payment with double-entry
async function processStudentPayment(
  billingId: string,
  amount: number,
  paymentDate: Date,
  catatan?: string
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Get billing and student details
    const billing = await tx.billing.findUnique({
      where: { id: billingId },
      include: {
        student: true,
      },
    });

    if (!billing) {
      throw new Error('Tagihan tidak ditemukan');
    }

    if (billing.statusBayar === 'Lunas') {
      throw new Error('Tagihan sudah lunas');
    }

    // 2. Determine revenue account based on billing type
    const revenueCode = getRevenueAccountCode(billing.jenisBiaya);

    // 3. Check if overdue
    const overdue = isBillingOverdue(billing);

    // 4. Create cashflow entries based on overdue status
    const cashflowEntries = [];

    if (overdue) {
      // Case: Overdue payment
      // - Piutang Siswa (103) Debit - reduces piutang
      // - Bank (102) Debit - money received
      // - Revenue (XXX) Kredit - recognize revenue
      
      // Entry 1: Reduce Piutang (Debit)
      cashflowEntries.push({
        kodeAkun: PIUTANG_ACCOUNT_CODE,
        debit: amount,
        kredit: 0,
        keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} - Lunasi Piutang`,
      });

      // Entry 2: Bank receives money (Debit)
      cashflowEntries.push({
        kodeAkun: BANK_ACCOUNT_CODE,
        debit: amount,
        kredit: 0,
        keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} - Masuk Bank`,
      });

      // Entry 3: Revenue (Kredit)
      cashflowEntries.push({
        kodeAkun: revenueCode,
        debit: 0,
        kredit: amount,
        keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} - Pendapatan`,
      });
    } else {
      // Case: Normal payment (not overdue)
      // - Bank (102) Debit - money received
      // - Revenue (XXX) Kredit - recognize revenue

      // Entry 1: Bank receives money (Debit)
      cashflowEntries.push({
        kodeAkun: BANK_ACCOUNT_CODE,
        debit: amount,
        kredit: 0,
        keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} - Masuk Bank`,
      });

      // Entry 2: Revenue (Kredit)
      cashflowEntries.push({
        kodeAkun: revenueCode,
        debit: 0,
        kredit: amount,
        keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} - Pendapatan`,
      });
    }

    // 5. Create cashflow records and update account balances
    const createdCashflows = [];

    for (const entry of cashflowEntries) {
      // Get account to determine balance adjustment
      const account = await tx.account.findUnique({
        where: { kodeAkun: entry.kodeAkun },
      });

      if (!account) {
        throw new Error(`Akun dengan kode ${entry.kodeAkun} tidak ditemukan`);
      }

      // Calculate balance adjustment based on account type
      const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);
      let saldoChange = 0;

      if (isDebitNormal) {
        saldoChange = entry.debit - entry.kredit;
      } else {
        saldoChange = entry.kredit - entry.debit;
      }

      // Update account balance
      await tx.account.update({
        where: { kodeAkun: entry.kodeAkun },
        data: {
          saldo: { increment: saldoChange },
        },
      });

      // Create cashflow record
      const cashflow = await tx.cashflow.create({
        data: {
          tanggal: paymentDate,
          keterangan: entry.keterangan,
          kodeAkun: entry.kodeAkun,
          kategori: 'pemasukan',
          debit: entry.debit,
          kredit: entry.kredit,
          referenceId: billingId,
        },
      });

      createdCashflows.push(cashflow);
    }

    // 6. Update billing status to Lunas
    const updatedBilling = await tx.billing.update({
      where: { id: billingId },
      data: {
        statusBayar: 'Lunas',
        tanggalBayar: paymentDate,
        catatan: catatan || null,
        cashflowId: createdCashflows[0]?.id, // Link to first cashflow
      },
    });

    // 7. Update student payment totals
    const studentUpdate = await tx.student.update({
      where: { id: billing.studentId },
      data: {
        totalBayar: { increment: amount },
        statusBayar: 'Lunas', // Will be calculated based on remaining billings
      },
    });

    // Check if student still has unpaid billings
    const remainingBillings = await tx.billing.count({
      where: {
        studentId: billing.studentId,
        statusBayar: 'Belum Lunas',
      },
    });

    if (remainingBillings > 0) {
      await tx.student.update({
        where: { id: billing.studentId },
        data: {
          statusBayar: 'Belum Lunas',
        },
      });
    }

    return {
      billing: updatedBilling,
      cashflows: createdCashflows,
      overdue,
      studentUpdated: studentUpdate,
    };
  });
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const ip = getClientIp(req);
  
  try {
    switch (req.method) {
      case 'GET': {
        // Get list of unpaid billings for payment
        const { studentId, statusBayar = 'Belum Lunas', overdue } = req.query;

        const where: Record<string, unknown> = {};
        
        if (studentId) where.studentId = studentId;
        if (statusBayar) where.statusBayar = statusBayar as string;

        const billings = await prisma.billing.findMany({
          where,
          include: {
            student: {
              select: {
                id: true,
                nis: true,
                nama: true,
                kelas: true,
                totalTagihan: true,
                totalBayar: true,
              },
            },
          },
          orderBy: [
            { statusBayar: 'asc' },
            { createdAt: 'desc' },
          ],
        });

        // Add overdue status to each billing
        const billingsWithOverdue = billings.map(billing => ({
          ...billing,
          isOverdue: isBillingOverdue(billing),
        }));

        // If filter by overdue, apply it
        const filteredBillings = overdue === 'true' 
          ? billingsWithOverdue.filter(b => b.isOverdue)
          : billingsWithOverdue;

        return res.status(200).json({
          data: filteredBillings,
          summary: {
            totalUnpaid: billings.filter(b => b.statusBayar === 'Belum Lunas').length,
            totalOverdue: billingsWithOverdue.filter(b => b.isOverdue).length,
          },
        });
      }

      case 'POST': {
        // Rate limiting for payment operations
        const rateLimitResult = rateLimit(`payment:${ip}`, RATE_LIMITS.create);
        if (!rateLimitResult.success) {
          res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
          return res.status(429).json({ 
            error: formatRateLimitError(rateLimitResult),
            code: 'RATE_LIMIT_EXCEEDED'
          });
        }

        // Validate request body
        const validationErrors = validateBody(req.body, manualPaymentSchema);
        if (validationErrors) {
          return sendValidationError(res, validationErrors);
        }

        const { billingId, jumlahBayar, tanggalBayar, catatan } = req.body as z.infer<typeof manualPaymentSchema>;
        
        // Convert amount to number (handles both string and number from Zod transform)
        const amount = Number(jumlahBayar);
        const paymentDate = tanggalBayar ? new Date(tanggalBayar) : new Date();

        if (isNaN(amount) || amount <= 0) {
          return res.status(400).json({ error: 'Jumlah pembayaran harus lebih dari 0' });
        }

        try {
          const result = await processStudentPayment(
            billingId,
            amount,
            paymentDate,
            catatan
          );

          return res.status(201).json({
            success: true,
            message: result.overdue 
              ? 'Pembayaran berhasil! Tagihan overdue telah dilunasi.'
              : 'Pembayaran berhasil!',
            data: {
              billing: result.billing,
              cashflows: result.cashflows,
              isOverdue: result.overdue,
              student: result.studentUpdated,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return res.status(400).json({ error: message });
        }
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Payment API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });