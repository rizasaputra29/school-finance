import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', startDate, endDate, kodeAkun, type, search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: Record<string, unknown> = {};
        if (startDate && endDate) {
          where.tanggal = {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          };
        }
        if (kodeAkun) {
          where.kodeAkun = kodeAkun;
        }
        
        // Filter by transaction type
        if (type === 'income') {
          where.debit = { gt: 0 };
        } else if (type === 'expense') {
          where.kredit = { gt: 0 };
        }
        
        // Search by keterangan or kodeAkun
        if (search) {
          where.OR = [
            { keterangan: { contains: search as string, mode: 'insensitive' } },
            { kodeAkun: { contains: search as string, mode: 'insensitive' } },
          ];
        }

        const [cashflows, total] = await Promise.all([
          prisma.cashflow.findMany({
            where,
            orderBy: { tanggal: 'desc' },
            skip,
            take: parseInt(limit as string),
          }),
          prisma.cashflow.count({ where }),
        ]);

        // Calculate summary for filtered data
        const allFiltered = await prisma.cashflow.findMany({ where });
        const totalDebit = allFiltered.reduce((sum: number, cf: { debit: number }) => sum + cf.debit, 0);
        const totalKredit = allFiltered.reduce((sum: number, cf: { kredit: number }) => sum + cf.kredit, 0);

        return res.status(200).json({
          data: cashflows,
          summary: {
            totalDebit,
            totalKredit,
            saldo: totalDebit - totalKredit,
          },
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            totalPages: Math.ceil(total / parseInt(limit as string)),
          },
        });
      }

      case 'POST': {
        const { tanggal, keterangan, kodeAkun, kategori, debit, kredit } = req.body;

        if (!tanggal || !keterangan || !kodeAkun) {
          return res.status(400).json({ error: 'Data tidak lengkap' });
        }

        console.log('Creating cashflow:', { tanggal, keterangan, kodeAkun, debit, kredit });

        const debitAmount = typeof debit === 'string' ? parseFloat(debit) : Number(debit) || 0;
        const kreditAmount = typeof kredit === 'string' ? parseFloat(kredit) : Number(kredit) || 0;

        try {
          const result = await prisma.$transaction(async (tx) => {
            // 1. Get the account to determine type and current balance
            const account = await tx.account.findUnique({
              where: { kodeAkun },
            });

            if (!account) {
              throw new Error(`Akun dengan kode ${kodeAkun} tidak ditemukan`);
            }

            // 2. Calculate balance adjustment based on account type
            let saldoChange = 0;
            const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);

            if (isDebitNormal) {
              saldoChange = debitAmount - kreditAmount;
            } else {
              saldoChange = kreditAmount - debitAmount;
            }

            // 3. Update account balance
            await tx.account.update({
              where: { kodeAkun },
              data: {
                saldo: { increment: saldoChange },
              },
            });

            // 4. Create cashflow record
            const cashflow = await tx.cashflow.create({
              data: {
                tanggal: new Date(tanggal),
                keterangan,
                kodeAkun,
                kategori: kategori || null,
                debit: debitAmount,
                kredit: kreditAmount,
              },
            });

            return cashflow;
          });

          return res.status(201).json(result);
        } catch (error: any) {
          console.error('Transaction error:', error);
          return res.status(400).json({ error: error.message });
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
