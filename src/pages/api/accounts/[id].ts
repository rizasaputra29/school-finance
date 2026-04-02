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
  allowNegative?: boolean;
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
        // Task 32: System Account Protection - check isSystem before update
        // First, get the account to check if it's a system account
        const existingAccount = await prisma.account.findFirst({
          where: { OR: [{ id }, { kodeAkun: id }] },
        });

        if (existingAccount?.isSystem) {
          return res.status(403).json({
            error: `Akun ${existingAccount.kodeAkun} adalah akun sistem yang dilindungi. Tidak dapat mengubah akun ini.`,
            code: 'SYSTEM_ACCOUNT_PROTECTED',
          });
        }

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
        
        // Task 32: Prevent changing account type for system accounts
        if (tipeAkun) {
          // Check if trying to change type (not allowed for any account with transactions)
          if (existingAccount && existingAccount.tipeAkun !== tipeAkun) {
            return res.status(422).json({
              error: 'Tidak dapat mengubah tipe akun. Akun dengan transaksi tidak bisa更换类型.',
              code: 'TYPE_CHANGE_NOT_ALLOWED',
            });
          }
          data.tipeAkun = tipeAkun;
        }
        
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
        // Task 32: System Account Protection - check isSystem before delete
        const accountToDelete = await prisma.account.findFirst({
          where: { OR: [{ id }, { kodeAkun: id }] },
        });

        if (accountToDelete?.isSystem) {
          return res.status(403).json({
            error: `Akun ${accountToDelete.kodeAkun} adalah akun sistem yang dilindungi. Tidak dapat menghapus akun ini.`,
            code: 'SYSTEM_ACCOUNT_PROTECTED',
          });
        }

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
