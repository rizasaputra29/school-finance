import type { NextApiResponse } from 'next';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
}

// Helper function to format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all accounts ordered by kodeAkun
    const accounts = await prisma.account.findMany({
      orderBy: { kodeAkun: 'asc' },
    }) as AccountRecord[];

    // Format data for Excel with required columns
    const excelRows = accounts.map((account, index) => [
      index + 1,
      account.kodeAkun,
      account.namaAkun,
      account.tipeAkun,
      account.saldo ? formatCurrency(account.saldo) : '',
    ]);

    // Add totals row
    const totalSaldo = accounts.reduce((sum, a) => sum + a.saldo, 0);
    
    if (excelRows.length > 0) {
      excelRows.push([
        '',
        '',
        'TOTAL',
        '',
        formatCurrency(totalSaldo),
      ]);
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Create header info
    const currentDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    
    const headerInfo = [
      ['LAPORAN DATA AKUN'],
      ['SEKOLAH'],
      [`Per ${currentDate}`],
      [],
    ];

    // Create sheet with header and data
    const worksheet = XLSX.utils.aoa_to_sheet([
      ...headerInfo,
      ['No', 'Kode Akun', 'Nama Akun', 'Tipe Akun', 'Saldo (Rp)'],
      ...excelRows,
    ]);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },   // No
      { wch: 15 },  // Kode Akun
      { wch: 30 },  // Nama Akun
      { wch: 15 },  // Tipe Akun
      { wch: 20 },  // Saldo
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Akun');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    const filename = `data-akun-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    return res.send(buffer);
  } catch (error) {
    console.error('Export Accounts error:', error);
    return res.status(500).json({ error: 'Gagal mengexport data Akun' });
  }
}

export default withAuth(handler, { requireAdmin: true });