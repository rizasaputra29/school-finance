import type { NextApiRequest, NextApiResponse } from 'next';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';

// Define types inline for Prisma v7 compatibility
interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
}

interface CashflowRecord {
  id: string;
  tanggal: Date;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type } = req.query;

    // Get all data
    const accounts = await prisma.account.findMany({
      orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
    }) as AccountRecord[];
    const cashflows = await prisma.cashflow.findMany({
      orderBy: { tanggal: 'desc' },
    }) as CashflowRecord[];

    const workbook = XLSX.utils.book_new();

    if (type === 'laba-rugi' || type === 'all') {
      // Laporan Laba Rugi
      const revenues = accounts.filter((a) => a.tipeAkun === 'Revenue');
      const expenses = accounts.filter((a) => a.tipeAkun === 'Expense');

      const totalRevenue = revenues.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalExpense = expenses.reduce((sum: number, a) => sum + a.saldo, 0);
      const labaRugi = totalRevenue - totalExpense;

      const labaRugiData = [
        ['LAPORAN LABA RUGI'],
        [''],
        ['PENDAPATAN'],
        ...revenues.map((a) => [a.kodeAkun, a.namaAkun, a.saldo]),
        ['', 'Total Pendapatan', totalRevenue],
        [''],
        ['BEBAN'],
        ...expenses.map((a) => [a.kodeAkun, a.namaAkun, a.saldo]),
        ['', 'Total Beban', totalExpense],
        [''],
        ['', 'LABA/RUGI BERSIH', labaRugi],
      ];

      const labaRugiSheet = XLSX.utils.aoa_to_sheet(labaRugiData);
      XLSX.utils.book_append_sheet(workbook, labaRugiSheet, 'Laba Rugi');
    }

    if (type === 'neraca' || type === 'all') {
      // Neraca
      const assets = accounts.filter((a) => a.tipeAkun === 'Asset');
      const liabilities = accounts.filter((a) => a.tipeAkun === 'Liability');
      const equity = accounts.filter((a) => a.tipeAkun === 'Equity');

      const totalAssets = assets.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalLiabilities = liabilities.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalEquity = equity.reduce((sum: number, a) => sum + a.saldo, 0);

      const neracaData = [
        ['NERACA'],
        [''],
        ['ASET'],
        ...assets.map((a) => [a.kodeAkun, a.namaAkun, a.saldo]),
        ['', 'Total Aset', totalAssets],
        [''],
        ['KEWAJIBAN'],
        ...liabilities.map((a) => [a.kodeAkun, a.namaAkun, a.saldo]),
        ['', 'Total Kewajiban', totalLiabilities],
        [''],
        ['EKUITAS'],
        ...equity.map((a) => [a.kodeAkun, a.namaAkun, a.saldo]),
        ['', 'Total Ekuitas', totalEquity],
        [''],
        ['', 'Total Kewajiban + Ekuitas', totalLiabilities + totalEquity],
      ];

      const neracaSheet = XLSX.utils.aoa_to_sheet(neracaData);
      XLSX.utils.book_append_sheet(workbook, neracaSheet, 'Neraca');
    }

    if (type === 'cashflow' || type === 'all') {
      // Cashflow Detail
      const cashflowData = [
        ['Tanggal', 'Keterangan', 'Kode Akun', 'Debit', 'Kredit'],
        ...cashflows.map((cf) => [
          new Date(cf.tanggal).toLocaleDateString('id-ID'),
          cf.keterangan,
          cf.kodeAkun,
          cf.debit,
          cf.kredit,
        ]),
      ];

      const cashflowSheet = XLSX.utils.aoa_to_sheet(cashflowData);
      XLSX.utils.book_append_sheet(workbook, cashflowSheet, 'Cashflow');
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=laporan-${type}-${new Date().toISOString().split('T')[0]}.xlsx`);

    return res.send(buffer);
  } catch (error) {
    console.error('Export Excel error:', error);
    return res.status(500).json({ error: 'Gagal mengexport data' });
  }
}
