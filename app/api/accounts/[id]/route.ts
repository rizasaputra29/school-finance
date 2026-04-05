import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import {
  getIdempotencyResult,
  setIdempotencyResult,
  getIdempotencyKeyFromRequest,
  isValidIdempotencyKey
} from '@/lib/idempotency';
import { invalidateAccountsCache } from '@/lib/cache';
import { success, errors, noContent } from '@/lib/api-response';
import { handlePrismaError } from '@/lib/prisma-errors';

// Type for account update request body
interface AccountUpdateBody {
  namaAkun?: string;
  tipeAkun?: string;
  saldo?: string | number;
  allowNegative?: boolean;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuthAppRouter(request, async () => {
    try {
      const { id } = await params;

      // Task 32: System Account Protection - check isSystem before update
      // First, get the account to check if it's a system account
      const existingAccount = await prisma.account.findFirst({
        where: { OR: [{ id }, { kodeAkun: id }] },
      });

      if (existingAccount?.isSystem) {
        return errors.forbidden(
          `Akun ${existingAccount.kodeAkun} adalah akun sistem yang dilindungi. Tidak dapat mengubah akun ini.`
        );
      }

      // Check for idempotency key in headers (for PATCH)
      const headers: Record<string, string | string[] | undefined> = {};
      for (const [key, value] of request.headers.entries()) {
        headers[key] = value;
      }
      const idempotencyKey = getIdempotencyKeyFromRequest({ headers });

      // Check for idempotency - return cached result if same request
      if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
        const cachedResult = getIdempotencyResult(idempotencyKey);
        if (cachedResult !== null) {
          return success(cachedResult, {
            message: 'Account updated successfully (cached)',
          });
        }
      }

      const body: AccountUpdateBody = await request.json();
      const { namaAkun, tipeAkun, saldo } = body;

      const data: Prisma.AccountUpdateInput = {};
      if (namaAkun) data.namaAkun = namaAkun;

      // Task 32: Prevent changing account type for system accounts
      if (tipeAkun) {
        // Check if trying to change type (not allowed for any account with transactions)
        if (existingAccount && existingAccount.tipeAkun !== tipeAkun) {
          return errors.validation([{
            field: 'tipeAkun',
            message: 'Tidak dapat mengubah tipe akun. Akun dengan transaksi tidak bisa diganti tipe.',
          }]);
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

      return success(updatedAccount, {
        message: 'Account updated successfully',
      });
    } catch (error) {
      console.error('Account API Error:', error);
      // Prisma error P2025: Record to update not found.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return errors.notFound('Account');
      }
      const { message } = handlePrismaError(error);
      return errors.internal(message);
    }
  }, { requireAdmin: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuthAppRouter(request, async () => {
    try {
      const { id } = await params;

      // Task 32: System Account Protection - check isSystem before delete
      const accountToDelete = await prisma.account.findFirst({
        where: { OR: [{ id }, { kodeAkun: id }] },
      });

      if (accountToDelete?.isSystem) {
        return errors.forbidden(
          `Akun ${accountToDelete.kodeAkun} adalah akun sistem yang dilindungi. Tidak dapat menghapus akun ini.`
        );
      }

      // Check for idempotency
      const deleteHeaders: Record<string, string | string[] | undefined> = {};
      for (const [key, value] of request.headers.entries()) {
        deleteHeaders[key] = value;
      }
      const idempotencyKey = getIdempotencyKeyFromRequest({ headers: deleteHeaders });
      if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
        const cachedResult = getIdempotencyResult(idempotencyKey);
        if (cachedResult !== null) {
          return noContent();
        }
      }

      // Cascade delete is now handled by database schema
      await prisma.account.delete({
        where: { id },
      });

      // Cache result for idempotency
      if (idempotencyKey) {
        setIdempotencyResult(idempotencyKey, { deleted: true });
      }

      // Invalidate cache
      invalidateAccountsCache();

      // Return 204 No Content for DELETE
      return noContent();
    } catch (error) {
      console.error('Account API Error:', error);
      // Prisma error P2025: Record to update not found.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return errors.notFound('Account');
      }
      const { message } = handlePrismaError(error);
      return errors.internal(message);
    }
  }, { requireAdmin: true });
}
