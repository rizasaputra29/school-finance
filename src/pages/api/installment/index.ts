import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody, sendValidationError } from '@/lib/validation';

// Account codes for double-entry
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

// Validation schema for creating installment plan
const createInstallmentPlanSchema = z.object({
  studentId: z.string().min(1, 'Siswa wajib dipilih'),
  billingId: z.string().optional().nullable(),
  jumlahTotal: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return num;
  }).refine(val => val > 0, 'Jumlah total harus lebih dari 0'),
  tenor: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? parseInt(val) : val;
    return num;
  }).refine(val => val > 0 && val <= 12, 'Tenor harus antara 1-12 bulan'),
  tanggalMulai: z.string().min(1, 'Tanggal mulai wajib diisi'),
  customNominals: z.array(z.object({
    cicilanKe: z.number(),
    jumlah: z.number(),
    tanggalJatuhTempo: z.string(),
  })).optional(),
});

// Validation schema for updating installment
const updateInstallmentSchema = z.object({
  jumlah: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return num;
  }).refine(val => val > 0, 'Jumlah cicilan harus lebih dari 0').optional(),
  tanggalJatuhTempo: z.string().optional(),
  status: z.enum(['Belum Bayar', 'Bayar', 'Jatuh Tempo']).optional(),
});

// Validation schema for payment against installment
const payInstallmentSchema = z.object({
  installmentId: z.string().min(1, 'Cicilan wajib dipilih'),
  jumlahBayar: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return num;
  }).refine(val => val >= 0, 'Jumlah pembayaran harus positif'),
  tanggalBayar: z.string().optional(),
  catatan: z.string().optional(),
});

// Check if installment is overdue
function isInstallmentOverdue(installment: { tanggalJatuhTempo: Date; status: string }): boolean {
  if (installment.status === 'Bayar') return false;
  
  const now = new Date();
  const dueDate = new Date(installment.tanggalJatuhTempo);
  
  return now > dueDate;
}

// Calculate due date by adding months
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Generate installment plan (pure function)
function generateInstallmentPlan(params: {
  jumlahTotal: number;
  tenor: number;
  tanggalMulai: Date;
  customNominals?: Array<{ cicilanKe: number; jumlah: number; tanggalJatuhTempo: string }>;
}): Array<{ cicilanKe: number; jumlah: number; tanggalJatuhTempo: Date }> {
  const { jumlahTotal, tenor, tanggalMulai, customNominals } = params;
  
  // Use custom nominals if provided
  if (customNominals && customNominals.length > 0) {
    return customNominals.map(cn => ({
      cicilanKe: cn.cicilanKe,
      jumlah: cn.jumlah,
      tanggalJatuhTempo: new Date(cn.tanggalJatuhTempo),
    }));
  }
  
  // Calculate equal installments
  const jumlahPerCicilan = Math.round((jumlahTotal / tenor) * 100) / 100;
  
  return Array.from({ length: tenor }, (_, index) => {
    const cicilanKe = index + 1;
    return {
      cicilanKe,
      jumlah: jumlahPerCicilan,
      tanggalJatuhTempo: addMonths(tanggalMulai, cicilanKe - 1),
    };
  });
}

// Process payment for a specific installment
async function processInstallmentPayment(
  installmentId: string,
  amount: number,
  paymentDate: Date
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Get installment with student and billing details
    const installment = await tx.installment.findUnique({
      where: { id: installmentId },
      include: {
        student: true,
        billing: true,
      },
    });

    if (!installment) {
      throw new Error('Cicilan tidak ditemukan');
    }

    if (installment.status === 'Bayar') {
      throw new Error('Cicilan sudah lunas');
    }

    const overdue = isInstallmentOverdue(installment);

    // 2. Determine revenue account based on billing type
    const revenueCode = installment.billing
      ? getRevenueAccountCode(installment.billing.jenisBiaya)
      : '406'; // Default to Pendapatan Lain-Lain

    // 3. Create cashflow entries based on overdue status
    const cashflowEntries = [];

    if (overdue) {
      // Case: Overdue payment - reduce piutang first
      cashflowEntries.push({
        kodeAkun: PIUTANG_ACCOUNT_CODE,
        debit: amount,
        kredit: 0,
        keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Lunasi Piutang`,
      });

      cashflowEntries.push({
        kodeAkun: BANK_ACCOUNT_CODE,
        debit: amount,
        kredit: 0,
        keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Masuk Bank`,
      });

      cashflowEntries.push({
        kodeAkun: revenueCode,
        debit: 0,
        kredit: amount,
        keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Pendapatan`,
      });
    } else {
      // Case: Normal payment (not overdue)
      cashflowEntries.push({
        kodeAkun: BANK_ACCOUNT_CODE,
        debit: amount,
        kredit: 0,
        keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Masuk Bank`,
      });

      cashflowEntries.push({
        kodeAkun: revenueCode,
        debit: 0,
        kredit: amount,
        keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Pendapatan`,
      });
    }

    // 4. Create cashflow records and update account balances
    const createdCashflows = [];

    for (const entry of cashflowEntries) {
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
          referenceId: installmentId,
        },
      });

      createdCashflows.push(cashflow);
    }

    // 5. Update installment status to Bayar
    const updatedInstallment = await tx.installment.update({
      where: { id: installmentId },
      data: {
        status: 'Bayar',
        tanggalBayar: paymentDate,
      },
    });

    // 6. Update student payment totals
    const studentUpdate = await tx.student.update({
      where: { id: installment.studentId },
      data: {
        totalBayar: { increment: amount },
      },
    });

    // 7. Check and update student overall payment status
    const remainingInstallments = await tx.installment.count({
      where: {
        studentId: installment.studentId,
        status: { not: 'Bayar' },
      },
    });

    if (remainingInstallments === 0) {
      await tx.student.update({
        where: { id: installment.studentId },
        data: {
          statusBayar: 'Lunas',
        },
      });
    } else {
      await tx.student.update({
        where: { id: installment.studentId },
        data: {
          statusBayar: 'Belum Lunas',
        },
      });
    }

    // 8. If there's a linked billing, check if all installments are paid
    if (installment.billingId) {
      // Use single query with groupBy to get both counts
      const statusCounts = await tx.installment.groupBy({
        by: ['status'],
        where: { billingId: installment.billingId },
        _count: { _all: true },
      });

      let paidCount = 0;
      let totalCount = 0;
      for (const group of statusCounts) {
        totalCount += group._count._all;
        if (group.status === 'Bayar') {
          paidCount = group._count._all;
        }
      }

      if (paidCount === totalCount && totalCount > 0) {
        await tx.billing.update({
          where: { id: installment.billingId },
          data: {
            statusBayar: 'Lunas',
            tanggalBayar: paymentDate,
          },
        });
      }
    }

    return {
      installment: updatedInstallment,
      cashflows: createdCashflows,
      overdue,
      studentUpdated: studentUpdate,
    };
  });
}

// Update overdue status for all installments
interface InstallmentWithStatus {
  tanggalJatuhTempo: Date;
  status: string;
  isOverdue?: boolean;
}

function updateOverdueStatus(installments: InstallmentWithStatus[]): InstallmentWithStatus[] {
  return installments.map((inst): InstallmentWithStatus => ({
    ...inst,
    isOverdue: isInstallmentOverdue({ tanggalJatuhTempo: inst.tanggalJatuhTempo, status: inst.status }),
  }));
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const ip = getClientIp(req);
  
  try {
    switch (req.method) {
      case 'GET': {
        // Get list of installments
        const {
          studentId,
          billingId,
          status,
          overdue,
        } = req.query;

        const where: Record<string, unknown> = {};
        
        if (studentId) where.studentId = studentId;
        if (billingId) where.billingId = billingId;
        if (status) where.status = status as string;

        const installments = await prisma.installment.findMany({
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
            billing: {
              select: {
                id: true,
                jenisBiaya: true,
                periodeBulan: true,
                jumlah: true,
              },
            },
          },
          orderBy: [
            { studentId: 'asc' },
            { cicilanKe: 'asc' },
          ],
        });

        // Add overdue status to each installment
        const installmentsWithOverdue = updateOverdueStatus(installments);

        // Filter by overdue if requested
        const filteredInstallments = overdue === 'true'
          ? installmentsWithOverdue.filter(inst => inst.isOverdue)
          : installmentsWithOverdue;

        // Calculate summary
        const summary = {
          total: installments.length,
          belumBayar: installments.filter((i: { status: string }) => i.status === 'Belum Bayar').length,
          sudahBayar: installments.filter((i: { status: string }) => i.status === 'Bayar').length,
          JatuhTempo: installmentsWithOverdue.filter((i: InstallmentWithStatus) => i.isOverdue).length,
        };

        return res.status(200).json({
          data: filteredInstallments,
          summary,
        });
      }

      case 'POST': {
        // Rate limiting for installment creation
        const rateLimitResult = rateLimit(`installment:${ip}`, RATE_LIMITS.create);
        if (!rateLimitResult.success) {
          res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
          return res.status(429).json({ 
            error: formatRateLimitError(rateLimitResult),
            code: 'RATE_LIMIT_EXCEEDED'
          });
        }

        // Validate request body
        const validationErrors = validateBody(req.body, createInstallmentPlanSchema);
        if (validationErrors) {
          return sendValidationError(res, validationErrors);
        }

        const { 
          studentId, 
          billingId, 
          jumlahTotal, 
          tenor, 
          tanggalMulai,
          customNominals,
        } = req.body as z.infer<typeof createInstallmentPlanSchema>;

        // Validate student exists
        const student = await prisma.student.findUnique({
          where: { id: studentId },
        });

        if (!student) {
          return res.status(400).json({ error: 'Siswa tidak ditemukan' });
        }

        // Validate billing if provided
        if (billingId) {
          const billing = await prisma.billing.findUnique({
            where: { id: billingId },
          });

          if (!billing) {
            return res.status(400).json({ error: 'Tagihan tidak ditemukan' });
          }
        }

        // Generate installment plan
        const startDate = new Date(tanggalMulai);
        const installmentData = generateInstallmentPlan({
          jumlahTotal,
          tenor,
          tanggalMulai: startDate,
          customNominals,
        });

        // Create installments in transaction
        const createdInstallments = await prisma.$transaction(async (tx) => {
          // Delete existing installments for this billing (if any)
          if (billingId) {
            await tx.installment.deleteMany({
              where: { billingId },
            });
          }

          // Create new installments
          return tx.installment.createManyAndReturn({
            data: installmentData.map(inst => ({
              studentId,
              billingId: billingId || null,
              cicilanKe: inst.cicilanKe,
              jumlah: inst.jumlah,
              tanggalJatuhTempo: inst.tanggalJatuhTempo,
              status: 'Belum Bayar',
            })),
          });
        });

        // Update student total tagihan if needed
        if (billingId) {
          await prisma.student.update({
            where: { id: studentId },
            data: {
              totalTagihan: { increment: jumlahTotal },
            },
          });
        }

        return res.status(201).json({
          success: true,
          message: `Rencanan cicilan ${createdInstallments.length}x berhasil dibuat`,
          data: {
            installments: createdInstallments,
            plan: {
              jumlahTotal,
              tenor,
              tanggalMulai,
              cicilanPerBulan: Math.round((jumlahTotal / tenor) * 100) / 100,
            },
          },
        });
      }

      case 'PUT': {
        // Update single installment (flexible nominal, due date)
        const validationErrors = validateBody(req.body, updateInstallmentSchema);
        if (validationErrors) {
          return sendValidationError(res, validationErrors);
        }

        const { installmentId, ...updateData } = req.body as z.infer<typeof updateInstallmentSchema> & { installmentId: string };

        if (!installmentId) {
          return res.status(400).json({ error: 'ID cicilan wajib diisi' });
        }

        const installment = await prisma.installment.findUnique({
          where: { id: installmentId },
        });

        if (!installment) {
          return res.status(400).json({ error: 'Cicilan tidak ditemukan' });
        }

        if (installment.status === 'Bayar') {
          return res.status(400).json({ error: 'Cannot update paid installment' });
        }

        const updatePayload: Record<string, unknown> = {};
        
        if (updateData.jumlah !== undefined) {
          updatePayload.jumlah = updateData.jumlah;
        }
        
        if (updateData.tanggalJatuhTempo !== undefined) {
          updatePayload.tanggalJatuhTempo = new Date(updateData.tanggalJatuhTempo);
        }
        
        if (updateData.status !== undefined) {
          updatePayload.status = updateData.status;
        }

        const updatedInstallment = await prisma.installment.update({
          where: { id: installmentId },
          data: updatePayload,
        });

        return res.status(200).json({
          success: true,
          message: 'Cicilan berhasil diperbarui',
          data: updatedInstallment,
        });
      }

      case 'PATCH': {
        // Payment against installment
        const rateLimitResult = rateLimit(`installment-payment:${ip}`, RATE_LIMITS.create);
        if (!rateLimitResult.success) {
          res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
          return res.status(429).json({ 
            error: formatRateLimitError(rateLimitResult),
            code: 'RATE_LIMIT_EXCEEDED'
          });
        }

        const paymentValidationErrors = validateBody(req.body, payInstallmentSchema);
        if (paymentValidationErrors) {
          return sendValidationError(res, paymentValidationErrors);
        }

        const { installmentId, jumlahBayar, tanggalBayar } = req.body as z.infer<typeof payInstallmentSchema>;
        
        const amount = Number(jumlahBayar);
        const paymentDate = tanggalBayar ? new Date(tanggalBayar) : new Date();

        if (isNaN(amount) || amount <= 0) {
          return res.status(400).json({ error: 'Jumlah pembayaran harus lebih dari 0' });
        }

        try {
          const result = await processInstallmentPayment(
            installmentId,
            amount,
            paymentDate
          );

          return res.status(200).json({
            success: true,
            message: result.overdue 
              ? 'Pembayaran berhasil! Cicilan overdue telah dilunasi.'
              : 'Pembayaran cicilan berhasil!',
            data: {
              installment: result.installment,
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
    console.error('Installment API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
