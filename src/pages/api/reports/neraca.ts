import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
  isContra: boolean;
}

const DEBIT_NORMAL_ACCOUNTS = ['Asset', 'Aset', 'Expense', 'Beban'];

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bulan, tahun } = req.query;

    let endDate = new Date();
    if (bulan && tahun) {
      const month = parseInt(bulan as string, 10);
      const year = parseInt(tahun as string, 10);
      endDate = new Date(year, month, 0, 23, 59, 59);
    } else if (tahun) {
      const year = parseInt(tahun as string, 10);
      endDate = new Date(year, 11, 31, 23, 59, 59);
    }

    const accounts = await prisma.account.findMany({
      where: {
        tipeAkun: { in: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] },
      },
      orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
    }) as AccountRecord[];

    // Use JournalEntryLine for proper accounting
    const lineTotals = await prisma.journalEntryLine.groupBy({
      by: ['kodeAkun'],
      _sum: { debit: true, kredit: true },
      where: {
        journalEntry: {
          tanggal: { lte: endDate },
          status: 'posted'
        }
      }
    });

    const accountMap = new Map<string, { debit: number; kredit: number }>();
    for (const line of lineTotals) {
      accountMap.set(line.kodeAkun, {
        debit: line._sum.debit || 0,
        kredit: line._sum.kredit || 0
      });
    }

    let calculatedLabaRugiAccumulated = 0;
    const netBalances = new Map<string, number>();

    // Calculate balances
    for (const account of accounts) {
      const movements = accountMap.get(account.kodeAkun) || { debit: 0, kredit: 0 };
      const isDebitNormal = DEBIT_NORMAL_ACCOUNTS.includes(account.tipeAkun);
      
      const netMovement = isDebitNormal ? (movements.debit - movements.kredit) : (movements.kredit - movements.debit);
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

    const totalEkuitas = ekuitasData.reduce((sum, item) => sum + item.jumlah, 0) + calculatedLabaRugiAccumulated;
    const totalLiabilitasEkuitas = totalKewajiban + totalEkuitas;
    const balanceDifference = totalAset - totalLiabilitasEkuitas;
    const isBalance = Math.abs(balanceDifference) < 0.01;

    return res.status(200).json({
      data: {
        aset: asetData,
        kewajiban: kewajibanData,
        ekuitas: [...ekuitasData, labaRugiItem],
      },
      summary: {
        totalAset,
        totalKewajiban,
        totalEkuitas,
        totalLiabilitasEkuitas,
        isBalance,
        balanceDifference,
      },
      filters: {
        bulan: bulan ? parseInt(bulan as string, 10) : null,
        tahun: tahun ? parseInt(tahun as string, 10) : null,
      },
    });
  } catch (error) {
    console.error('Neraca API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
