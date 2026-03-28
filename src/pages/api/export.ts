import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const [cashflow, accounts, students, billings] = await Promise.all([
      prisma.cashflow.findMany(),
      prisma.account.findMany(),
      prisma.student.findMany(),
      prisma.billing.findMany(),
    ]);

    const exportData = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        cashflow,
        accounts,
        students,
        billings,
      },
    };

    return res.status(200).json(exportData);
  } catch (error) {
    console.error('Export Error:', error);
    return res.status(500).json({ error: 'Failed to export data' });
  }
}

export default withAuth(handler, { requireAdmin: true });
