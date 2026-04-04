import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { withAuthAppRouter, getQueryParams } from '@/lib/with-auth';

// Types for Prisma v7
interface BillingRecord {
  id: string;
  studentId: string;
  jenisBiaya: string;
  periodeBulan: string;
  jumlah: number;
  statusBayar: string;
  catatan: string | null;
  createdAt: Date;
  student: {
    id: string;
    nis: string;
    nama: string;
    kelas: string;
  };
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
function getPeriodString(periodeBulan?: string): string {
  if (!periodeBulan) return '';
  if (periodeBulan.includes('-')) {
    const [start, end] = periodeBulan.split('-');
    return `Periode: ${start} - ${end}`;
  }
  return `Periode: ${periodeBulan}`;
}

// Export to PDF
async function exportToPDF(
  billings: BillingRecord[],
  summary: { totalTagihan: number; totalLunas: number; totalBelumLunas: number; countLunas: number; countBelumLunas: number },
  periodeBulan?: string
): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const currentDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const periodStr = getPeriodString(periodeBulan);

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
    doc.text(periodStr || `Per ${currentDate}`, pageWidth / 2, startY + 14, { align: 'center' });

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

  const startY = addHeader('LAPORAN TAGIHAN SISWA (BILLING)');

  // Main table
  autoTable(doc, {
    startY: startY + 5,
    head: [['No', 'NIS', 'Nama', 'Kelas', 'Jenis Biaya', 'Periode', 'Jumlah (Rp)', 'Status']],
    body: billings.map((b, i) => [
      (i + 1).toString(),
      b.student.nis,
      b.student.nama,
      b.student.kelas,
      b.jenisBiaya,
      b.periodeBulan,
      formatCurrency(b.jumlah),
      b.statusBayar,
    ]),
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 40 },
      3: { cellWidth: 20 },
      4: { cellWidth: 30 },
      5: { cellWidth: 20 },
      6: { cellWidth: 30, halign: 'right' },
      7: { cellWidth: 25, halign: 'center' },
    },
  });

  // Summary
  const finalY = getLastAutoTableFinalY(doc) + 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('RINGKASAN', 14, finalY);

  autoTable(doc, {
    startY: finalY + 5,
    head: [['Total Tagihan', 'Total Lunas', 'Total Belum Lunas', 'Jml Lunas', 'Jml Belum Lunas']],
    body: [[
      formatCurrency(summary.totalTagihan),
      formatCurrency(summary.totalLunas),
      formatCurrency(summary.totalBelumLunas),
      summary.countLunas.toString(),
      summary.countBelumLunas.toString(),
    ]],
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 40, halign: 'right' },
      1: { cellWidth: 40, halign: 'right' },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 30, halign: 'center' },
      4: { cellWidth: 30, halign: 'center' },
    },
  });

  const finalY2 = getLastAutoTableFinalY(doc) + 10;
  addSignature(finalY2 + 15);

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
  billings: BillingRecord[],
  summary: { totalTagihan: number; totalLunas: number; totalBelumLunas: number; countLunas: number; countBelumLunas: number },
  periodeBulan?: string
): Promise<Buffer> {
  const periodStr = getPeriodString(periodeBulan);
  const currentDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const workbook = XLSX.utils.book_new();

  const data = [
    ['LAPORAN TAGIHAN SISWA (BILLING)'],
    ['SEKOLAH'],
    [periodStr || `Per ${currentDate}`],
    [''],
    ['No', 'NIS', 'Nama', 'Kelas', 'Jenis Biaya', 'Periode', 'Jumlah (Rp)', 'Status'],
    [''],
    ...billings.map((b, i) => [
      i + 1,
      b.student.nis,
      b.student.nama,
      b.student.kelas,
      b.jenisBiaya,
      b.periodeBulan,
      b.jumlah,
      b.statusBayar,
    ]),
    [''],
    ['', '', '', '', 'TOTAL TAGIHAN', '', summary.totalTagihan, ''],
    ['', '', '', '', 'TOTAL LUNAS', '', summary.totalLunas, ''],
    ['', '', '', '', 'TOTAL BELUM LUNAS', '', summary.totalBelumLunas, ''],
    ['', '', '', '', 'JUMLAH LUNAS', '', summary.countLunas, ''],
    ['', '', '', '', 'JUMLAH BELUM LUNAS', '', summary.countBelumLunas, ''],
    [''],
    [''],
    ['Dibuat oleh:', '', '', '', 'Diperiksa oleh:', '', '', ''],
    [''],
    [''],
    ['_______________', '', '', '', '_______________', '', '', ''],
    ['Bendahara', '', '', '', 'Kepala Sekolah', '', '', ''],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  sheet['!cols'] = [
    { wch: 5 },   // No
    { wch: 12 },  // NIS
    { wch: 25 },  // Nama
    { wch: 10 },  // Kelas
    { wch: 20 },  // Jenis Biaya
    { wch: 15 },  // Periode
    { wch: 18 },  // Jumlah
    { wch: 15 },  // Status
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, 'Billing');

  // Create summary sheet
  const summaryData = [
    ['RINGKASAN TAGIHAN SISWA'],
    [''],
    ['Total Tagihan', summary.totalTagihan],
    ['Total Lunas', summary.totalLunas],
    ['Total Belum Lunas', summary.totalBelumLunas],
    ['Jumlah Lunas', summary.countLunas],
    ['Jumlah Belum Lunas', summary.countBelumLunas],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan');

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const query = getQueryParams(request);
      const { format, periodeBulan, statusBayar, studentId, search } = query;

      if (!format || !['pdf', 'excel'].includes(format)) {
        return NextResponse.json({ error: 'Format harus pdf atau excel' }, { status: 400 });
      }

      // Build where clause
      const where: Record<string, unknown> = {};
      if (periodeBulan) where.periodeBulan = periodeBulan;
      if (statusBayar) where.statusBayar = statusBayar;
      if (studentId) where.studentId = studentId;
      if (search) {
        where.OR = [
          { student: { nama: { contains: search, mode: 'insensitive' } } },
          { student: { nis: { contains: search, mode: 'insensitive' } } },
          { jenisBiaya: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Get billings
      const billings = await prisma.billing.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              nis: true,
              nama: true,
              kelas: true,
            },
          },
        },
        orderBy: [{ periodeBulan: 'desc' }, { createdAt: 'desc' }],
      }) as BillingRecord[];

      // Calculate summary
      const totalTagihan = billings.reduce((sum, b) => sum + b.jumlah, 0);
      const lunasBillings = billings.filter(b => b.statusBayar === 'Lunas');
      const belumLunasBillings = billings.filter(b => b.statusBayar === 'Belum Lunas');
      const totalLunas = lunasBillings.reduce((sum, b) => sum + b.jumlah, 0);
      const totalBelumLunas = belumLunasBillings.reduce((sum, b) => sum + b.jumlah, 0);

      const summary = {
        totalTagihan,
        totalLunas,
        totalBelumLunas,
        countLunas: lunasBillings.length,
        countBelumLunas: belumLunasBillings.length,
      };

      let buffer: Buffer;
      let contentType: string;
      let filename: string;

      if (format === 'pdf') {
        buffer = await exportToPDF(billings, summary, periodeBulan);
        contentType = 'application/pdf';
        filename = `billing-${new Date().toISOString().split('T')[0]}.pdf`;
      } else {
        buffer = await exportToExcel(billings, summary, periodeBulan);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `billing-${new Date().toISOString().split('T')[0]}.xlsx`;
      }

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename=${filename}`,
        },
      });
    } catch (error) {
      console.error('Export Billing error:', error);
      return NextResponse.json({ error: 'Gagal mengexport data' }, { status: 500 });
    }
  }, { requireAdmin: true });
}
