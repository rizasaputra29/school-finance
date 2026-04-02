import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody, sendValidationError } from '@/lib/validation';
import { invalidateDashboardCache } from '@/lib/cache';

// Mapping jenisPembayaran → account codes
const PAYMENT_TYPE_ACCOUNTS: Record<string, string> = {
  Gaji: '500',       // Biaya Gaji
  Tunjangan: '501',  // Biaya Tunjangan
  Bonus: '523',      // Biaya Bonus
};

const createPayrollSchema = z.object({
  employeeId: z.string().min(1, 'Karyawan wajib dipilih'),
  periode: z.string().min(1, 'Periode wajib diisi').regex(/^\d{4}-\d{2}$/, 'Format periode: YYYY-MM'),
  jenisPembayaran: z.enum(['Gaji', 'Tunjangan', 'Bonus'], { required_error: 'Jenis pembayaran wajib dipilih' }),
  jumlah: z.union([z.number(), z.string()]).transform((v) => typeof v === 'string' ? parseFloat(v) : v),
  keterangan: z.string().optional(),
  source: z.enum(['kas', 'bank']).default('kas'),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const ip = getClientIp(req);

  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', employeeId, periode, status } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const take = parseInt(limit as string);

        const where: Record<string, unknown> = {};
        if (employeeId) where.employeeId = employeeId;
        if (periode) where.periode = periode;
        if (status) where.status = status;

        const [payrolls, total, summaryAgg] = await Promise.all([
          prisma.payroll.findMany({
            where,
            orderBy: [{ periode: 'desc' }, { createdAt: 'desc' }],
            skip,
            take,
            include: {
              employee: { select: { nip: true, nama: true, jabatan: true } },
            },
          }),
          prisma.payroll.count({ where }),
          prisma.payroll.aggregate({
            where,
            _sum: { jumlah: true },
          }),
        ]);

        // Count by status
        const [belumBayar, lunas] = await Promise.all([
          prisma.payroll.count({ where: { ...where, status: 'Belum Bayar' } }),
          prisma.payroll.count({ where: { ...where, status: 'Lunas' } }),
        ]);

        return res.status(200).json({
          data: payrolls,
          summary: {
            totalJumlah: summaryAgg._sum.jumlah || 0,
            belumBayar,
            lunas,
          },
          pagination: {
            page: parseInt(page as string),
            limit: take,
            total,
            totalPages: Math.ceil(total / take),
          },
        });
      }

      case 'POST': {
        const rateLimitResult = rateLimit(`create-payroll:${ip}`, RATE_LIMITS.create);
        if (!rateLimitResult.success) {
          res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
          return res.status(429).json({
            error: formatRateLimitError(rateLimitResult),
            code: 'RATE_LIMIT_EXCEEDED',
          });
        }

        const validationErrors = validateBody(req.body, createPayrollSchema);
        if (validationErrors) return sendValidationError(res, validationErrors);

        const data = req.body as z.infer<typeof createPayrollSchema>;
        const jumlah = typeof data.jumlah === 'string' ? parseFloat(data.jumlah) : Number(data.jumlah);

        if (jumlah <= 0) {
          return res.status(400).json({ error: 'Jumlah harus lebih dari 0' });
        }

        // Check if employee exists
        const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });
        if (!employee) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });

        // Check period is open
        const period = await prisma.period.findUnique({ where: { kode: data.periode } });
        if (period && period.status === 'closed') {
          return res.status(400).json({ error: `Periode ${data.periode} sudah ditutup` });
        }

        // Prevent duplicate payment for same employee+period+type
        const existingPayroll = await prisma.payroll.findUnique({
          where: {
            employeeId_periode_jenisPembayaran: {
              employeeId: data.employeeId,
              periode: data.periode,
              jenisPembayaran: data.jenisPembayaran,
            },
          },
        });
        if (existingPayroll) {
          return res.status(400).json({
            error: `${data.jenisPembayaran} untuk ${employee.nama} periode ${data.periode} sudah ada`,
          });
        }

        // Determine accounts
        const expenseAccountCode = PAYMENT_TYPE_ACCOUNTS[data.jenisPembayaran];
        if (!expenseAccountCode) {
          return res.status(400).json({ error: 'Jenis pembayaran tidak valid' });
        }
        const cashAccountCode = data.source === 'bank' ? '102' : '101'; // Kas or Bank

        // Validate accounts exist
        const [expenseAccount, cashAccount] = await Promise.all([
          prisma.account.findUnique({ where: { kodeAkun: expenseAccountCode } }),
          prisma.account.findUnique({ where: { kodeAkun: cashAccountCode } }),
        ]);
        if (!expenseAccount) return res.status(400).json({ error: `Akun beban ${expenseAccountCode} tidak ditemukan` });
        if (!cashAccount) return res.status(400).json({ error: `Akun kas/bank ${cashAccountCode} tidak ditemukan` });

        // Execute atomic transaction: create journal + payroll + update accounts
        const result = await prisma.$transaction(async (tx) => {
          // 1. Create JournalEntry
          const journalEntry = await tx.journalEntry.create({
            data: {
              tanggal: new Date(),
              keterangan: `${data.jenisPembayaran} - ${employee.nama} (${employee.nip}) - ${data.periode}`,
              reference: `payroll-${data.employeeId}-${data.periode}-${data.jenisPembayaran}`,
              status: 'posted',
              postedAt: new Date(),
              postedBy: req.user?.email || 'system',
            },
          });

          // 2. Create JournalEntryLines (Debit Expense, Credit Cash)
          await tx.journalEntryLine.createMany({
            data: [
              {
                journalEntryId: journalEntry.id,
                kodeAkun: expenseAccountCode,
                debit: jumlah,
                kredit: 0,
              },
              {
                journalEntryId: journalEntry.id,
                kodeAkun: cashAccountCode,
                debit: 0,
                kredit: jumlah,
              },
            ],
          });

          // 3. Update account balances
          // Expense account (debit normal): increase
          await tx.account.update({
            where: { kodeAkun: expenseAccountCode },
            data: { saldo: { increment: jumlah } },
          });
          // Cash/Bank account (debit normal): decrease
          await tx.account.update({
            where: { kodeAkun: cashAccountCode },
            data: { saldo: { decrement: jumlah } },
          });

          // 4. Create Cashflow record for traceability
          await tx.cashflow.create({
            data: {
              tanggal: new Date(),
              keterangan: `${data.jenisPembayaran} - ${employee.nama}`,
              kodeAkun: expenseAccountCode,
              kategori: 'pengeluaran',
              debit: 0,
              kredit: jumlah,
              source: data.source,
              periode: data.periode,
            } as never,
          });

          // 5. Create Payroll record
          const payroll = await tx.payroll.create({
            data: {
              employeeId: data.employeeId,
              periode: data.periode,
              jenisPembayaran: data.jenisPembayaran,
              jumlah,
              keterangan: data.keterangan || null,
              tanggalBayar: new Date(),
              status: 'Lunas',
              journalEntryId: journalEntry.id,
            },
            include: {
              employee: { select: { nip: true, nama: true, jabatan: true } },
            },
          });

          // 6. Create AuditTrail
          await tx.auditTrail.create({
            data: {
              action: 'create',
              entity: 'payroll',
              entityId: payroll.id,
              newData: {
                employeeId: data.employeeId,
                periode: data.periode,
                jenisPembayaran: data.jenisPembayaran,
                jumlah,
                journalEntryId: journalEntry.id,
              },
              userId: req.user?.email || null,
            },
          });

          return payroll;
        });

        // Invalidate cache
        invalidateDashboardCache();

        return res.status(201).json({
          ...result,
          message: `${data.jenisPembayaran} untuk ${employee.nama} berhasil dibayarkan`,
        });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Payroll API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler, { requireAdmin: true });
