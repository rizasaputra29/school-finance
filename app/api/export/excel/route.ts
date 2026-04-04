import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/with-auth';

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

// Helper to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const query = getQueryParams(request);
      const { type } = query;
      const currentDate = new Date().toLocaleDateString('id-ID', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });

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
          ['SEKOLAH'],
          [`Per ${currentDate}`],
          [''],
          ['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)'],
          [''],
          ['PENDAPATAN'],
          ...revenues.map((a, i) => [i + 1, a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
          ['', '', 'Total Pendapatan', formatCurrency(totalRevenue)],
          [''],
          ['BEBAN'],
          ...expenses.map((a, i) => [i + 1, a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
          ['', '', 'Total Beban', formatCurrency(totalExpense)],
          [''],
          ['', '', 'LABA/RUGI BERSIH', formatCurrency(labaRugi)],
          [''],
          [''],
          ['Dibuat oleh:', '', 'Diperiksa oleh:', ''],
          [''],
          [''],
          ['_______________', '', '_______________', ''],
          ['Bendahara', '', 'Kepala Sekolah', ''],
        ];

        const labaRugiSheet = XLSX.utils.aoa_to_sheet(labaRugiData);
        
        // Set column widths
        labaRugiSheet['!cols'] = [
          { wch: 5 },   // No
          { wch: 12 },  // Kode Akun
          { wch: 35 },  // Nama Akun
          { wch: 20 },  // Jumlah
        ];
        
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
          ['SEKOLAH'],
          [`Per ${currentDate}`],
          [''],
          ['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)'],
          [''],
          ['ASET'],
          ...assets.map((a, i) => [i + 1, a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
          ['', '', 'Total Aset', formatCurrency(totalAssets)],
          [''],
          ['KEWAJIBAN'],
          ...liabilities.map((a, i) => [i + 1, a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
          ['', '', 'Total Kewajiban', formatCurrency(totalLiabilities)],
          [''],
          ['EKUITAS'],
          ...equity.map((a, i) => [i + 1, a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
          ['', '', 'Total Ekuitas', formatCurrency(totalEquity)],
          [''],
          ['', '', 'Total Kewajiban + Ekuitas', formatCurrency(totalLiabilities + totalEquity)],
          [''],
          [''],
          ['Dibuat oleh:', '', 'Diperiksa oleh:', ''],
          [''],
          [''],
          ['_______________', '', '_______________', ''],
          ['Bendahara', '', 'Kepala Sekolah', ''],
        ];

        const neracaSheet = XLSX.utils.aoa_to_sheet(neracaData);
        
        // Set column widths
        neracaSheet['!cols'] = [
          { wch: 5 },   // No
          { wch: 12 },  // Kode Akun
          { wch: 35 },  // Nama Akun
          { wch: 20 },  // Jumlah
        ];
        
        XLSX.utils.book_append_sheet(workbook, neracaSheet, 'Neraca');
      }

      if (type === 'cashflow' || type === 'all') {
        // Calculate totals
        const totalDebit = cashflows.reduce((sum, cf) => sum + cf.debit, 0);
        const totalKredit = cashflows.reduce((sum, cf) => sum + cf.kredit, 0);
        const saldo = totalDebit - totalKredit;

        // Cashflow Detail
        const cashflowData = [
          ['LAPORAN ARUS KAS (CASHFLOW)'],
          ['SEKOLAH'],
          [`Per ${currentDate}`],
          [''],
          ['No', 'Tanggal', 'Keterangan', 'Kode Akun', 'Debit (Rp)', 'Kredit (Rp)'],
          ...cashflows.map((cf, i) => [
            i + 1,
            new Date(cf.tanggal).toLocaleDateString('id-ID'),
            cf.keterangan,
            cf.kodeAkun,
            cf.debit > 0 ? formatCurrency(cf.debit) : '-',
            cf.kredit > 0 ? formatCurrency(cf.kredit) : '-',
          ]),
          [''],
          ['', '', 'TOTAL', '', formatCurrency(totalDebit), formatCurrency(totalKredit)],
          ['', '', 'SALDO AKHIR', '', '', formatCurrency(saldo)],
          [''],
          [''],
          ['Dibuat oleh:', '', '', 'Diperiksa oleh:', '', ''],
          [''],
          [''],
          ['_______________', '', '', '_______________', '', ''],
          ['Bendahara', '', '', 'Kepala Sekolah', '', ''],
        ];

        const cashflowSheet = XLSX.utils.aoa_to_sheet(cashflowData);
        
        // Set column widths
        cashflowSheet['!cols'] = [
          { wch: 5 },   // No
          { wch: 12 },  // Tanggal
          { wch: 35 },  // Keterangan
          { wch: 12 },  // Kode Akun
          { wch: 18 },  // Debit
          { wch: 18 },  // Kredit
        ];
        
        XLSX.utils.book_append_sheet(workbook, cashflowSheet, 'Cashflow');
      }

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Return file download response
      const filename = `laporan-${type}-${new Date().toISOString().split('T')[0]}.xlsx`;
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename=${filename}`,
        },
      });
    } catch (error) {
      console.error('Export Excel error:', error);
      return NextResponse.json({ error: 'Gagal mengexport data' }, { status: 500 });
    }
  }, { requireAdmin: true });
}
