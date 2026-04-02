import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { 
  getIdempotencyResult, 
  setIdempotencyResult,
  getIdempotencyKeyFromRequest,
  isValidIdempotencyKey 
} from '@/lib/idempotency';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  // Check for idempotency key in headers
  const idempotencyKey = getIdempotencyKeyFromRequest(req);

  try {
    switch (req.method) {
      case 'PATCH': {
        // Check for idempotency - return cached result if same request
        if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
          const cachedResult = getIdempotencyResult(idempotencyKey);
          if (cachedResult !== null) {
            return res.status(200).json(cachedResult);
          }
        }

        const { tanggal, keterangan, kodeAkun, kategori, debit, kredit, status } = req.body;

        // Handle status update (approve/reject)
        if (status) {
          const validStatuses = ['draft', 'approved', 'posted', 'rejected'];
          if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Status tidak valid' });
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

            return res.status(200).json(result);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return res.status(400).json({ error: message });
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

          return res.status(200).json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return res.status(400).json({ error: message });
        }
      }

      case 'DELETE': {
        // Check for idempotency
        if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
          const cachedResult = getIdempotencyResult(idempotencyKey);
          if (cachedResult !== null) {
            return res.status(200).json(cachedResult);
          }
        }

        try {
          const result = await prisma.$transaction(async (tx) => {
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

            return { message: 'Transaksi berhasil dihapus' };
          });

          // Cache result for idempotency
          if (idempotencyKey) {
            setIdempotencyResult(idempotencyKey, result);
          }

          return res.status(200).json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return res.status(400).json({ error: message });
        }
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Cashflow API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });
