import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', studentId, statusBayar, periodeBulan, jenisBiaya } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: Record<string, unknown> = {};
        
        if (studentId) where.studentId = studentId;
        if (statusBayar) where.statusBayar = statusBayar;
        if (periodeBulan) where.periodeBulan = periodeBulan;
        if (jenisBiaya) where.jenisBiaya = jenisBiaya;

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
        const { studentId, jenisBiaya, periodeBulan, jumlah, catatan } = req.body;

        if (!studentId || !jenisBiaya || !periodeBulan || !jumlah) {
          return res.status(400).json({ error: 'Semua field wajib diisi' });
        }

        // Check for duplicate billing
        const existingBilling = await prisma.billing.findUnique({
          where: {
            studentId_jenisBiaya_periodeBulan: {
              studentId,
              jenisBiaya,
              periodeBulan,
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
            periodeBulan,
            jumlah: parseFloat(jumlah as string),
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
