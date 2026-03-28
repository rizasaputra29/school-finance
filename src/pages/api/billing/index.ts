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
const createBillingSchema = z.object({
  studentId: z.string().min(1, 'Siswa wajib dipilih'),
  jenisBiaya: z.string().min(1, 'Jenis biaya wajib diisi'),
  periodeBulan: z.string().optional(),
  jumlah: z.union([z.number(), z.string()]).optional(),
  catatan: z.string().optional(),
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const ip = getClientIp(req);
  
  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', studentId, statusBayar, periodeBulan, jenisBiaya, search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: Record<string, unknown> = {};
        
        if (studentId) where.studentId = studentId;
        if (statusBayar) where.statusBayar = statusBayar;
        if (periodeBulan) where.periodeBulan = periodeBulan;
        if (jenisBiaya) where.jenisBiaya = jenisBiaya;
        
        // Search by student name, NIS, or jenisBiaya
        if (search) {
          where.OR = [
            { student: { nama: { contains: search as string, mode: 'insensitive' } } },
            { student: { nis: { contains: search as string, mode: 'insensitive' } } },
            { jenisBiaya: { contains: search as string, mode: 'insensitive' } },
            { periodeBulan: { contains: search as string, mode: 'insensitive' } },
          ];
        }

        const [billings, total] = await Promise.all([
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
            take: parseInt(limit as string),
          }),
          prisma.billing.count({ where }),
        ]);

        // Calculate summary
        const allBillings = await prisma.billing.findMany({ where });
        const totalTagihan = allBillings.reduce((sum, b) => sum + b.jumlah, 0);
        const totalBelumLunas = allBillings.filter(b => b.statusBayar === 'Belum Lunas').reduce((sum, b) => sum + b.jumlah, 0);
        const totalLunas = allBillings.filter(b => b.statusBayar === 'Lunas').reduce((sum, b) => sum + b.jumlah, 0);

        return res.status(200).json({
          data: billings,
          summary: {
            totalTagihan,
            totalBelumLunas,
            totalLunas,
            countBelumLunas: allBillings.filter(b => b.statusBayar === 'Belum Lunas').length,
            countLunas: allBillings.filter(b => b.statusBayar === 'Lunas').length,
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
        const validationErrors = validateBody(req.body, createBillingSchema);
        if (validationErrors) {
          return sendValidationError(res, validationErrors);
        }

        const { studentId, jenisBiaya, periodeBulan, jumlah, catatan } = req.body as z.infer<typeof createBillingSchema>;

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
          return res.status(400).json({ 
            error: `Tagihan ${jenisBiaya} untuk periode ${periodeBulan} sudah ada untuk siswa ini` 
          });
        }

        // Verify student exists
        const student = await prisma.student.findUnique({
          where: { id: studentId },
        });

        if (!student) {
          return res.status(400).json({ error: 'Siswa tidak ditemukan' });
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

        return res.status(201).json(billing);
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Billing API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
