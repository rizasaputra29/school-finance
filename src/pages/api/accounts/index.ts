import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody, sendValidationError } from '@/lib/validation';
import { getCachedAccounts, invalidateAccountsCache } from '@/lib/cache';
import { 
  getIdempotencyResult, 
  setIdempotencyResult,
  getIdempotencyKeyFromRequest,
  isValidIdempotencyKey 
} from '@/lib/idempotency';

// Validation schemas
const createAccountSchema = z.object({
  kodeAkun: z.string().min(1, 'Kode akun wajib diisi').max(20, 'Kode akun maksimal 20 karakter'),
  namaAkun: z.string().min(1, 'Nama akun wajib diisi').max(100, 'Nama akun maksimal 100 karakter'),
  tipeAkun: z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'], {
    errorMap: () => ({ message: 'Tipe akun tidak valid' }),
  }),
  kategori: z.string().optional(),
  saldo: z.union([z.number(), z.string()]).optional().default(0),
});

// Bank account validation - only one bank account allowed
async function validateBankAccount(kodeAkun: string, kategori?: string): Promise<{ valid: boolean; error?: string }> {
  // Check if this is a Bank account (kode 1110 or 102, or kategori = 'Bank')
  const isBankAccount = 
    kodeAkun === '1110' || 
    kodeAkun === '102' || 
    kategori === 'Bank' ||
    kodeAkun.startsWith('111') ||
    kodeAkun.startsWith('102');

  if (isBankAccount) {
    // Check if a bank account already exists
    const existingBank = await prisma.account.findFirst({
      where: {
        OR: [
          { kodeAkun: '1110' },
          { kodeAkun: '102' },
        ],
      },
    });

    if (existingBank) {
      return {
        valid: false,
        error: 'Hanya satu akun Bank yang diperbolehkan. Akun Bank sudah ada.',
      };
    }
  }

  return { valid: true };
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const ip = getClientIp(req);
  
  try {
    switch (req.method) {
      case 'GET': {
        // Use cached accounts for better performance
        const accounts = await getCachedAccounts();
        return res.status(200).json(accounts);
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
          // Check if this request was already processed
          const cachedResult = getIdempotencyResult(idempotencyKey);
          if (cachedResult !== null) {
            // Return cached result - this is an idempotent response
            return res.status(201).json(cachedResult);
          }
        }

        // Validate request body
        const validationErrors = validateBody(req.body, createAccountSchema);
        if (validationErrors) {
          return sendValidationError(res, validationErrors);
        }

        const { kodeAkun, namaAkun, tipeAkun, kategori, saldo } = req.body as z.infer<typeof createAccountSchema>;

        // Validate bank account (only one allowed)
        const bankValidation = await validateBankAccount(kodeAkun, kategori);
        if (!bankValidation.valid) {
          return res.status(400).json({ error: bankValidation.error });
        }

        // Check for duplicate kodeAkun
        const existing = await prisma.account.findUnique({
          where: { kodeAkun },
        });
        if (existing) {
          return res.status(400).json({ error: 'Kode akun sudah ada' });
        }

        const account = await prisma.account.create({
          data: {
            kodeAkun,
            namaAkun,
            tipeAkun,
            kategori: kategori || null,
            saldo: typeof saldo === 'string' ? parseFloat(saldo) || 0 : saldo || 0,
          } as never,
        });

        // Cache the result for idempotency
        if (idempotencyKey) {
          setIdempotencyResult(idempotencyKey, account);
        }

        // Invalidate accounts cache to reflect new data
        invalidateAccountsCache();

        return res.status(201).json(account);
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Accounts API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
