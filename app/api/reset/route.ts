import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { success, errors } from '@/lib/api-response';
import { handlePrismaErrorResponse } from '@/lib/prisma-errors';

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      // Rate Limiting for Reset (Critical Action)
      const ip = getClientIp(request);
      const identifier = `reset:${ip}`;
      const rateLimitResult = rateLimit(identifier, RATE_LIMITS.reset);

      if (!rateLimitResult.success) {
        return errors.rateLimit(formatRateLimitError(rateLimitResult));
      }

      const body = await request.json();
      const { confirmation } = body;

      // Double check "confirm" body param
      if (confirmation !== 'RESET_DATABASE') {
        return errors.validation([{ field: 'confirmation', message: 'Invalid confirmation' }]);
      }

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
      return success(null, { message: 'Database reset successful' });
    } catch (error) {
      console.error('Reset API Error:', error);
      return handlePrismaErrorResponse(error);
    }
  }, { requireAdmin: true });
}
