import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    switch (req.method) {
      case 'PATCH': {
        const { namaAkun, tipeAkun, saldo } = req.body;

        const data: any = {};
        if (namaAkun) data.namaAkun = namaAkun;
        if (tipeAkun) data.tipeAkun = tipeAkun;
        if (saldo !== undefined) data.saldo = parseFloat(saldo);

        const updatedAccount = await prisma.account.update({
          where: { id },
          data,
        });

        return res.status(200).json(updatedAccount);
      }

      case 'DELETE': {
        // Cascade delete is now handled by database schema
        await prisma.account.delete({
          where: { id },
        });

        return res.status(200).json({ message: 'Account and related data deleted successfully' });
      }

      default:
        res.setHeader('Allow', ['PATCH', 'DELETE']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }
  } catch (error: any) {
    console.error('Account API Error:', error);
    // Prisma error P2025: Record to update not found.
    if (error.code === 'P2025') {
       return res.status(404).json({ error: 'Akun tidak ditemukan' });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
