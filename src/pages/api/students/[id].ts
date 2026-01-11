import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid student ID' });
  }

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

        return res.status(200).json(student);
      }

      case 'DELETE': {
        // Hard delete to trigger cascade delete for Billings
        const student = await prisma.student.delete({
          where: { id },
        });

        return res.status(200).json({ message: 'Siswa dan data terkait berhasil dihapus', student });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Student API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
