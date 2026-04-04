import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody } from '@/lib/validation';

const createEmployeeSchema = z.object({
  nip: z.string().min(1, 'NIP wajib diisi'),
  nama: z.string().min(1, 'Nama wajib diisi').max(200),
  jabatan: z.string().min(1, 'Jabatan wajib diisi'),
  jenisKelamin: z.enum(['L', 'P']).optional(),
  noTelp: z.string().optional(),
  alamat: z.string().optional(),
  tanggalMasuk: z.string().min(1, 'Tanggal masuk wajib diisi'),
  gajiPokok: z.union([z.number(), z.string()]).optional().default(0),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
});

const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  id: z.string().min(1),
});

function sendValidationErrorResponse(errors: Array<{ field: string; message: string }>) {
  return NextResponse.json({
    error: 'Validation failed',
    validationErrors: errors,
  }, { status: 400 });
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '10';
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const jabatan = searchParams.get('jabatan');
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { nama: { contains: search, mode: 'insensitive' } },
        { nip: { contains: search, mode: 'insensitive' } },
        { jabatan: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (jabatan) where.jabatan = jabatan;

    const [employees, total, activeCount, inactiveCount] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy: { nama: 'asc' },
        skip,
        take,
        include: {
          _count: { select: { payrolls: true } },
        },
      }),
      prisma.employee.count({ where }),
      prisma.employee.count({ where: { status: 'Active' } }),
      prisma.employee.count({ where: { status: 'Inactive' } }),
    ]);

    return NextResponse.json({
      data: employees,
      summary: {
        total: activeCount + inactiveCount,
        active: activeCount,
        inactive: inactiveCount,
      },
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const ip = getClientIp(request);

    const rateLimitResult = rateLimit(`create-employee:${ip}`, RATE_LIMITS.create);
    if (!rateLimitResult.success) {
      return NextResponse.json({
        error: formatRateLimitError(rateLimitResult),
        code: 'RATE_LIMIT_EXCEEDED',
      }, {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString()
        }
      });
    }

    const body = await request.json();

    const validationErrors = validateBody(body, createEmployeeSchema);
    if (validationErrors) return sendValidationErrorResponse(validationErrors);

    const data = body as z.infer<typeof createEmployeeSchema>;
    const gajiPokok = typeof data.gajiPokok === 'string' ? parseFloat(data.gajiPokok) : Number(data.gajiPokok) || 0;

    // Check duplicate NIP
    const existing = await prisma.employee.findUnique({ where: { nip: data.nip } });
    if (existing) {
      return NextResponse.json({ error: `NIP ${data.nip} sudah terdaftar` }, { status: 400 });
    }

    const employee = await prisma.employee.create({
      data: {
        nip: data.nip,
        nama: data.nama,
        jabatan: data.jabatan,
        jenisKelamin: data.jenisKelamin || null,
        noTelp: data.noTelp || null,
        alamat: data.alamat || null,
        tanggalMasuk: new Date(data.tanggalMasuk),
        gajiPokok,
        status: data.status || 'Active',
      },
    });

    return NextResponse.json({ ...employee, message: 'Karyawan berhasil ditambahkan' }, { status: 201 });
  });
}

export async function PUT(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const body = await request.json();

    const validationErrors = validateBody(body, updateEmployeeSchema);
    if (validationErrors) return sendValidationErrorResponse(validationErrors);

    const data = body as z.infer<typeof updateEmployeeSchema>;

    const existing = await prisma.employee.findUnique({ where: { id: data.id } });
    if (!existing) return NextResponse.json({ error: 'Karyawan tidak ditemukan' }, { status: 404 });

    // Check NIP uniqueness if changing
    if (data.nip && data.nip !== existing.nip) {
      const nipConflict = await prisma.employee.findUnique({ where: { nip: data.nip } });
      if (nipConflict) return NextResponse.json({ error: `NIP ${data.nip} sudah terdaftar` }, { status: 400 });
    }

    const gajiPokok = data.gajiPokok !== undefined
      ? (typeof data.gajiPokok === 'string' ? parseFloat(data.gajiPokok) : Number(data.gajiPokok) || 0)
      : undefined;

    const employee = await prisma.employee.update({
      where: { id: data.id },
      data: {
        ...(data.nip && { nip: data.nip }),
        ...(data.nama && { nama: data.nama }),
        ...(data.jabatan && { jabatan: data.jabatan }),
        ...(data.jenisKelamin !== undefined && { jenisKelamin: data.jenisKelamin || null }),
        ...(data.noTelp !== undefined && { noTelp: data.noTelp || null }),
        ...(data.alamat !== undefined && { alamat: data.alamat || null }),
        ...(data.tanggalMasuk && { tanggalMasuk: new Date(data.tanggalMasuk) }),
        ...(gajiPokok !== undefined && { gajiPokok }),
        ...(data.status && { status: data.status }),
      },
    });

    return NextResponse.json({ ...employee, message: 'Karyawan berhasil diperbarui' });
  });
}

export async function DELETE(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID karyawan wajib diisi' }, { status: 400 });
    }

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Karyawan tidak ditemukan' }, { status: 404 });

    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ message: 'Karyawan berhasil dihapus' });
  });
}
