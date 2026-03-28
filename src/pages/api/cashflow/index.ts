import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody, sendValidationError } from '@/lib/validation';
import { 
  getIdempotencyResult, 
  setIdempotencyResult,
  getIdempotencyKeyFromRequest,
  isValidIdempotencyKey 
} from '@/lib/idempotency';
// import { revalidateCache } from '@/lib/cache';

// Validation schemas
const createCashflowSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  keterangan: z.string().min(1, 'Keterangan wajib diisi').max(500, 'Keterangan maksimal 500 karakter'),
  kodeAkun: z.string().min(1, 'Kode akun wajib diisi'),
  kategori: z.string().optional(),
  debit: z.union([z.number(), z.string()]).optional().default(0),
  kredit: z.union([z.number(), z.string()]).optional().default(0),
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const ip = getClientIp(req);
  
  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', startDate, endDate, kodeAkun, type, search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: Record<string, unknown> = {};
        if (startDate && endDate) {
          where.tanggal = {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          };
        }
        if (kodeAkun) {
          where.kodeAkun = kodeAkun;
        }
        
        // Filter by transaction type
        if (type === 'income') {
          where.debit = { gt: 0 };
        } else if (type === 'expense') {
          where.kredit = { gt: 0 };
        }
        
        // Search by keterangan or kodeAkun
        if (search) {
          where.OR = [
            { keterangan: { contains: search as string, mode: 'insensitive' } },
            { kodeAkun: { contains: search as string, mode: 'insensitive' } },
          ];
        }

        const [cashflows, total] = await Promise.all([
          prisma.cashflow.findMany({
            where,
            orderBy: { tanggal: 'desc' },
            skip,
            take: parseInt(limit as string),
          }),
          prisma.cashflow.count({ where }),
        ]);

        // Calculate summary for filtered data
        const allFiltered = await prisma.cashflow.findMany({ where });
        const totalDebit = allFiltered.reduce((sum: number, cf: { debit: number }) => sum + cf.debit, 0);
        const totalKredit = allFiltered.reduce((sum: number, cf: { kredit: number }) => sum + cf.kredit, 0);

        return res.status(200).json({
          data: cashflows,
          summary: {
            totalDebit,
            totalKredit,
            saldo: totalDebit - totalKredit,
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
        // Rate limiting for create operations
        const rateLimitResult = rateLimit(`create:${ip}`, RATE_LIMITS.create);
        if (!rateLimitResult.success) {
          res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
          return res.status(429).json({ 
            error: formatRateLimitError(rateLimitResult),
            code: 'RATE_LIMIT_EXCEEDED'
          });
        }

        // Check for idempotency key in headers
        const idempotencyKey = getIdempotencyKeyFromRequest(req);
        if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
          const cachedResult = getIdempotencyResult(idempotencyKey);
          if (cachedResult !== null) {
            return res.status(201).json(cachedResult);
          }
        }

        // Validate request body
        const validationErrors = validateBody(req.body, createCashflowSchema);
        if (validationErrors) {
          return sendValidationError(res, validationErrors);
        }

        const { tanggal, keterangan, kodeAkun, kategori, debit, kredit } = req.body as z.infer<typeof createCashflowSchema>;

        const debitAmount = typeof debit === 'string' ? parseFloat(debit) : Number(debit) || 0;
        const kreditAmount = typeof kredit === 'string' ? parseFloat(kredit) : Number(kredit) || 0;

        try {
          const result = await prisma.$transaction(async (tx) => {
            // 1. Get the account to determine type and current balance
            const account = await tx.account.findUnique({
              where: { kodeAkun },
            });

            if (!account) {
              throw new Error(`Akun dengan kode ${kodeAkun} tidak ditemukan`);
            }

            // 2. Calculate balance adjustment based on account type
            let saldoChange = 0;
            const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);

            if (isDebitNormal) {
              saldoChange = debitAmount - kreditAmount;
            } else {
              saldoChange = kreditAmount - debitAmount;
            }

            // 3. Update account balance
            await tx.account.update({
              where: { kodeAkun },
              data: {
                saldo: { increment: saldoChange },
              },
            });

            // 4. Create cashflow record
            const cashflow = await tx.cashflow.create({
              data: {
                tanggal: new Date(tanggal),
                keterangan,
                kodeAkun,
                kategori: kategori || null,
                debit: debitAmount,
                kredit: kreditAmount,
              },
            });

            return cashflow;
          });

          // Cache result for idempotency
          if (idempotencyKey) {
            setIdempotencyResult(idempotencyKey, result);
          }

          return res.status(201).json(result);
        } catch (error) {
          console.error('Transaction error:', error);
          const message = error instanceof Error ? error.message : 'Unknown error';
          return res.status(400).json({ error: message });
        }
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Cashflow API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
