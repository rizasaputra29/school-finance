import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/withAuthAppRouter';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody } from '@/lib/validation';

// Validation schema for cash withdrawal
const withdrawSchema = z.object({
  amount: z.union([z.number(), z.string()]).refine((val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return num > 0;
  }, { message: 'Jumlah harus lebih dari 0' }),
  description: z.string().min(1, 'Keterangan wajib diisi').max(500, 'Keterangan maksimal 500 karakter'),
  tanggal: z.string().optional(),
});

// Get account codes for Kas and Bank
const KAS_CODE = '1100';
const BANK_CODE = '1110';

// Validate accounts exist
async function validateCashAccounts(): Promise<{ valid: boolean; error?: string }> {
  const [kasAccount, bankAccount] = await Promise.all([
    prisma.account.findUnique({ where: { kodeAkun: KAS_CODE } }),
    prisma.account.findUnique({ where: { kodeAkun: BANK_CODE } }),
  ]);

  if (!kasAccount) {
    return { valid: false, error: 'Akun Kas (1100) tidak ditemukan. Silakan buat akun Kas terlebih dahulu.' };
  }

  if (!bankAccount) {
    return { valid: false, error: 'Akun Bank (1110) tidak ditemukan. Silakan buat akun Bank terlebih dahulu.' };
  }

  // Check sufficient bank balance
  if (bankAccount.saldo <= 0) {
    return { valid: false, error: 'Saldo Bank tidak mencukupi untuk penarikan.' };
  }

  return { valid: true };
}

function sendValidationErrorResponse(errors: Array<{ field: string; message: string }>) {
  return NextResponse.json({
    error: 'Validation failed',
    validationErrors: errors,
  }, { status: 400 });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const ip = getClientIp(request);

    // Rate limiting for create operations
    const rateLimitResult = rateLimit(`withdraw:${ip}`, RATE_LIMITS.create);
    if (!rateLimitResult.success) {
      return NextResponse.json({
        error: formatRateLimitError(rateLimitResult),
        code: 'RATE_LIMIT_EXCEEDED'
      }, {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString()
        }
      });
    }

    const body = await request.json();

    // Validate request body
    const validationErrors = validateBody(body, withdrawSchema);
    if (validationErrors) {
      return sendValidationErrorResponse(validationErrors);
    }

    const { amount, description, tanggal } = body as z.infer<typeof withdrawSchema>;
    const withdrawalAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    // Validate accounts exist and have sufficient balance
    const accountValidation = await validateCashAccounts();
    if (!accountValidation.valid) {
      return NextResponse.json({ error: accountValidation.error }, { status: 400 });
    }

    // Get current bank balance
    const bankAccount = await prisma.account.findUnique({
      where: { kodeAkun: BANK_CODE },
    });

    if (!bankAccount || bankAccount.saldo < withdrawalAmount) {
      return NextResponse.json({
        error: `Saldo Bank tidak mencukupi. Saldo saat ini: ${bankAccount?.saldo || 0}`,
      }, { status: 400 });
    }

    // Process the withdrawal as double-entry transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Kas entry (Debit - cash increases)
      const kasEntry = await tx.cashflow.create({
        data: {
          tanggal: new Date(tanggal || new Date()),
          keterangan: `Penarikan Bank: ${description}`,
          kodeAkun: KAS_CODE,
          kategori: 'penarikan',
          debit: withdrawalAmount,
          kredit: 0,
          source: 'bank', // Money came from bank
        } as never,
      });

      // 2. Create Bank entry (Kredit - bank decreases)
      const bankEntry = await tx.cashflow.create({
        data: {
          tanggal: new Date(tanggal || new Date()),
          keterangan: `Penarikan Bank: ${description}`,
          kodeAkun: BANK_CODE,
          kategori: 'penarikan',
          debit: 0,
          kredit: withdrawalAmount,
          source: 'bank',
        } as never,
      });

      // 3. Update Kas account balance (Asset - debit increases)
      await tx.account.update({
        where: { kodeAkun: KAS_CODE },
        data: { saldo: { increment: withdrawalAmount } },
      });

      // 4. Update Bank account balance (Asset - kredit decreases)
      await tx.account.update({
        where: { kodeAkun: BANK_CODE },
        data: { saldo: { decrement: withdrawalAmount } },
      });

      return { kasEntry, bankEntry };
    });

    return NextResponse.json({
      success: true,
      message: `Penarikan sebesar ${withdrawalAmount} berhasil`,
      data: {
        kas: result.kasEntry,
        bank: result.bankEntry,
      },
    }, { status: 201 });
  });
}
