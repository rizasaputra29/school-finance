import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/withAuthAppRouter';

// Types for Prisma v7
interface CashflowRecord {
  id: string;
  tanggal: Date;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
  kategori: string | null;
}

interface CashflowWhere {
  tanggal?: {
    gte: Date;
    lte: Date;
  };
  kodeAkun?: string;
  kategori?: string;
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
function getPeriodString(startDate?: Date, endDate?: Date): string {
  if (startDate && endDate) {
    const start = startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const end = endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${start} - ${end}`;
  }
  return '';
}

// Calculate opening balance from transactions before start date
async function calculateOpeningBalance(startDate: Date | null): Promise<number> {
  if (!startDate) return 0;

  const priorCashflows = await prisma.cashflow.findMany({
    where: {
      tanggal: { lt: startDate },
    },
  }) as CashflowRecord[];

  return priorCashflows.reduce((sum, cf) => sum + cf.debit - cf.kredit, 0);
}

// Export to PDF
async function exportToPDF(
  cashflows: CashflowRecord[],
  openingBalance: number,
  startDate?: Date,
  endDate?: Date
): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const currentDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const periodStr = getPeriodString(startDate, endDate);

  // Calculate running balance
  let runningBalance = openingBalance;
  const dataWithBalance = cashflows.map((cf) => {
    runningBalance = runningBalance + cf.debit - cf.kredit;
    return {
      ...cf,
      tanggal: cf.tanggal instanceof Date ? cf.tanggal : new Date(cf.tanggal),
      saldo: runningBalance,
    };
  });

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
    doc.text(periodStr ? `Periode: ${periodStr}` : `Per ${currentDate}`, pageWidth / 2, startY + 14, { align: 'center' });

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

  // Table styles
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

  const startY = addHeader('BUKU KAS');

  // Add opening balance
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Saldo Awal: ${formatCurrency(openingBalance)}`, 14, startY);

  const totalDebit = cashflows.reduce((sum, cf) => sum + cf.debit, 0);
  const totalKredit = cashflows.reduce((sum, cf) => sum + cf.kredit, 0);
  const saldoAkhir = openingBalance + totalDebit - totalKredit;

  // Main table
  autoTable(doc, {
    startY: startY + 5,
    head: [['No', 'Tanggal', 'Keterangan', 'Kode Akun', 'Debit (Rp)', 'Kredit (Rp)', 'Saldo (Rp)']],
    body: dataWithBalance.map((cf, i) => [
      (i + 1).toString(),
      cf.tanggal.toLocaleDateString('id-ID'),
      cf.keterangan,
      cf.kodeAkun,
      cf.debit > 0 ? formatCurrency(cf.debit) : '-',
      cf.kredit > 0 ? formatCurrency(cf.kredit) : '-',
      formatCurrency(cf.saldo),
    ]),
    foot: [
      ['', '', 'TOTAL', '', formatCurrency(totalDebit), formatCurrency(totalKredit), ''],
      ['', '', 'SALDO AKHIR', '', '', '', formatCurrency(saldoAkhir)],
    ],
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 25 },
      2: { cellWidth: 50 },
      3: { cellWidth: 20 },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
      6: { cellWidth: 35, halign: 'right' },
    },
  });

  const finalY = getLastAutoTableFinalY(doc) + 10;

  // Summary section
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, finalY, pageWidth - 14, finalY);

  addSignature(finalY + 15);

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

// Export to Excel
async function exportToExcel(
  cashflows: CashflowRecord[],
  openingBalance: number,
  startDate?: Date,
  endDate?: Date
): Promise<Buffer> {
  const periodStr = getPeriodString(startDate, endDate);
  const currentDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const workbook = XLSX.utils.book_new();

  // Calculate running balance
  let runningBalance = openingBalance;
  const dataWithBalance = cashflows.map((cf) => {
    runningBalance = runningBalance + cf.debit - cf.kredit;
    return {
      ...cf,
      tanggal: cf.tanggal instanceof Date ? cf.tanggal : new Date(cf.tanggal),
      saldo: runningBalance,
    };
  });

  const totalDebit = cashflows.reduce((sum, cf) => sum + cf.debit, 0);
  const totalKredit = cashflows.reduce((sum, cf) => sum + cf.kredit, 0);
  const saldoAkhir = openingBalance + totalDebit - totalKredit;

  const data = [
    ['BUKU KAS'],
    ['SEKOLAH'],
    [periodStr ? `Periode: ${periodStr}` : `Per ${currentDate}`],
    [''],
    ['No', 'Tanggal', 'Keterangan', 'Kode Akun', 'Debit (Rp)', 'Kredit (Rp)', 'Saldo (Rp)'],
    [''],
    ['Saldo Awal', '', '', '', '', '', formatCurrency(openingBalance)],
    [''],
    ...dataWithBalance.map((cf, i) => [
      i + 1,
      cf.tanggal.toLocaleDateString('id-ID'),
      cf.keterangan,
      cf.kodeAkun,
      cf.debit > 0 ? formatCurrency(cf.debit) : '-',
      cf.kredit > 0 ? formatCurrency(cf.kredit) : '-',
      formatCurrency(cf.saldo),
    ]),
    [''],
    ['', '', 'TOTAL', '', formatCurrency(totalDebit), formatCurrency(totalKredit), ''],
    ['', '', 'SALDO AKHIR', '', '', '', formatCurrency(saldoAkhir)],
    [''],
    [''],
    ['Dibuat oleh:', '', '', '', 'Diperiksa oleh:', '', ''],
    [''],
    [''],
    ['_______________', '', '', '', '_______________', '', ''],
    ['Bendahara', '', '', '', 'Kepala Sekolah', '', ''],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  sheet['!cols'] = [
    { wch: 5 },   // No
    { wch: 12 },  // Tanggal
    { wch: 40 },  // Keterangan
    { wch: 12 },  // Kode Akun
    { wch: 18 },  // Debit
    { wch: 18 },  // Kredit
    { wch: 20 },  // Saldo
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, 'Buku Kas');

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const query = getQueryParams(request);
      const { format, startDate, endDate, kodeAkun, kategori } = query;

      if (!format || !['pdf', 'excel'].includes(format)) {
        return NextResponse.json({ error: 'Format harus pdf atau excel' }, { status: 400 });
      }

      // Parse dates
      const startDateObj = startDate ? new Date(startDate) : undefined;
      const endDateObj = endDate ? new Date(endDate) : undefined;

      // Build where clause
      const where: CashflowWhere = {};
      if (startDateObj && endDateObj) {
        where.tanggal = {
          gte: startDateObj,
          lte: endDateObj,
        };
      }
      if (kodeAkun) {
        where.kodeAkun = kodeAkun;
      }
      if (kategori) {
        where.kategori = kategori;
      }

      // Get cashflows
      const cashflows = await prisma.cashflow.findMany({
        where,
        orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
      }) as CashflowRecord[];

      // Calculate opening balance
      const openingBalance = startDateObj ? await calculateOpeningBalance(startDateObj) : 0;

      let buffer: Buffer;
      let contentType: string;
      let filename: string;

      if (format === 'pdf') {
        buffer = await exportToPDF(cashflows, openingBalance, startDateObj, endDateObj);
        contentType = 'application/pdf';
        filename = `buku-kas-${new Date().toISOString().split('T')[0]}.pdf`;
      } else {
        buffer = await exportToExcel(cashflows, openingBalance, startDateObj, endDateObj);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `buku-kas-${new Date().toISOString().split('T')[0]}.xlsx`;
      }

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename=${filename}`,
        },
      });
    } catch (error) {
      console.error('Export Buku Kas error:', error);
      return NextResponse.json({ error: 'Gagal mengexport data' }, { status: 500 });
    }
  }, { requireAdmin: true });
}
