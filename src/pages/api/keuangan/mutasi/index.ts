import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody, sendValidationError } from '@/lib/validation';
import { invalidateDashboardCache } from '@/lib/cache';

const mutasiSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  dari: z.enum(['101', '102'], { required_error: 'Sumber wajib dipilih (101=Kas, 102=Bank)' }),
  ke: z.enum(['101', '102'], { required_error: 'Tujuan wajib dipilih (101=Kas, 102=Bank)' }),
  jumlah: z.union([z.number(), z.string()]).transform((v) => typeof v === 'string' ? parseFloat(v) : v),
  keterangan: z.string().optional(),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const ip = getClientIp(req);

  try {
    switch (req.method) {
      case 'GET': {
        // Get transfer history from journal entries with reference starting with 'mutasi-'
        const { page = '1', limit = '10' } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const take = parseInt(limit as string);

        const where = {
          reference: { startsWith: 'mutasi-' },
        };

        const [entries, total] = await Promise.all([
          prisma.journalEntry.findMany({
            where,
            orderBy: { tanggal: 'desc' },
            skip,
            take,
            include: {
              entries: {
                include: { account: { select: { namaAkun: true, kodeAkun: true } } },
              },
            },
          }),
          prisma.journalEntry.count({ where }),
        ]);

        return res.status(200).json({
          data: entries,
          pagination: {
            page: parseInt(page as string),
            limit: take,
            total,
            totalPages: Math.ceil(total / take),
          },
        });
      }

      case 'POST': {
        const rateLimitResult = rateLimit(`mutasi:${ip}`, RATE_LIMITS.create);
        if (!rateLimitResult.success) {
          res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
          return res.status(429).json({
            error: formatRateLimitError(rateLimitResult),
            code: 'RATE_LIMIT_EXCEEDED',
          });
        }

        const validationErrors = validateBody(req.body, mutasiSchema);
        if (validationErrors) return sendValidationError(res, validationErrors);

        const data = req.body as z.infer<typeof mutasiSchema>;
        const jumlah = typeof data.jumlah === 'string' ? parseFloat(data.jumlah) : Number(data.jumlah);

        // Validate: source and destination must be different
        if (data.dari === data.ke) {
          return res.status(400).json({ error: 'Sumber dan tujuan harus berbeda' });
        }

        if (jumlah <= 0) {
          return res.status(400).json({ error: 'Jumlah harus lebih dari 0' });
        }

        // Check period is open
        const periodeCode = data.tanggal.substring(0, 7); // YYYY-MM
        const period = await prisma.period.findUnique({ where: { kode: periodeCode } });
        if (period && period.status === 'closed') {
          return res.status(400).json({ error: `Periode ${periodeCode} sudah ditutup` });
        }

        // Validate both accounts exist
        const [fromAccount, toAccount] = await Promise.all([
          prisma.account.findUnique({ where: { kodeAkun: data.dari } }),
          prisma.account.findUnique({ where: { kodeAkun: data.ke } }),
        ]);
        if (!fromAccount) return res.status(400).json({ error: `Akun sumber ${data.dari} tidak ditemukan` });
        if (!toAccount) return res.status(400).json({ error: `Akun tujuan ${data.ke} tidak ditemukan` });

        // Check sufficient balance in source
        if (fromAccount.saldo < jumlah) {
          return res.status(400).json({
            error: `Saldo ${fromAccount.namaAkun} tidak mencukupi (Rp ${fromAccount.saldo.toLocaleString('id-ID')})`,
          });
        }

        const fromLabel = data.dari === '101' ? 'Kas' : 'Bank';
        const toLabel = data.ke === '101' ? 'Kas' : 'Bank';
        const keterangan = data.keterangan || `Transfer ${fromLabel} ke ${toLabel}`;
        const timestamp = Date.now();

        const result = await prisma.$transaction(async (tx) => {
          // 1. Create JournalEntry (Transfer — NOT revenue/expense)
          const journalEntry = await tx.journalEntry.create({
            data: {
              tanggal: new Date(data.tanggal),
              keterangan,
              reference: `mutasi-${data.dari}-${data.ke}-${timestamp}`,
              status: 'posted',
              postedAt: new Date(),
              postedBy: req.user?.email || 'system',
            },
          });

          // 2. Create JournalEntryLines
          // Debit destination, Credit source (both are Asset accounts)
          await tx.journalEntryLine.createMany({
            data: [
              {
                journalEntryId: journalEntry.id,
                kodeAkun: data.ke,    // Destination: Debit
                debit: jumlah,
                kredit: 0,
              },
              {
                journalEntryId: journalEntry.id,
                kodeAkun: data.dari,  // Source: Credit
                debit: 0,
                kredit: jumlah,
              },
            ],
          });

          // 3. Update account balances (both are Asset/debit-normal)
          await tx.account.update({
            where: { kodeAkun: data.ke },
            data: { saldo: { increment: jumlah } },
          });
          await tx.account.update({
            where: { kodeAkun: data.dari },
            data: { saldo: { decrement: jumlah } },
          });

          // 4. Create AuditTrail
          await tx.auditTrail.create({
            data: {
              action: 'create',
              entity: 'mutasi',
              entityId: journalEntry.id,
              newData: {
                dari: data.dari,
                ke: data.ke,
                jumlah,
                keterangan,
              },
              userId: req.user?.email || null,
            },
          });

          return journalEntry;
        });

        invalidateDashboardCache();

        return res.status(201).json({
          ...result,
          message: `Transfer ${fromLabel} → ${toLabel} sebesar Rp ${jumlah.toLocaleString('id-ID')} berhasil`,
        });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Mutasi API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler, { requireAdmin: true });
