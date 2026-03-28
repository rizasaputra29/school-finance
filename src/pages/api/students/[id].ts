import type { NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { 
  getIdempotencyResult, 
  setIdempotencyResult,
  getIdempotencyKeyFromRequest,
  isValidIdempotencyKey 
} from '@/lib/idempotency';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid student ID' });
  }

  // Check for idempotency key in headers (for PATCH and DELETE)
  const idempotencyKey = getIdempotencyKeyFromRequest(req);

  try {
    switch (req.method) {
      case 'GET': {
        const student = await prisma.student.findUnique({
          where: { id },
          include: { billings: true },
        });

        if (!student) {
          return res.status(404).json({ error: 'Siswa tidak ditemukan' });
        }

        return res.status(200).json(student);
      }

      case 'PATCH': {
        // Check for idempotency - return cached result if same request
        if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
          const cachedResult = getIdempotencyResult(idempotencyKey);
          if (cachedResult !== null) {
            return res.status(200).json(cachedResult);
          }
        }

        const { nama, jenisKelamin, kelas, tahunMasuk, tahunAjaran, namaOrtu, noTelp, status, statusBayar } = req.body;

        const student = await prisma.student.update({
          where: { id },
          data: {
            ...(nama && { nama }),
            ...(jenisKelamin !== undefined && { jenisKelamin }),
            ...(kelas && { kelas }),
            ...(tahunMasuk && { tahunMasuk: parseInt(tahunMasuk) }),
            ...(tahunAjaran !== undefined && { tahunAjaran }),
            ...(namaOrtu !== undefined && { namaOrtu }),
            ...(noTelp !== undefined && { noTelp }),
            ...(status && { status }),
            ...(statusBayar && { statusBayar }),
          },
        });

        // Cache result for idempotency
        if (idempotencyKey) {
          setIdempotencyResult(idempotencyKey, student);
        }

        return res.status(200).json(student);
      }

      case 'DELETE': {
        // Check for idempotency
        if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
          const cachedResult = getIdempotencyResult(idempotencyKey);
          if (cachedResult !== null) {
            return res.status(200).json(cachedResult);
          }
        }

        // Hard delete to trigger cascade delete for Billings
        const student = await prisma.student.delete({
          where: { id },
        });

        // Cache result for idempotency
        if (idempotencyKey) {
          setIdempotencyResult(idempotencyKey, { message: 'Siswa dan data terkait berhasil dihapus', student });
        }

        return res.status(200).json({ message: 'Siswa dan data terkait berhasil dihapus', student });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Student API error:', error);
    // Prisma error P2025: Record to update not found.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
