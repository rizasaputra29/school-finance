import type { NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { 
  getIdempotencyResult, 
  setIdempotencyResult,
  getIdempotencyKeyFromRequest,
  isValidIdempotencyKey 
} from '@/lib/idempotency';
import { invalidateAccountsCache } from '@/lib/cache';

// Type for account update request body
interface AccountUpdateBody {
  namaAkun?: string;
  tipeAkun?: string;
  saldo?: string | number;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    // Check for idempotency key in headers (for PATCH and DELETE)
    const idempotencyKey = getIdempotencyKeyFromRequest(req);
    
    switch (req.method) {
      case 'PATCH': {
        // Check for idempotency - return cached result if same request
        if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
          const cachedResult = getIdempotencyResult(idempotencyKey);
          if (cachedResult !== null) {
            return res.status(200).json(cachedResult);
          }
        }

        const { namaAkun, tipeAkun, saldo } = req.body as AccountUpdateBody;

        const data: Prisma.AccountUpdateInput = {};
        if (namaAkun) data.namaAkun = namaAkun;
        if (tipeAkun) data.tipeAkun = tipeAkun;
        if (saldo !== undefined) data.saldo = typeof saldo === 'string' ? parseFloat(saldo) : saldo;

        const updatedAccount = await prisma.account.update({
          where: { id },
          data,
        });

        // Cache result for idempotency
        if (idempotencyKey) {
          setIdempotencyResult(idempotencyKey, updatedAccount);
        }

        // Invalidate cache
        invalidateAccountsCache();

        return res.status(200).json(updatedAccount);
      }

      case 'DELETE': {
        // Check for idempotency
        if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
          const cachedResult = getIdempotencyResult(idempotencyKey);
          if (cachedResult !== null) {
            return res.status(200).json(cachedResult);
          }
        }

        // Cascade delete is now handled by database schema
        await prisma.account.delete({
          where: { id },
        });

        // Cache result for idempotency
        if (idempotencyKey) {
          setIdempotencyResult(idempotencyKey, { message: 'Account and related data deleted successfully' });
        }

        // Invalidate cache
        invalidateAccountsCache();

        return res.status(200).json({ message: 'Account and related data deleted successfully' });
      }

      default:
        res.setHeader('Allow', ['PATCH', 'DELETE']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('Account API Error:', error);
    // Prisma error P2025: Record to update not found.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
       return res.status(404).json({ error: 'Akun tidak ditemukan' });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
