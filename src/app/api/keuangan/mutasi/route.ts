import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/withAuthAppRouter';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { invalidateDashboardCache } from '@/lib/cache';

const mutasiSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  dari: z.enum(['101', '102'], { required_error: 'Sumber wajib dipilih (101=Kas, 102=Bank)' }),
  ke: z.enum(['101', '102'], { required_error: 'Tujuan wajib dipilih (101=Kas, 102=Bank)' }),
  jumlah: z.union([z.number(), z.string()]).transform((v) => typeof v === 'string' ? parseFloat(v) : v),
  keterangan: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const page = searchParams.get('page') || '1';
      const limit = searchParams.get('limit') || '10';
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

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

      return NextResponse.json({
        data: entries,
        pagination: {
          page: parseInt(page),
          limit: take,
          total,
          totalPages: Math.ceil(total / take),
        },
      });
    } catch (error) {
      console.error('Mutasi API error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }, { requireAdmin: true });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async (user) => {
    const ip = getClientIp(request);

    try {
      const rateLimitResult = rateLimit(`mutasi:${ip}`, RATE_LIMITS.create);
      if (!rateLimitResult.success) {
        return NextResponse.json({
          error: formatRateLimitError(rateLimitResult),
          code: 'RATE_LIMIT_EXCEEDED',
        }, { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
          }
        });
      }

      const body = await request.json();

      const validationErrors = mutasiSchema.safeParse(body);
      if (!validationErrors.success) {
        return NextResponse.json({
          error: 'Validation failed',
          details: validationErrors.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        }, { status: 400 });
      }

      const data = validationErrors.data;
      const jumlah = typeof data.jumlah === 'string' ? parseFloat(data.jumlah) : Number(data.jumlah);

      // Validate: source and destination must be different
      if (data.dari === data.ke) {
        return NextResponse.json({ error: 'Sumber dan tujuan harus berbeda' }, { status: 400 });
      }

      if (jumlah <= 0) {
        return NextResponse.json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 });
      }

      // Check period is open
      const periodeCode = data.tanggal.substring(0, 7); // YYYY-MM
      const period = await prisma.period.findUnique({ where: { kode: periodeCode } });
      if (period && period.status === 'closed') {
        return NextResponse.json({ error: `Periode ${periodeCode} sudah ditutup` }, { status: 400 });
      }

      // Validate both accounts exist
      const [fromAccount, toAccount] = await Promise.all([
        prisma.account.findUnique({ where: { kodeAkun: data.dari } }),
        prisma.account.findUnique({ where: { kodeAkun: data.ke } }),
      ]);
      if (!fromAccount) return NextResponse.json({ error: `Akun sumber ${data.dari} tidak ditemukan` }, { status: 400 });
      if (!toAccount) return NextResponse.json({ error: `Akun tujuan ${data.ke} tidak ditemukan` }, { status: 400 });

      // Check sufficient balance in source
      if (fromAccount.saldo < jumlah) {
        return NextResponse.json({
          error: `Saldo ${fromAccount.namaAkun} tidak mencukupi (Rp ${fromAccount.saldo.toLocaleString('id-ID')})`,
        }, { status: 400 });
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
            postedBy: user.email || 'system',
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
            userId: user.email || null,
          },
        });

        return journalEntry;
      });

      invalidateDashboardCache();

      return NextResponse.json({
        ...result,
        message: `Transfer ${fromLabel} → ${toLabel} sebesar Rp ${jumlah.toLocaleString('id-ID')} berhasil`,
      }, { status: 201 });
    } catch (error) {
      console.error('Mutasi API error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }, { requireAdmin: true });
}
