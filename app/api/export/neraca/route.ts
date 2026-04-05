import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/with-auth';
import { errors } from '@/lib/api-response';
import { handlePrismaErrorResponse } from '@/lib/prisma-errors';

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

interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable?: { finalY: number };
}

function getLastAutoTableFinalY(doc: jsPDF): number {
  const typedDoc = doc as JsPDFWithAutoTable;
  return typedDoc.lastAutoTable?.finalY ?? 0;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function getPeriodString(bulan?: string, tahun?: string): string {
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  if (bulan && tahun) {
    return `${monthNames[parseInt(bulan, 10) - 1]} ${tahun}`;
  } else if (tahun) {
    return `Tahun ${tahun}`;
  }
  return '';
}

function calculateAccountBalance(cashflows: CashflowRecord[], kodeAkun: string, accountType: string): number {
  const accountCashflows = cashflows.filter((cf) => cf.kodeAkun === kodeAkun);
  const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
  const totalKredit = accountCashflows.reduce((sum, cf) => sum + cf.kredit, 0);
  if (accountType === 'Asset') return totalDebit - totalKredit;
  if (accountType === 'Liability' || accountType === 'Equity') return totalKredit - totalDebit;
  return 0;
}

function calculateLabaRugi(cashflows: CashflowRecord[], accounts: AccountRecord[]): number {
  const revenueAccounts = accounts.filter((a) => a.tipeAkun === 'Revenue');
  const expenseAccounts = accounts.filter((a) => a.tipeAkun === 'Expense');
  const totalRevenue = revenueAccounts.reduce((sum, account) => sum + calculateAccountBalance(cashflows, account.kodeAkun, 'Revenue'), 0);
  const totalExpense = expenseAccounts.reduce((sum, account) => sum + calculateAccountBalance(cashflows, account.kodeAkun, 'Expense'), 0);
  return totalRevenue - totalExpense;
}

async function exportToPDF(cashflows: CashflowRecord[], accounts: AccountRecord[], bulan?: string, tahun?: string): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const currentDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const periodStr = getPeriodString(bulan, tahun);

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
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(14, startY + 18, pageWidth - 14, startY + 18);
    return startY + 25;
  };

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

  const tableStyles = {
    theme: 'plain' as const,
    headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontStyle: 'bold' as const, lineWidth: 0.3, lineColor: [0, 0, 0] as [number, number, number] },
    bodyStyles: { textColor: [0, 0, 0] as [number, number, number], lineWidth: 0.1, lineColor: [0, 0, 0] as [number, number, number] },
    footStyles: { fillColor: [240, 240, 240] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontStyle: 'bold' as const, lineWidth: 0.3, lineColor: [0, 0, 0] as [number, number, number] },
    alternateRowStyles: { fillColor: [250, 250, 250] as [number, number, number] },
    styles: { fontSize: 9, cellPadding: 3 },
  };

  const assetAccounts = accounts.filter((a) => a.tipeAkun === 'Asset');
  const liabilityAccounts = accounts.filter((a) => a.tipeAkun === 'Liability');
  const equityAccounts = accounts.filter((a) => a.tipeAkun === 'Equity');
  const labaRugi = calculateLabaRugi(cashflows, accounts);

  const asetData = assetAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Asset');
    const isAkumulasiPenyusutan = account.namaAkun.toLowerCase().includes('akumulasi') || account.namaAkun.toLowerCase().includes('penyusutan');
    return { kodeAkun: account.kodeAkun, namaAkun: account.namaAkun, jumlah: isAkumulasiPenyusutan ? -Math.abs(jumlah) : Math.max(0, jumlah) };
  });
  const totalAset = asetData.reduce((sum, item) => sum + item.jumlah, 0);

  const kewajibanData = liabilityAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Liability');
    return { kodeAkun: account.kodeAkun, namaAkun: account.namaAkun, jumlah: -Math.abs(jumlah) };
  });
  const totalKewajiban = kewajibanData.reduce((sum, item) => sum + item.jumlah, 0);

  const ekuitasData = equityAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Equity');
    return { kodeAkun: account.kodeAkun, namaAkun: account.namaAkun, jumlah };
  });
  const totalEkuitas = ekuitasData.reduce((sum, item) => sum + item.jumlah, 0) + labaRugi;

  const startY = addHeader('NERACA');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('ASET', 14, startY);

  autoTable(doc, {
    startY: startY + 5,
    head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
    body: asetData.map((a, i) => [(i + 1).toString(), a.kodeAkun, a.namaAkun, formatCurrency(a.jumlah)]),
    foot: [['', '', 'Total Aset', formatCurrency(totalAset)]],
    ...tableStyles,
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 25 }, 2: { cellWidth: 80 }, 3: { cellWidth: 40, halign: 'right' } },
  });

  const finalY1 = getLastAutoTableFinalY(doc) + 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('KEWAJIBAN', 14, finalY1);

  autoTable(doc, {
    startY: finalY1 + 5,
    head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
    body: kewajibanData.map((a, i) => [(i + 1).toString(), a.kodeAkun, a.namaAkun, formatCurrency(a.jumlah)]),
    foot: [['', '', 'Total Kewajiban', formatCurrency(totalKewajiban)]],
    ...tableStyles,
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 25 }, 2: { cellWidth: 80 }, 3: { cellWidth: 40, halign: 'right' } },
  });

  const finalY2 = getLastAutoTableFinalY(doc) + 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('EKUITAS', 14, finalY2);

  autoTable(doc, {
    startY: finalY2 + 5,
    head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
    body: [...ekuitasData.map((a, i) => [(i + 1).toString(), a.kodeAkun, a.namaAkun, formatCurrency(a.jumlah)]), ['', '', 'Laba/Rugi Berjalan', formatCurrency(labaRugi)]],
    foot: [['', '', 'Total Ekuitas', formatCurrency(totalEkuitas)]],
    ...tableStyles,
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 25 }, 2: { cellWidth: 80 }, 3: { cellWidth: 40, halign: 'right' } },
  });

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

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

async function exportToExcel(cashflows: CashflowRecord[], accounts: AccountRecord[], bulan?: string, tahun?: string): Promise<Buffer> {
  const periodStr = getPeriodString(bulan, tahun);
  const currentDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const workbook = XLSX.utils.book_new();

  const assetAccounts = accounts.filter((a) => a.tipeAkun === 'Asset');
  const liabilityAccounts = accounts.filter((a) => a.tipeAkun === 'Liability');
  const equityAccounts = accounts.filter((a) => a.tipeAkun === 'Equity');
  const labaRugi = calculateLabaRugi(cashflows, accounts);

  const asetData = assetAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Asset');
    const isAkumulasiPenyusutan = account.namaAkun.toLowerCase().includes('akumulasi') || account.namaAkun.toLowerCase().includes('penyusutan');
    return { kodeAkun: account.kodeAkun, namaAkun: account.namaAkun, jumlah: isAkumulasiPenyusutan ? -Math.abs(jumlah) : Math.max(0, jumlah) };
  });
  const totalAset = asetData.reduce((sum, item) => sum + item.jumlah, 0);

  const kewajibanData = liabilityAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Liability');
    return { kodeAkun: account.kodeAkun, namaAkun: account.namaAkun, jumlah: -Math.abs(jumlah) };
  });
  const totalKewajiban = kewajibanData.reduce((sum, item) => sum + item.jumlah, 0);

  const ekuitasData = equityAccounts.map((account) => {
    const jumlah = calculateAccountBalance(cashflows, account.kodeAkun, 'Equity');
    return { kodeAkun: account.kodeAkun, namaAkun: account.namaAkun, jumlah };
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
  sheet['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Neraca');

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const query = getQueryParams(request);
      const { format, bulan, tahun } = query;

      if (!format || !['pdf', 'excel'].includes(format)) {
        return errors.validation([{ field: 'format', message: 'Format harus pdf atau excel' }]);
      }

      const cashflowWhere: Record<string, unknown> = {};
      if (bulan && tahun) {
        const month = parseInt(bulan, 10);
        const year = parseInt(tahun, 10);
        cashflowWhere.tanggal = { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0, 23, 59, 59) };
      } else if (tahun) {
        const year = parseInt(tahun, 10);
        cashflowWhere.tanggal = { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) };
      }

      const cashflows = await prisma.cashflow.findMany({ where: cashflowWhere, orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }] }) as CashflowRecord[];
      const accounts = await prisma.account.findMany({ orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }] }) as AccountRecord[];

      let buffer: Buffer;
      let contentType: string;
      let filename: string;

      if (format === 'pdf') {
        buffer = await exportToPDF(cashflows, accounts, bulan, tahun);
        contentType = 'application/pdf';
        filename = `neraca-${new Date().toISOString().split('T')[0]}.pdf`;
      } else {
        buffer = await exportToExcel(cashflows, accounts, bulan, tahun);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `neraca-${new Date().toISOString().split('T')[0]}.xlsx`;
      }

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename=${filename}` },
      });
    } catch (error) {
      console.error('Export Neraca error:', error);
      return handlePrismaErrorResponse(error);
    }
  }, { requireAdmin: true });
}
