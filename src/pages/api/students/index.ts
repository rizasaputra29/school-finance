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

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const ip = getClientIp(req);
  
  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', kelas, statusBayar, status, search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

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
            { nama: { contains: search as string, mode: 'insensitive' } },
            { nis: { contains: search as string, mode: 'insensitive' } },
            { kelas: { contains: search as string, mode: 'insensitive' } },
          ];
        }

        // Get students with billing aggregations
        const students = await prisma.student.findMany({
          where,
          orderBy: { nama: 'asc' },
          skip,
          take: parseInt(limit as string),
          include: {
            billings: true,
          },
        });

        // Compute totalTagihan and totalBayar from billing data
        const studentsWithTotals = students.map(student => {
          const totalTagihan = student.billings.reduce((sum, b) => sum + b.jumlah, 0);
          const totalBayar = student.billings
            .filter(b => b.statusBayar === 'Lunas')
            .reduce((sum, b) => sum + b.jumlah, 0);
          
          // Determine statusBayar based on actual billing status
          const allLunas = student.billings.length > 0 && student.billings.every(b => b.statusBayar === 'Lunas');
          const anyLunas = student.billings.some(b => b.statusBayar === 'Lunas');
          const computedStatusBayar = allLunas ? 'Lunas' : (anyLunas ? 'Belum Lunas' : (student.statusBayar || 'Belum Lunas'));
          
          return {
            ...student,
            totalTagihan,
            totalBayar,
            statusBayar: computedStatusBayar,
          };
        });

        const total = await prisma.student.count({ where });

        return res.status(200).json({
          data: studentsWithTotals,
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
        const validationErrors = validateBody(req.body, createStudentSchema);
        if (validationErrors) {
          return sendValidationError(res, validationErrors);
        }

        const { nis, nama, kelas, tahunMasuk, tahunAjaran, namaOrtu, noTelp, statusBayar } = req.body as z.infer<typeof createStudentSchema>;

        // Check for duplicate NIS
        const existingStudent = await prisma.student.findUnique({
          where: { nis },
        });

        if (existingStudent) {
          return res.status(400).json({ error: 'NIS sudah terdaftar' });
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

        return res.status(201).json(student);
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Students API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });

