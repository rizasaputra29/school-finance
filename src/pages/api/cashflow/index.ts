import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', startDate, endDate, kodeAkun } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: Record<string, unknown> = {};
        if (startDate && endDate) {
          where.tanggal = {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          };
        }
        if (kodeAkun) {
          where.kodeAkun = kodeAkun;
        }

        const [cashflows, total] = await Promise.all([
          prisma.cashflow.findMany({
            where,
            orderBy: { tanggal: 'desc' },
            skip,
            take: parseInt(limit as string),
          }),
          prisma.cashflow.count({ where }),
        ]);

        return res.status(200).json({
          data: cashflows,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            totalPages: Math.ceil(total / parseInt(limit as string)),
          },
        });
      }

      case 'POST': {
        const { tanggal, keterangan, kodeAkun, debit, kredit } = req.body;

        if (!tanggal || !keterangan || !kodeAkun) {
          return res.status(400).json({ error: 'Data tidak lengkap' });
        }

        const cashflow = await prisma.cashflow.create({
          data: {
            tanggal: new Date(tanggal),
            keterangan,
            kodeAkun,
            debit: parseFloat(debit) || 0,
            kredit: parseFloat(kredit) || 0,
          },
        });

        return res.status(201).json(cashflow);
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Cashflow API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
