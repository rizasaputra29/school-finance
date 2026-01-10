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

    if (type === 'laba-rugi') {
      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('LAPORAN LABA RUGI', pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Per ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth / 2, 28, { align: 'center' });

      const revenues = accounts.filter((a) => a.tipeAkun === 'Revenue');
      const expenses = accounts.filter((a) => a.tipeAkun === 'Expense');
      const totalRevenue = revenues.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalExpense = expenses.reduce((sum: number, a) => sum + a.saldo, 0);
      const labaRugi = totalRevenue - totalExpense;

      // Pendapatan
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PENDAPATAN', 14, 45);

      autoTable(doc, {
        startY: 50,
        head: [['Kode Akun', 'Nama Akun', 'Jumlah']],
        body: revenues.map((a) => [a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
        foot: [['', 'Total Pendapatan', formatCurrency(totalRevenue)]],
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        footStyles: { fillColor: [34, 197, 94], textColor: 255, fontStyle: 'bold' },
      });

      // Beban
      const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('BEBAN', 14, finalY1);

      autoTable(doc, {
        startY: finalY1 + 5,
        head: [['Kode Akun', 'Nama Akun', 'Jumlah']],
        body: expenses.map((a) => [a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
        foot: [['', 'Total Beban', formatCurrency(totalExpense)]],
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        footStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold' },
      });

      // Laba Rugi
      const finalY2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(labaRugi >= 0 ? 34 : 239, labaRugi >= 0 ? 197 : 68, labaRugi >= 0 ? 94 : 68);
      doc.text(`LABA/RUGI BERSIH: ${formatCurrency(labaRugi)}`, pageWidth / 2, finalY2, { align: 'center' });
    }

    if (type === 'neraca') {
      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('NERACA', pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Per ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth / 2, 28, { align: 'center' });

      const assets = accounts.filter((a) => a.tipeAkun === 'Asset');
      const liabilities = accounts.filter((a) => a.tipeAkun === 'Liability');
      const equity = accounts.filter((a) => a.tipeAkun === 'Equity');

      const totalAssets = assets.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalLiabilities = liabilities.reduce((sum: number, a) => sum + a.saldo, 0);
      const totalEquity = equity.reduce((sum: number, a) => sum + a.saldo, 0);

      // Aset
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('ASET', 14, 45);

      autoTable(doc, {
        startY: 50,
        head: [['Kode Akun', 'Nama Akun', 'Jumlah']],
        body: assets.map((a) => [a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
        foot: [['', 'Total Aset', formatCurrency(totalAssets)]],
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        footStyles: { fillColor: [34, 197, 94], textColor: 255, fontStyle: 'bold' },
      });

      // Kewajiban
      const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('KEWAJIBAN', 14, finalY1);

      autoTable(doc, {
        startY: finalY1 + 5,
        head: [['Kode Akun', 'Nama Akun', 'Jumlah']],
        body: liabilities.map((a) => [a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
        foot: [['', 'Total Kewajiban', formatCurrency(totalLiabilities)]],
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        footStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold' },
      });

      // Ekuitas
      const finalY2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('EKUITAS', 14, finalY2);

      autoTable(doc, {
        startY: finalY2 + 5,
        head: [['Kode Akun', 'Nama Akun', 'Jumlah']],
        body: equity.map((a) => [a.kodeAkun, a.namaAkun, formatCurrency(a.saldo)]),
        foot: [['', 'Total Ekuitas', formatCurrency(totalEquity)]],
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        footStyles: { fillColor: [147, 51, 234], textColor: 255, fontStyle: 'bold' },
      });
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
