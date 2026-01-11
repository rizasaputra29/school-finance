import type { NextApiRequest, NextApiResponse } from 'next';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import prisma from '@/lib/prisma';

// Define types inline for Prisma v7 compatibility
interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
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
    const currentDate = new Date().toLocaleDateString('id-ID', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });

    // Get all data
    const accounts = await prisma.account.findMany({
      orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
    }) as AccountRecord[];

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Helper function to format currency
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(amount);
    };

    // Helper function to add header
    const addHeader = (title: string, startY: number = 15) => {
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, startY, { align: 'center' });
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('SEKOLAH', pageWidth / 2, startY + 7, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`Per ${currentDate}`, pageWidth / 2, startY + 14, { align: 'center' });
      
      // Line separator
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(14, startY + 18, pageWidth - 14, startY + 18);
      
      return startY + 25;
    };

    // Helper function to add signature section
    const addSignature = (startY: number) => {
      const y = startY + 15;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      // Left signature
      doc.text('Dibuat oleh,', 35, y);
      doc.text('___________________', 20, y + 25);
      doc.text('Bendahara', 35, y + 32);
      
      // Right signature  
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

    if (type === 'laba-rugi') {
      let startY = addHeader('LAPORAN LABA RUGI');

      const revenues = accounts.filter((a) => a.tipeAkun === 'Revenue');
      const expenses = accounts.filter((a) => a.tipeAkun === 'Expense');
      const totalRevenue = revenues.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalExpense = expenses.reduce((sum: number, a) => sum + a.saldo, 0);
      const labaRugi = totalRevenue - totalExpense;

      // Pendapatan section
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('PENDAPATAN', 14, startY);

      autoTable(doc, {
        startY: startY + 5,
        head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
        body: revenues.map((a, i) => [
          (i + 1).toString(), 
          a.kodeAkun, 
          a.namaAkun, 
          formatCurrency(a.saldo)
        ]),
        foot: [['', '', 'Total Pendapatan', formatCurrency(totalRevenue)]],
        ...tableStyles,
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 80 },
          3: { cellWidth: 40, halign: 'right' },
        },
      });

      // Beban section
      const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('BEBAN', 14, finalY1);

      autoTable(doc, {
        startY: finalY1 + 5,
        head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
        body: expenses.map((a, i) => [
          (i + 1).toString(), 
          a.kodeAkun, 
          a.namaAkun, 
          formatCurrency(a.saldo)
        ]),
        foot: [['', '', 'Total Beban', formatCurrency(totalExpense)]],
        ...tableStyles,
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 80 },
          3: { cellWidth: 40, halign: 'right' },
        },
      });

      // Laba Rugi summary
      const finalY2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(14, finalY2, pageWidth - 14, finalY2);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('LABA/RUGI BERSIH:', 14, finalY2 + 8);
      doc.text(formatCurrency(labaRugi), pageWidth - 14, finalY2 + 8, { align: 'right' });

      addSignature(finalY2 + 15);
    }

    if (type === 'neraca') {
      let startY = addHeader('NERACA');

      const assets = accounts.filter((a) => a.tipeAkun === 'Asset');
      const liabilities = accounts.filter((a) => a.tipeAkun === 'Liability');
      const equity = accounts.filter((a) => a.tipeAkun === 'Equity');

      const totalAssets = assets.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalLiabilities = liabilities.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalEquity = equity.reduce((sum: number, a) => sum + a.saldo, 0);

      // Aset section
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('ASET', 14, startY);

      autoTable(doc, {
        startY: startY + 5,
        head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
        body: assets.map((a, i) => [
          (i + 1).toString(), 
          a.kodeAkun, 
          a.namaAkun, 
          formatCurrency(a.saldo)
        ]),
        foot: [['', '', 'Total Aset', formatCurrency(totalAssets)]],
        ...tableStyles,
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 80 },
          3: { cellWidth: 40, halign: 'right' },
        },
      });

      // Kewajiban section
      const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('KEWAJIBAN', 14, finalY1);

      autoTable(doc, {
        startY: finalY1 + 5,
        head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
        body: liabilities.map((a, i) => [
          (i + 1).toString(), 
          a.kodeAkun, 
          a.namaAkun, 
          formatCurrency(a.saldo)
        ]),
        foot: [['', '', 'Total Kewajiban', formatCurrency(totalLiabilities)]],
        ...tableStyles,
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 80 },
          3: { cellWidth: 40, halign: 'right' },
        },
      });

      // Ekuitas section
      const finalY2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('EKUITAS', 14, finalY2);

      autoTable(doc, {
        startY: finalY2 + 5,
        head: [['No', 'Kode Akun', 'Nama Akun', 'Jumlah (Rp)']],
        body: equity.map((a, i) => [
          (i + 1).toString(), 
          a.kodeAkun, 
          a.namaAkun, 
          formatCurrency(a.saldo)
        ]),
        foot: [['', '', 'Total Ekuitas', formatCurrency(totalEquity)]],
        ...tableStyles,
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 80 },
          3: { cellWidth: 40, halign: 'right' },
        },
      });

      // Total summary
      const finalY3 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(14, finalY3, pageWidth - 14, finalY3);
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('TOTAL KEWAJIBAN + EKUITAS:', 14, finalY3 + 8);
      doc.text(formatCurrency(totalLiabilities + totalEquity), pageWidth - 14, finalY3 + 8, { align: 'right' });

      addSignature(finalY3 + 15);
    }

    // Generate buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    // Set headers for file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=laporan-${type}-${new Date().toISOString().split('T')[0]}.pdf`);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Export PDF error:', error);
    return res.status(500).json({ error: 'Gagal mengexport data' });
  }
}
