import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { success } from '@/lib/api-response';
import { handlePrismaErrorResponse } from '@/lib/prisma-errors';

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
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

      return success(exportData, { message: 'Data export berhasil' });
    } catch (error) {
      console.error('Export error:', error);
      return handlePrismaErrorResponse(error);
    }
  }, { requireAdmin: true });
}
