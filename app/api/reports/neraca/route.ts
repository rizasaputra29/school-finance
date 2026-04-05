import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/with-auth';
import { success } from '@/lib/api-response';
import { handlePrismaErrorResponse } from '@/lib/prisma-errors';

interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
  isContra: boolean;
}

const DEBIT_NORMAL_ACCOUNTS = ['Asset', 'Aset', 'Expense', 'Beban'];

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const query = getQueryParams(request);
      const { bulan, tahun } = query;

      let endDate = new Date();
      if (bulan && tahun) {
        const month = parseInt(bulan, 10);
        const year = parseInt(tahun, 10);
        endDate = new Date(year, month, 0, 23, 59, 59);
      } else if (tahun) {
        const year = parseInt(tahun, 10);
        endDate = new Date(year, 11, 31, 23, 59, 59);
      }

      const accounts = (await prisma.account.findMany({
        where: {
          tipeAkun: { in: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] },
        },
        orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
      })) as AccountRecord[];

      // Use JournalEntryLine for proper accounting
      const lineTotals = await prisma.journalEntryLine.groupBy({
        by: ['kodeAkun'],
        _sum: { debit: true, kredit: true },
        where: {
          journalEntry: {
            tanggal: { lte: endDate },
            status: 'posted',
          },
        },
      });

      const accountMap = new Map<string, { debit: number; kredit: number }>();
      for (const line of lineTotals) {
        accountMap.set(line.kodeAkun, {
          debit: line._sum.debit || 0,
          kredit: line._sum.kredit || 0,
        });
      }

      let calculatedLabaRugiAccumulated = 0;
      const netBalances = new Map<string, number>();

      // Calculate balances
      for (const account of accounts) {
        const movements = accountMap.get(account.kodeAkun) || { debit: 0, kredit: 0 };
        const isDebitNormal = DEBIT_NORMAL_ACCOUNTS.includes(account.tipeAkun);

        const netMovement = isDebitNormal
          ? movements.debit - movements.kredit
          : movements.kredit - movements.debit;
        const totalBalance = account.saldo + netMovement;

        netBalances.set(account.kodeAkun, totalBalance);

        if (account.tipeAkun === 'Revenue') {
          calculatedLabaRugiAccumulated += totalBalance;
        } else if (account.tipeAkun === 'Expense') {
          calculatedLabaRugiAccumulated -= totalBalance;
        }
      }

      const assetAccounts = accounts.filter((a) => a.tipeAkun === 'Asset');
      const liabilityAccounts = accounts.filter((a) => a.tipeAkun === 'Liability');
      const equityAccounts = accounts.filter((a) => a.tipeAkun === 'Equity');

      const asetData = assetAccounts.map((account) => {
        const jumlah = netBalances.get(account.kodeAkun) || 0;
        return {
          kodeAkun: account.kodeAkun,
          namaAkun: account.namaAkun,
          jumlah: account.isContra ? -Math.abs(jumlah) : jumlah,
        };
      });

      const totalAset = asetData.reduce((sum, item) => sum + item.jumlah, 0);

      const kewajibanData = liabilityAccounts.map((account) => {
        const jumlah = netBalances.get(account.kodeAkun) || 0;
        return {
          kodeAkun: account.kodeAkun,
          namaAkun: account.namaAkun,
          jumlah,
        };
      });

      const totalKewajiban = kewajibanData.reduce((sum, item) => sum + item.jumlah, 0);

      const ekuitasData = equityAccounts.map((account) => {
        const jumlah = netBalances.get(account.kodeAkun) || 0;
        return {
          kodeAkun: account.kodeAkun,
          namaAkun: account.namaAkun,
          jumlah,
        };
      });

      const labaRugiItem = {
        kodeAkun: 'LABA_RUGI',
        namaAkun: 'Laba/Rugi Berjalan',
        jumlah: calculatedLabaRugiAccumulated,
      };

      const totalEkuitas =
        ekuitasData.reduce((sum, item) => sum + item.jumlah, 0) + calculatedLabaRugiAccumulated;
      const totalLiabilitasEkuitas = totalKewajiban + totalEkuitas;
      const balanceDifference = totalAset - totalLiabilitasEkuitas;
      const isBalance = Math.abs(balanceDifference) < 0.01;

      return success({
        aset: asetData,
        kewajiban: kewajibanData,
        ekuitas: [...ekuitasData, labaRugiItem],
      }, {
        message: 'Laporan neraca berhasil diambil',
        meta: {
          summary: {
            totalAset,
            totalKewajiban,
            totalEkuitas,
            totalLiabilitasEkuitas,
            isBalance,
            balanceDifference,
          },
          filters: {
            bulan: bulan ? parseInt(bulan, 10) : null,
            tahun: tahun ? parseInt(tahun, 10) : null,
          },
        },
      });
    } catch (error) {
      return handlePrismaErrorResponse(error);
    }
  });
}
