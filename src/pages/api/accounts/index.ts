import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET': {
        const { tipeAkun } = req.query;

        const where: Record<string, unknown> = {};
        if (tipeAkun) where.tipeAkun = tipeAkun;

        const accounts = await prisma.account.findMany({
          where,
          orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
        });

        return res.status(200).json(accounts);
      }

      case 'POST': {
        const { kodeAkun, namaAkun, tipeAkun, saldo } = req.body;

        if (!kodeAkun || !namaAkun || !tipeAkun) {
          return res.status(400).json({ error: 'Data tidak lengkap' });
        }

        const account = await prisma.account.create({
          data: {
            kodeAkun,
            namaAkun,
            tipeAkun,
            saldo: parseFloat(saldo) || 0,
          },
        });

        return res.status(201).json(account);
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Accounts API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
