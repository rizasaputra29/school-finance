import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { invalidateAccountsCache } from '@/lib/cache';
import {
  getIdempotencyResult,
  setIdempotencyResult,
  getIdempotencyKeyFromRequest,
  isValidIdempotencyKey
} from '@/lib/idempotency';
import { success, errors } from '@/lib/api-response';
import { handlePrismaError } from '@/lib/prisma-errors';

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

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      // Use direct query to bypass cache for accurate data
      const accounts = await prisma.account.findMany({
        orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
      });
      return success(accounts, {
        message: 'Accounts retrieved successfully',
      });
    } catch (error) {
      console.error('Accounts API error:', error);
      const { message } = handlePrismaError(error);
      return errors.internal(message);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const ip = getClientIp(request);

      // Rate limiting for create operations
      const rateLimitResult = rateLimit(`create:${ip}`, RATE_LIMITS.create);
      if (!rateLimitResult.success) {
        return errors.rateLimit(formatRateLimitError(rateLimitResult));
      }

      // Check for idempotency key in headers
      const headers: Record<string, string | string[] | undefined> = {};
      for (const [key, value] of request.headers.entries()) {
        headers[key] = value;
      }
      const idempotencyKey = getIdempotencyKeyFromRequest({ headers });
      if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
        // Check if this request was already processed
        const cachedResult = getIdempotencyResult(idempotencyKey);
        if (cachedResult !== null) {
          // Return cached result - this is an idempotent response
          return success(cachedResult, {
            message: 'Account created successfully (cached)',
            status: 201,
          });
        }
      }

      // Parse and validate request body
      const body = await request.json();
      const validationResult = createAccountSchema.safeParse(body);

      if (!validationResult.success) {
        const validationErrors = validationResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return errors.validation(validationErrors);
      }

      const { kodeAkun, namaAkun, tipeAkun, kategori, saldo } = validationResult.data;

      // Validate bank account (only one allowed)
      const bankValidation = await validateBankAccount(kodeAkun, kategori);
      if (!bankValidation.valid) {
        return errors.validation([{
          field: 'kodeAkun',
          message: bankValidation.error || 'Invalid bank account',
        }]);
      }

      // Check for duplicate kodeAkun
      const existing = await prisma.account.findUnique({
        where: { kodeAkun },
      });
      if (existing) {
        return errors.conflict('Kode akun sudah ada');
      }

      const account = await prisma.account.create({
        data: {
          kodeAkun,
          namaAkun,
          tipeAkun,
          kategori: kategori || null,
          saldo: typeof saldo === 'string' ? parseFloat(saldo) || 0 : saldo || 0,
        },
      });

      // Cache the result for idempotency
      if (idempotencyKey) {
        setIdempotencyResult(idempotencyKey, account);
      }

      // Invalidate accounts cache to reflect new data
      invalidateAccountsCache();

      return success(account, {
        message: 'Account created successfully',
        status: 201,
      });
    } catch (error) {
      console.error('Accounts API error:', error);
      if (error instanceof Error && error.name === 'SyntaxError') {
        return errors.badRequest('Invalid JSON in request body');
      }
      const { message } = handlePrismaError(error);
      return errors.internal(message);
    }
  }, { requireAdmin: true });
}
