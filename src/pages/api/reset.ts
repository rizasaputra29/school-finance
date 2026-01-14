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
    // Delete sequentially instead of using transaction to avoid timeout on serverless DBs
    // Order matters due to foreign key dependencies
    console.log('Deleting cashflows...');
    await prisma.cashflow.deleteMany();
    
    console.log('Deleting billings...');
    await prisma.billing.deleteMany();
    
    console.log('Deleting students...');
    await prisma.student.deleteMany();
    
    console.log('Deleting accounts...');
    await prisma.account.deleteMany();

    console.log('Database reset successful');
    return res.status(200).json({ message: 'Database reset successful' });
  } catch (error) {
    console.error('Reset API Error:', error);
    return res.status(500).json({ error: 'Failed to reset database' });
  }
}
