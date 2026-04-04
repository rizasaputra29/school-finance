import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/withAuthAppRouter';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    // Rate Limiting for Reset (Critical Action)
    const ip = getClientIp(request);
    const identifier = `reset:${ip}`;
    const rateLimitResult = rateLimit(identifier, RATE_LIMITS.reset);

    if (!rateLimitResult.success) {
      return NextResponse.json({ 
        error: formatRateLimitError(rateLimitResult),
        code: 'RATE_LIMIT_EXCEEDED' 
      }, { status: 429 });
    }

    const body = await request.json();
    const { confirmation } = body;

    // Double check "confirm" body param
    if (confirmation !== 'RESET_DATABASE') {
      return NextResponse.json({ error: 'Invalid confirmation' }, { status: 400 });
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
      return NextResponse.json({ message: 'Database reset successful' });
    } catch (error) {
      console.error('Reset API Error:', error);
      return NextResponse.json({ error: 'Failed to reset database' }, { status: 500 });
    }
  }, { requireAdmin: true });
}
