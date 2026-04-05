import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import {
  getIdempotencyResult,
  setIdempotencyResult,
  isValidIdempotencyKey
} from '@/lib/idempotency';
import { success, errors } from '@/lib/api-response';

// Validation schemas
const createStudentSchema = z.object({
  nis: z.string().min(1, 'NIS wajib diisi').max(20, 'NIS maksimal 20 karakter'),
  nama: z.string().min(1, 'Nama wajib diisi').max(100, 'Nama maksimal 100 karakter'),
  kelas: z.string().optional(),
  tahunMasuk: z.union([z.number(), z.string()]).optional(),
  tahunAjaran: z.string().optional(),
  namaOrtu: z.string().optional(),
  noTelp: z.string().optional(),
  statusBayar: z.string().optional(),
});

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
    const kelas = searchParams.get('kelas');
    const statusBayar = searchParams.get('statusBayar');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {};

    // Filter by class
    if (kelas) where.kelas = kelas;

    // Filter by payment status
    if (statusBayar) where.statusBayar = statusBayar;

    // Filter by active status (default: Active only)
    if (status) {
      where.status = status;
    } else {
      where.status = 'Active'; // Default to active students
    }

    // Search by name, NIS, or class
    if (search) {
      where.OR = [
        { nama: { contains: search, mode: 'insensitive' } },
        { nis: { contains: search, mode: 'insensitive' } },
        { kelas: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get students first (without billings to avoid loading all billing data)
    const students = await prisma.student.findMany({
      where,
      orderBy: { nama: 'asc' },
      skip,
      take: parseInt(limit),
    });

    // Get all billing aggregates for these students in one query
    const studentIds = students.map(s => s.id);

    const [billingAggregates, billingStatusCounts] = await Promise.all([
      // Aggregate total amounts per student
      prisma.billing.groupBy({
        by: ['studentId'],
        where: { studentId: { in: studentIds } },
        _sum: { jumlah: true },
      }),
      // Aggregate paid amounts per student (Lunas only)
      prisma.billing.groupBy({
        by: ['studentId', 'statusBayar'],
        where: { studentId: { in: studentIds } },
        _sum: { jumlah: true },
        _count: { _all: true },
      }),
    ]);

    // Build lookup maps for quick access
    const totalByStudent = new Map(billingAggregates.map(g => [g.studentId, g._sum.jumlah || 0]));
    const paidByStudent = new Map<string, number>();
    const lunasCountByStudent = new Map<string, number>();
    const totalCountByStudent = new Map<string, number>();

    for (const group of billingStatusCounts) {
      const currentTotal = totalCountByStudent.get(group.studentId) || 0;
      totalCountByStudent.set(group.studentId, currentTotal + group._count._all);

      if (group.statusBayar === 'Lunas') {
        paidByStudent.set(group.studentId, group._sum.jumlah || 0);
        lunasCountByStudent.set(group.studentId, group._count._all);
      }
    }

    // Compute totals and status for each student
    const studentsWithTotals = students.map(student => {
      const totalTagihan = totalByStudent.get(student.id) || 0;
      const totalBayar = paidByStudent.get(student.id) || 0;
      const totalBills = totalCountByStudent.get(student.id) || 0;
      const lunasBills = lunasCountByStudent.get(student.id) || 0;

      // Determine statusBayar based on actual billing status
      const allLunas = totalBills > 0 && lunasBills === totalBills;
      const anyLunas = lunasBills > 0;
      const computedStatusBayar = allLunas ? 'Lunas' : (anyLunas ? 'Belum Lunas' : (student.statusBayar || 'Belum Lunas'));

      return {
        ...student,
        totalTagihan,
        totalBayar,
        statusBayar: computedStatusBayar,
      };
    });

    const total = await prisma.student.count({ where });

    return success(studentsWithTotals, {
      message: 'Students retrieved successfully',
      meta: {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
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
      return errors.rateLimit(formatRateLimitError(rateLimitResult));
    }

    // Check for idempotency key in headers
    const idempotencyKey = getIdempotencyKeyFromNextRequest(request);
    if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
      const cachedResult = getIdempotencyResult(idempotencyKey);
      if (cachedResult !== null) {
        return success(cachedResult, {
          message: 'Student created successfully (cached)',
          status: 201,
        });
      }
    }

    const body = await request.json();

    // Validate request body
    const validationResult = createStudentSchema.safeParse(body);
    if (!validationResult.success) {
      const validationErrors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return errors.validation(validationErrors);
    }

    const { nis, nama, kelas, tahunMasuk, tahunAjaran, namaOrtu, noTelp, statusBayar } = validationResult.data;

    // Check for duplicate NIS
    const existingStudent = await prisma.student.findUnique({
      where: { nis },
    });

    if (existingStudent) {
      return errors.conflict('NIS sudah terdaftar');
    }

    const student = await prisma.student.create({
      data: {
        nis,
        nama,
        kelas: kelas || '',
        tahunMasuk: typeof tahunMasuk === 'string' ? parseInt(tahunMasuk) : (tahunMasuk || new Date().getFullYear()),
        tahunAjaran: tahunAjaran || null,
        namaOrtu: namaOrtu || null,
        noTelp: noTelp || null,
        statusBayar: statusBayar || 'Belum Lunas',
        status: 'Active',
        totalTagihan: 0,
        totalBayar: 0,
      },
    });

    // Cache result for idempotency
    if (idempotencyKey) {
      setIdempotencyResult(idempotencyKey, student);
    }

    return success(student, {
      message: 'Student created successfully',
      status: 201,
    });
  });
}
