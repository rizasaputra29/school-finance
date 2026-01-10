import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID tidak valid' });
  }

  try {
    switch (req.method) {
      case 'GET': {
        const cashflow = await prisma.cashflow.findUnique({
          where: { id },
        });

        if (!cashflow) {
          return res.status(404).json({ error: 'Cashflow tidak ditemukan' });
        }

        return res.status(200).json(cashflow);
      }

      case 'PUT': {
        const { tanggal, keterangan, kodeAkun, debit, kredit } = req.body;

        const cashflow = await prisma.cashflow.update({
          where: { id },
          data: {
            tanggal: tanggal ? new Date(tanggal) : undefined,
            keterangan,
            kodeAkun,
            debit: debit !== undefined ? parseFloat(debit) : undefined,
            kredit: kredit !== undefined ? parseFloat(kredit) : undefined,
          },
        });

        return res.status(200).json(cashflow);
      }

      case 'DELETE': {
        await prisma.cashflow.delete({
          where: { id },
        });

        return res.status(204).end();
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Cashflow API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
