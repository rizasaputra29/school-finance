import type { NextApiResponse } from 'next';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

// Types for Prisma v7
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
  kodeAkun: string;
  debit: number;
  kredit: number;
}

// Proper type for jsPDF with autotable plugin
interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

// Helper to get lastAutoTable finalY with fallback
function getLastAutoTableFinalY(doc: jsPDF): number {
  const typedDoc = doc as JsPDFWithAutoTable;
  return typedDoc.lastAutoTable?.finalY ?? 0;
}

// Helper to format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

// Helper to get period string
function getPeriodString(bulan?: string | string[], tahun?: string | string[]): string {
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  if (bulan && tahun) {
    const monthIdx = parseInt(bulan as string, 10) - 1;
    return `${monthNames[monthIdx]} ${tahun}`;
  } else if (tahun) {
    return `Tahun ${tahun}`;
  }
  return '';
}

/**
 * Calculate account balance from cashflows for a given period
 */
function calculateAccountBalance(
  cashflows: CashflowRecord[],
  kodeAkun: string,
  accountType: string
): number {
  const accountCashflows = cashflows.filter((cf) => cf.kodeAkun === kodeAkun);
  const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
  const totalKredit = accountCashflows.reduce((sum, cf) => sum + cf.kredit, 0);

  if (accountType === 'Asset') {
    return totalDebit - totalKredit;
  } else if (accountType === 'Liability' || accountType === 'Equity') {
    return totalKredit - totalDebit;
  }

  return 0;
}

/**
 * Calculate current period profit/loss (Laba/Rugi)
 */
function calculateLabaRugi(
  cashflows: CashflowRecord[],
  accounts: AccountRecord[]
): number {
  const revenueAccounts = accounts.filter((a) => a.tipeAkun === 'Revenue');
  const expenseAccounts = accounts.filter((a) => a.tipeAkun === 'Expense');

  const totalRevenue = revenueAccounts.reduce((sum, account) => {
    return sum + calculateAccountBalance(cashflows, account.kodeAkun, 'Revenue');
  }, 0);

  const totalExpense = expenseAccounts.reduce((sum, account) => {
    return sum + calculateAccountBalance(cashflows, account.kodeAkun, 'Expense');
  }, 0);

  return totalRevenue - totalExpense;
}

// Export handlers
async function exportToPDF(
  cashflows: CashflowRecord[],
  accounts: AccountRecord[],
  bulan?: string | string[],
  tahun?: string | string[]
): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const currentDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const periodStr = getPeriodString(bulan, tahun);

  // Helper function to add header
  const addHeader = (title: string, startY: number = 15): number => {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, startY, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('SEKOLAH', pageWidth / 2, startY + 7, { align: 'center' });

    doc.setFontSize(10);
    doc.text(periodStr ? `Per ${periodStr}` : `Per ${currentDate}`, pageWidth / 2, startY + 14, { align: 'center' });

    // Line separator
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(14, startY + 18, pageWidth - 14, startY + 18);

    return startY + 25;
  };

  // Helper function to add signature section
  const addSignature = (startY: number): void => {
    const y = startY + 15;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    doc.text('Dibuat oleh,', 35, y);
    doc.text('___________________', 20, y + 25);
    doc.text('Bendahara', 35, y + 32);

    doc.text('Diperiksa oleh,', pageWidth - 60, y);
    doc.text('___________________', pageWidth - 75, y + 25);
    doc.text('Kepala Sekolah', pageWidth - 60, y + 32);
  };

  // Table styles - formal black and white
  const tableStyles = {
    theme: 'plain' as const,
    headStyles: {
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: 'bold' as const,
      lineWidth: 0.3,
      lineColor: [0, 0, 0] as [number, number, number],
    },
    bodyStyles: {
      textColor: [0, 0, 0] as [number, number, number],
      lineWidth: 0.1,
      lineColor: [0, 0, 0] as [number, number, number],
    },
    footStyles: {
      fillColor: [240, 240, 240] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: 'bold' as const,
      lineWidth: 0.3,
      lineColor: [0, 0, 0] as [number, number, number],
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250] as [number, number, number],
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
  };

  // Get account type groups
  const assetAccounts = accounts.filter((a) => a.tipeAkun === 'Asset');
  const liabilityAccounts = accounts.filter((a) => a.tipeAkun === 'Liability');
  const equityAccounts = accounts.filter((a) => a.tipeAkun === 'Equity');

  // Calculate current period profit/loss
  const labaRugi = calculateLabaRugi(cashflows, accounts);

  // Calculate Aset (Asset) items
  const asetData = assetAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Asset');

    // Check if this is Akumulasi Penyusutan (contra-asset)
    const isAkumulasiPenyusutan =
      account.namaAkun.toLowerCase().includes('akumulasi') ||
      account.namaAkun.toLowerCase().includes('penyusutan');

    return {
      kodeAkun: account.kodeAkun,
      namaAkun: account.namaAkun,
      jumlah: isAkumulasiPenyusutan ? -Math.abs(jumlah) : Math.max(0, jumlah),
    };
  });

  const totalAset = asetData.reduce((sum, item) => sum + item.jumlah, 0);

  // Calculate Kewajiban (Liability) items - shown as negative
  const kewajibanData = liabilityAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Liability');
    return {
      kodeAkun: account.kodeAkun,
      namaAkun: account.namaAkun,
      jumlah: -Math.abs(jumlah),
    };
  });

  const totalKewajiban = kewajibanData.reduce((sum, item) => sum + item.jumlah, 0);

  // Calculate Ekuitas (Equity) items
  const ekuitasData = equityAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Equity');
    return {
      kodeAkun: account.kodeAkun,
      namaAkun: account.namaAkun,
      jumlah,
    };
  });

  // Add Laba/Rugi as separate line item in Ekuitas
  const totalEkuitas = ekuitasData.reduce((sum, item) => sum + item.jumlah, 0) + labaRugi;

  const startY = addHeader('NERACA');

  // Aset section
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('ASET', 14, startY);

  autoTable(doc, {
    startY: startY + 5,
    head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
    body: asetData.map((a, i) => [
      (i + 1).toString(),
      a.kodeAkun,
      a.namaAkun,
      formatCurrency(a.jumlah),
    ]),
    foot: [['', '', 'Total Aset', formatCurrency(totalAset)]],
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 25 },
      2: { cellWidth: 80 },
      3: { cellWidth: 40, halign: 'right' },
    },
  });

  // Kewajiban section
  const finalY1 = getLastAutoTableFinalY(doc) + 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('KEWAJIBAN', 14, finalY1);

  autoTable(doc, {
    startY: finalY1 + 5,
    head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
    body: kewajibanData.map((a, i) => [
      (i + 1).toString(),
      a.kodeAkun,
      a.namaAkun,
      formatCurrency(a.jumlah),
    ]),
    foot: [['', '', 'Total Kewajiban', formatCurrency(totalKewajiban)]],
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 25 },
      2: { cellWidth: 80 },
      3: { cellWidth: 40, halign: 'right' },
    },
  });

  // Ekuitas section
  const finalY2 = getLastAutoTableFinalY(doc) + 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('EKUITAS', 14, finalY2);

  autoTable(doc, {
    startY: finalY2 + 5,
    head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
    body: [
      ...ekuitasData.map((a, i) => [
        (i + 1).toString(),
        a.kodeAkun,
        a.namaAkun,
        formatCurrency(a.jumlah),
      ]),
      ['', '', 'Laba/Rugi Berjalan', formatCurrency(labaRugi)],
    ],
    foot: [['', '', 'Total Ekuitas', formatCurrency(totalEkuitas)]],
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 25 },
      2: { cellWidth: 80 },
      3: { cellWidth: 40, halign: 'right' },
    },
  });

  // Total summary
  const finalY3 = getLastAutoTableFinalY(doc) + 8;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, finalY3, pageWidth - 14, finalY3);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TOTAL KEWAJIBAN + EKUITAS:', 14, finalY3 + 8);
  doc.text(formatCurrency(totalKewajiban + totalEkuitas), pageWidth - 14, finalY3 + 8, { align: 'right' });

  addSignature(finalY3 + 15);

  // Add page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

async function exportToExcel(
  cashflows: CashflowRecord[],
  accounts: AccountRecord[],
  bulan?: string | string[],
  tahun?: string | string[]
): Promise<Buffer> {
  const periodStr = getPeriodString(bulan, tahun);
  const currentDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const workbook = XLSX.utils.book_new();

  // Get account type groups
  const assetAccounts = accounts.filter((a) => a.tipeAkun === 'Asset');
  const liabilityAccounts = accounts.filter((a) => a.tipeAkun === 'Liability');
  const equityAccounts = accounts.filter((a) => a.tipeAkun === 'Equity');

  // Calculate current period profit/loss
  const labaRugi = calculateLabaRugi(cashflows, accounts);

  // Calculate Aset (Asset) items
  const asetData = assetAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Asset');
    const isAkumulasiPenyusutan =
      account.namaAkun.toLowerCase().includes('akumulasi') ||
      account.namaAkun.toLowerCase().includes('penyusutan');
    return {
      kodeAkun: account.kodeAkun,
      namaAkun: account.namaAkun,
      jumlah: isAkumulasiPenyusutan ? -Math.abs(jumlah) : Math.max(0, jumlah),
    };
  });

  const totalAset = asetData.reduce((sum, item) => sum + item.jumlah, 0);

  // Calculate Kewajiban (Liability) items
  const kewajibanData = liabilityAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Liability');
    return {
      kodeAkun: account.kodeAkun,
      namaAkun: account.namaAkun,
      jumlah: -Math.abs(jumlah),
    };
  });

  const totalKewajiban = kewajibanData.reduce((sum, item) => sum + item.jumlah, 0);

  // Calculate Ekuitas (Equity) items
  const ekuitasData = equityAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Equity');
    return {
      kodeAkun: account.kodeAkun,
      namaAkun: account.namaAkun,
      jumlah,
    };
  });

  const totalEkuitas = ekuitasData.reduce((sum, item) => sum + item.jumlah, 0) + labaRugi;

  const data = [
    ['NERACA'],
    ['SEKOLAH'],
    [periodStr ? `Per ${periodStr}` : `Per ${currentDate}`],
    [''],
    ['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)'],
    [''],
    ['ASET'],
    ...asetData.map((a, i) => [i + 1, a.kodeAkun, a.namaAkun, formatCurrency(a.jumlah)]),
    ['', '', 'Total Aset', formatCurrency(totalAset)],
    [''],
    ['KEWAJIBAN'],
    ...kewajibanData.map((a, i) => [i + 1, a.kodeAkun, a.namaAkun, formatCurrency(a.jumlah)]),
    ['', '', 'Total Kewajiban', formatCurrency(totalKewajiban)],
    [''],
    ['EKUITAS'],
    ...ekuitasData.map((a, i) => [i + 1, a.kodeAkun, a.namaAkun, formatCurrency(a.jumlah)]),
    ['', '', 'Laba/Rugi Berjalan', formatCurrency(labaRugi)],
    ['', '', 'Total Ekuitas', formatCurrency(totalEkuitas)],
    [''],
    ['', '', 'Total Kewajiban + Ekuitas', formatCurrency(totalKewajiban + totalEkuitas)],
    [''],
    [''],
    ['Dibuat oleh:', '', 'Diperiksa oleh:', ''],
    [''],
    [''],
    ['_______________', '', '_______________', ''],
    ['Bendahara', '', 'Kepala Sekolah', ''],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  sheet['!cols'] = [
    { wch: 5 },   // No
    { wch: 12 },  // Kode Akun
    { wch: 35 },  // Nama Akun
    { wch: 20 },  // Jumlah
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, 'Neraca');

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { format, bulan, tahun } = req.query;

    if (!format || !['pdf', 'excel'].includes(format as string)) {
      return res.status(400).json({ error: 'Format harus pdf atau excel' });
    }

    // Build date filter
    const cashflowWhere: Record<string, unknown> = {};
    if (bulan && tahun) {
      const month = parseInt(bulan as string, 10);
      const year = parseInt(tahun as string, 10);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      cashflowWhere.tanggal = { gte: startDate, lte: endDate };
    } else if (tahun) {
      const year = parseInt(tahun as string, 10);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      cashflowWhere.tanggal = { gte: startDate, lte: endDate };
    }

    // Get cashflows for period
    const cashflows = await prisma.cashflow.findMany({
      where: cashflowWhere,
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    }) as CashflowRecord[];

    // Get all accounts
    const accounts = await prisma.account.findMany({
      orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
    }) as AccountRecord[];

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'pdf') {
      buffer = await exportToPDF(cashflows, accounts, bulan as string, tahun as string);
      contentType = 'application/pdf';
      filename = `neraca-${new Date().toISOString().split('T')[0]}.pdf`;
    } else {
      buffer = await exportToExcel(cashflows, accounts, bulan as string, tahun as string);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `neraca-${new Date().toISOString().split('T')[0]}.xlsx`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    return res.send(buffer);
  } catch (error) {
    console.error('Export Neraca error:', error);
    return res.status(500).json({ error: 'Gagal mengexport data' });
  }
}

export default withAuth(handler, { requireAdmin: true });
