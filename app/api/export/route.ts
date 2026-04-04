import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/withAuthAppRouter';

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
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

    return NextResponse.json(exportData);
  }, { requireAdmin: true });
}
