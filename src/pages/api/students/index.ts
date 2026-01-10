import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', kelas, statusBayar } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: Record<string, unknown> = {};
        if (kelas) where.kelas = kelas;
        if (statusBayar) where.statusBayar = statusBayar;

        const [students, total] = await Promise.all([
          prisma.student.findMany({
            where,
            orderBy: { nama: 'asc' },
            skip,
            take: parseInt(limit as string),
          }),
          prisma.student.count({ where }),
        ]);

        return res.status(200).json({
          data: students,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            totalPages: Math.ceil(total / parseInt(limit as string)),
          },
        });
      }

      case 'POST': {
        const { nis, nama, kelas, tahunMasuk, statusBayar, totalTagihan, totalBayar } = req.body;

        if (!nis || !nama || !kelas || !tahunMasuk) {
          return res.status(400).json({ error: 'Data tidak lengkap' });
        }

        const student = await prisma.student.create({
          data: {
            nis,
            nama,
            kelas,
            tahunMasuk: parseInt(tahunMasuk),
            statusBayar: statusBayar || 'Belum Lunas',
            totalTagihan: parseFloat(totalTagihan) || 0,
            totalBayar: parseFloat(totalBayar) || 0,
          },
        });

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
