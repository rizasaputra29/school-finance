import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { 
  getIdempotencyResult, 
  setIdempotencyResult,
  isValidIdempotencyKey 
} from '@/lib/idempotency';
import { success, errors, noContent, error } from '@/lib/api-response';
import { handlePrismaError } from '@/lib/prisma-errors';

/**
 * Helper to convert PrismaErrorResult to NextResponse
 */
function prismaErrorToResponse(err: unknown) {
  const prismaError = handlePrismaError(err);
  return error(prismaError.message, prismaError.code, { status: prismaError.status });
}

function getIdempotencyKeyFromNextRequest(req: NextRequest): string | null {
  const header = req.headers.get('x-idempotency-key');
  if (!header) return null;
  return header;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuthAppRouter(request, async () => {
    const { id } = await params;

    if (!id) {
      return errors.validation([{ field: 'id', message: 'ID tidak valid' }]);
    }

    // Check for idempotency key in headers
    const idempotencyKey = getIdempotencyKeyFromNextRequest(request);

    // Check for idempotency - return cached result if same request
    if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
      const cachedResult = getIdempotencyResult(idempotencyKey);
      if (cachedResult !== null) {
        return success(cachedResult, { message: 'Data berhasil diambil dari cache' });
      }
    }

    const body = await request.json();
    const { tanggal, keterangan, kodeAkun, kategori, debit, kredit, status } = body;

    // Handle status update (approve/reject)
    if (status) {
      const validStatuses = ['draft', 'approved', 'posted', 'rejected'];
      if (!validStatuses.includes(status)) {
        return errors.validation([{ 
          field: 'status', 
          message: `Status tidak valid. Status yang diperbolehkan: ${validStatuses.join(', ')}` 
        }]);
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          // Get existing cashflow
          const oldCashflow = await tx.cashflow.findUnique({
            where: { id },
          });

          if (!oldCashflow) {
            throw new Error('Transaksi tidak ditemukan');
          }

          // If changing to 'posted' or 'approved', update account balances
          if ((status === 'posted' || status === 'approved') && oldCashflow.status === 'draft') {
            const account = await tx.account.findUnique({
              where: { kodeAkun: oldCashflow.kodeAkun },
            });

            if (account) {
              let saldoChange = 0;
              const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);

              if (isDebitNormal) {
                saldoChange = oldCashflow.debit - oldCashflow.kredit;
              } else {
                saldoChange = oldCashflow.kredit - oldCashflow.debit;
              }

              await tx.account.update({
                where: { kodeAkun: oldCashflow.kodeAkun },
                data: { saldo: { increment: saldoChange } },
              });
            }
          }

          // Update cashflow status
          const updatedCashflow = await tx.cashflow.update({
            where: { id },
            data: { status },
          });

          return updatedCashflow;
        });

        if (idempotencyKey) {
          setIdempotencyResult(idempotencyKey, result);
        }

        return success(result, { message: `Status transaksi berhasil diubah menjadi ${status}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('tidak ditemukan')) {
          return errors.notFound('Transaksi');
        }
        return prismaErrorToResponse(error);
      }
    }

    const newDebit = parseFloat(debit) || 0;
    const newKredit = parseFloat(kredit) || 0;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Get existing cashflow
        const oldCashflow = await tx.cashflow.findUnique({
          where: { id },
        });

        if (!oldCashflow) {
          throw new Error('Transaksi tidak ditemukan');
        }

        // 2. Reverse effect on OLD Account
        const oldAccount = await tx.account.findUnique({
          where: { kodeAkun: oldCashflow.kodeAkun },
        });

        if (oldAccount) {
          let reverseChange = 0;
          const isDebitNormal = ['Asset', 'Expense'].includes(oldAccount.tipeAkun);

          // To reverse: subtract what was added
          // If Asset (Debit Normal): Balance = Balance + Debit - Kredit
          // Reverse: Balance = Balance - Debit + Kredit
          if (isDebitNormal) {
            reverseChange = oldCashflow.kredit - oldCashflow.debit;
          } else {
            // If Liability (Credit Normal): Balance = Balance + Kredit - Debit
            // Reverse: Balance = Balance - Kredit + Debit
            reverseChange = oldCashflow.debit - oldCashflow.kredit;
          }

          await tx.account.update({
            where: { kodeAkun: oldCashflow.kodeAkun },
            data: { saldo: { increment: reverseChange } },
          });
        }

        // 3. Apply effect on NEW Account
        const newAccount = await tx.account.findUnique({
          where: { kodeAkun },
        });

        if (!newAccount) {
          throw new Error(`Akun baru dengan kode ${kodeAkun} tidak ditemukan`);
        }

        let newChange = 0;
        const isNewDebitNormal = ['Asset', 'Expense'].includes(newAccount.tipeAkun);

        if (isNewDebitNormal) {
          newChange = newDebit - newKredit;
        } else {
          newChange = newKredit - newDebit;
        }

        await tx.account.update({
          where: { kodeAkun },
          data: { saldo: { increment: newChange } },
        });

        // 4. Update Cashflow
        const updatedCashflow = await tx.cashflow.update({
          where: { id },
          data: {
            tanggal: new Date(tanggal),
            keterangan,
            kodeAkun,
            kategori: kategori || null,
            debit: newDebit,
            kredit: newKredit,
          },
        });

        return updatedCashflow;
      });

      // Cache result for idempotency
      if (idempotencyKey) {
        setIdempotencyResult(idempotencyKey, result);
      }

      return success(result, { message: 'Transaksi berhasil diperbarui' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('tidak ditemukan')) {
        if (message.includes('Akun baru')) {
          return errors.notFound('Akun');
        }
        return errors.notFound('Transaksi');
      }
      return prismaErrorToResponse(error);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuthAppRouter(request, async () => {
    const { id } = await params;

    if (!id) {
      return errors.validation([{ field: 'id', message: 'ID tidak valid' }]);
    }

    // Check for idempotency
    const idempotencyKey = getIdempotencyKeyFromNextRequest(request);
    if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
      const cachedResult = getIdempotencyResult(idempotencyKey);
      if (cachedResult !== null) {
        return noContent();
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Get existing cashflow
        const cashflow = await tx.cashflow.findUnique({
          where: { id },
        });

        if (!cashflow) {
          throw new Error('Transaksi tidak ditemukan');
        }

        // 2. Reverse effect on Account
        const account = await tx.account.findUnique({
          where: { kodeAkun: cashflow.kodeAkun },
        });

        if (account) {
          let reverseChange = 0;
          const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);

          if (isDebitNormal) {
            reverseChange = cashflow.kredit - cashflow.debit;
          } else {
            reverseChange = cashflow.debit - cashflow.kredit;
          }

          await tx.account.update({
            where: { kodeAkun: cashflow.kodeAkun },
            data: { saldo: { increment: reverseChange } },
          });
        }

        // 3. Delete Cashflow
        await tx.cashflow.delete({
          where: { id },
        });
      });

      // Cache result for idempotency
      if (idempotencyKey) {
        setIdempotencyResult(idempotencyKey, { deleted: true, id });
      }

      return noContent();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('tidak ditemukan')) {
        return errors.notFound('Transaksi');
      }
      return prismaErrorToResponse(error);
    }
  });
}
