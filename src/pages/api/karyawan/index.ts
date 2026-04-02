import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody, sendValidationError } from '@/lib/validation';

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

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const ip = getClientIp(req);

  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', search, status, jabatan } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const take = parseInt(limit as string);

        const where: Record<string, unknown> = {};
        if (search) {
          where.OR = [
            { nama: { contains: search as string, mode: 'insensitive' } },
            { nip: { contains: search as string, mode: 'insensitive' } },
            { jabatan: { contains: search as string, mode: 'insensitive' } },
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

        return res.status(200).json({
          data: employees,
          summary: {
            total: activeCount + inactiveCount,
            active: activeCount,
            inactive: inactiveCount,
          },
          pagination: {
            page: parseInt(page as string),
            limit: take,
            total,
            totalPages: Math.ceil(total / take),
          },
        });
      }

      case 'POST': {
        const rateLimitResult = rateLimit(`create-employee:${ip}`, RATE_LIMITS.create);
        if (!rateLimitResult.success) {
          res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
          return res.status(429).json({
            error: formatRateLimitError(rateLimitResult),
            code: 'RATE_LIMIT_EXCEEDED',
          });
        }

        const validationErrors = validateBody(req.body, createEmployeeSchema);
        if (validationErrors) return sendValidationError(res, validationErrors);

        const data = req.body as z.infer<typeof createEmployeeSchema>;
        const gajiPokok = typeof data.gajiPokok === 'string' ? parseFloat(data.gajiPokok) : Number(data.gajiPokok) || 0;

        // Check duplicate NIP
        const existing = await prisma.employee.findUnique({ where: { nip: data.nip } });
        if (existing) {
          return res.status(400).json({ error: `NIP ${data.nip} sudah terdaftar` });
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

        return res.status(201).json({ ...employee, message: 'Karyawan berhasil ditambahkan' });
      }

      case 'PUT': {
        const validationErrors = validateBody(req.body, updateEmployeeSchema);
        if (validationErrors) return sendValidationError(res, validationErrors);

        const data = req.body as z.infer<typeof updateEmployeeSchema>;

        const existing = await prisma.employee.findUnique({ where: { id: data.id } });
        if (!existing) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });

        // Check NIP uniqueness if changing
        if (data.nip && data.nip !== existing.nip) {
          const nipConflict = await prisma.employee.findUnique({ where: { nip: data.nip } });
          if (nipConflict) return res.status(400).json({ error: `NIP ${data.nip} sudah terdaftar` });
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

        return res.status(200).json({ ...employee, message: 'Karyawan berhasil diperbarui' });
      }

      case 'DELETE': {
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
          return res.status(400).json({ error: 'ID karyawan wajib diisi' });
        }

        const existing = await prisma.employee.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });

        await prisma.employee.delete({ where: { id } });
        return res.status(200).json({ message: 'Karyawan berhasil dihapus' });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Employee API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
