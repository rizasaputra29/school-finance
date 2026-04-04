import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody } from '@/lib/validation';
import { 
  getIdempotencyResult, 
  setIdempotencyResult,
  isValidIdempotencyKey 
} from '@/lib/idempotency';

// Validation schemas
const createBillingSchema = z.object({
  studentId: z.string().min(1, 'Siswa wajib dipilih'),
  jenisBiaya: z.string().min(1, 'Jenis biaya wajib diisi'),
  periodeBulan: z.string().optional(),
  jumlah: z.union([z.number(), z.string()]).optional(),
  catatan: z.string().optional(),
});

function sendValidationErrorResponse(errors: Array<{ field: string; message: string }>) {
  return NextResponse.json({
    error: 'Validation failed',
    validationErrors: errors,
  }, { status: 400 });
}

function getIdempotencyKeyFromNextRequest(req: NextRequest): string | null {
  const header = req.headers.get('x-idempotency-key');
  if (!header) return null;
  return header;
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '10';
    const studentId = searchParams.get('studentId');
    const statusBayar = searchParams.get('statusBayar');
    const periodeBulan = searchParams.get('periodeBulan');
    const jenisBiaya = searchParams.get('jenisBiaya');
    const search = searchParams.get('search');
    
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {};
    
    if (studentId) where.studentId = studentId;
    if (statusBayar) where.statusBayar = statusBayar;
    if (periodeBulan) where.periodeBulan = periodeBulan;
    if (jenisBiaya) where.jenisBiaya = jenisBiaya;
    
    // Search by student name, NIS, or jenisBiaya
    if (search) {
      where.OR = [
        { student: { nama: { contains: search, mode: 'insensitive' } } },
        { student: { nis: { contains: search, mode: 'insensitive' } } },
        { jenisBiaya: { contains: search, mode: 'insensitive' } },
        { periodeBulan: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch paginated billings and aggregates in parallel
    const [billings, total, aggregates, statusCounts] = await Promise.all([
      prisma.billing.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              nis: true,
              nama: true,
              kelas: true,
            },
          },
        },
        orderBy: [
          { periodeBulan: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: parseInt(limit),
      }),
      prisma.billing.count({ where }),
      // Calculate summary using aggregate
      prisma.billing.aggregate({
        where,
        _sum: { jumlah: true },
      }),
      // Calculate status breakdown using groupBy
      prisma.billing.groupBy({
        by: ['statusBayar'],
        where,
        _sum: { jumlah: true },
        _count: { _all: true },
      }),
    ]);

    // Process aggregates into summary
    const totalTagihan = aggregates._sum.jumlah || 0;
    let totalBelumLunas = 0;
    let totalLunas = 0;
    let countBelumLunas = 0;
    let countLunas = 0;

    for (const group of statusCounts) {
      if (group.statusBayar === 'Belum Lunas') {
        totalBelumLunas = group._sum.jumlah || 0;
        countBelumLunas = group._count._all;
      } else if (group.statusBayar === 'Lunas') {
        totalLunas = group._sum.jumlah || 0;
        countLunas = group._count._all;
      }
    }

    return NextResponse.json({
      data: billings,
      summary: {
        totalTagihan,
        totalBelumLunas,
        totalLunas,
        countBelumLunas,
        countLunas,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const ip = getClientIp(request);
    
    // Rate limiting for create operations
    const rateLimitResult = rateLimit(`create:${ip}`, RATE_LIMITS.create);
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

    // Check for idempotency key in headers
    const idempotencyKey = getIdempotencyKeyFromNextRequest(request);
    if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
      const cachedResult = getIdempotencyResult(idempotencyKey);
      if (cachedResult !== null) {
        return NextResponse.json(cachedResult, { status: 201 });
      }
    }

    // Validate request body
    const validationErrors = validateBody(body, createBillingSchema);
    if (validationErrors) {
      return sendValidationErrorResponse(validationErrors);
    }

    const { studentId, jenisBiaya, periodeBulan, jumlah, catatan } = body as z.infer<typeof createBillingSchema>;

    // Check for duplicate billing
    const existingBilling = await prisma.billing.findUnique({
      where: {
        studentId_jenisBiaya_periodeBulan: {
          studentId,
          jenisBiaya,
          periodeBulan: periodeBulan || '',
        },
      },
    });

    if (existingBilling) {
      return NextResponse.json({ 
        error: `Tagihan ${jenisBiaya} untuk periode ${periodeBulan} sudah ada untuk siswa ini` 
      }, { status: 400 });
    }

    // Verify student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return NextResponse.json({ error: 'Siswa tidak ditemukan' }, { status: 400 });
    }

    const billing = await prisma.billing.create({
      data: {
        studentId,
        jenisBiaya,
        periodeBulan: periodeBulan || '',
        jumlah: typeof jumlah === 'string' ? parseFloat(jumlah) : (jumlah || 0),
        catatan: catatan || null,
        statusBayar: 'Belum Lunas',
      },
      include: {
        student: {
          select: {
            id: true,
            nis: true,
            nama: true,
            kelas: true,
          },
        },
      },
    });

    // Update student total tagihan
    await prisma.student.update({
      where: { id: studentId },
      data: {
        totalTagihan: { increment: parseFloat(jumlah as string) },
        statusBayar: 'Belum Lunas',
      },
    });

    // Cache result for idempotency
    if (idempotencyKey) {
      setIdempotencyResult(idempotencyKey, billing);
    }

    return NextResponse.json(billing, { status: 201 });
  });
}
