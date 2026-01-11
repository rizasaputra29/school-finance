import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Double check "confirm" body param just in case
  const { confirmation } = req.body;
  if (confirmation !== 'RESET_DATABASE') {
     return res.status(400).json({ error: 'Invalid confirmation' });
  }

  try {
    // Delete in order to respect dependencies (though Cascade would handle it, explicit is better for "Reset")
    await prisma.$transaction([
      prisma.cashflow.deleteMany(),
      prisma.billing.deleteMany(),
      prisma.student.deleteMany(),
      prisma.account.deleteMany(),
      // Reset sequences if needed, but Prisma/Postgres usually handles this via auto-increment/CUID
    ]);

    return res.status(200).json({ message: 'Database reset successful' });
  } catch (error) {
    console.error('Reset API Error:', error);
    return res.status(500).json({ error: 'Failed to reset database' });
  }
}
