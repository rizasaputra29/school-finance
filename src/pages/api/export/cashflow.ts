import type { NextApiResponse } from 'next';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

// Define types inline for Prisma v7 compatibility
interface CashflowRecord {
  id: string;
  tanggal: Date;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
  account?: {
    namaAkun: string;
  };
}

interface AccountRecord {
  kodeAkun: string;
  namaAkun: string;
}


async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse query params for filtering
    const { 
      startDate, 
      endDate, 
      kodeAkun, 
      type, 
      search,
      page = '1',
      limit = '1000',
    } = req.query;

    // Build Prisma query
    const where: Record<string, unknown> = {};
    
    // Date range filter
    if (startDate && endDate) {
      where.tanggal = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    } else if (startDate) {
      where.tanggal = {
        gte: new Date(startDate as string),
      };
    } else if (endDate) {
      where.tanggal = {
        lte: new Date(endDate as string),
      };
    }
    
    // Account filter
    if (kodeAkun) {
      where.kodeAkun = kodeAkun;
    }
    
    // Transaction type filter
    if (type === 'income') {
      where.debit = { gt: 0 };
    } else if (type === 'expense') {
      where.kredit = { gt: 0 };
    }
    
    // Search filter
    if (search) {
      where.OR = [
        { keterangan: { contains: search as string, mode: 'insensitive' } },
        { kodeAkun: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // Get pagination params
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Fetch cashflow data with account info
    const cashflows = await prisma.cashflow.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      skip,
      take: limitNum,
      include: {
        account: {
          select: {
            namaAkun: true,
          },
        },
      },
    }) as CashflowRecord[];

    // Get account map for namaAkun lookup
    const accounts = await prisma.account.findMany({
      select: {
        kodeAkun: true,
        namaAkun: true,
      },
    }) as AccountRecord[];
    
    const accountMap = new Map(accounts.map(a => [a.kodeAkun, a.namaAkun]));

    // Format data for Excel
    const excelData = cashflows.map((cf, index) => {
      const namaAkun = cf.account?.namaAkun || accountMap.get(cf.kodeAkun) || '';
      return {
        'No': index + 1 + skip,
        'Tanggal': new Date(cf.tanggal).toLocaleDateString('id-ID'),
        'Kode Akun': cf.kodeAkun,
        'Nama Akun': namaAkun,
        'Keterangan': cf.keterangan,
        'Debit (Rp)': cf.debit > 0 ? cf.debit : '',
        'Kredit (Rp)': cf.kredit > 0 ? cf.kredit : '',
      };
    });

    // Add totals row
    const totalDebit = cashflows.reduce((sum, cf) => sum + cf.debit, 0);
    const totalKredit = cashflows.reduce((sum, cf) => sum + cf.kredit, 0);
    
    if (excelData.length > 0) {
      excelData.push({
        'No': 0,
        'Tanggal': '',
        'Kode Akun': '',
        'Nama Akun': 'TOTAL',
        'Keterangan': '',
        'Debit (Rp)': totalDebit,
        'Kredit (Rp)': totalKredit,
      });
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
      ['LAPORAN BUKU KAS'],
      ['SEKOLAH'],
      [`Per ${currentDate}`],
      [],
    ];
    
    if (startDate || endDate) {
      const dateRange = [
        startDate ? new Date(startDate as string).toLocaleDateString('id-ID') : 'Awal',
        'sampai',
        endDate ? new Date(endDate as string).toLocaleDateString('id-ID') : 'Sekarang',
      ].join(' ');
      headerInfo.push([dateRange]);
      headerInfo.push([]);
    }

    // Create sheet
    const worksheet = XLSX.utils.aoa_to_sheet([
      ...headerInfo,
      ['No', 'Tanggal', 'Kode Akun', 'Nama Akun', 'Keterangan', 'Debit (Rp)', 'Kredit (Rp)'],
      ...excelData.map(row => [
        row['No'],
        row['Tanggal'],
        row['Kode Akun'],
        row['Nama Akun'],
        row['Keterangan'],
        row['Debit (Rp)'],
        row['Kredit (Rp)'],
      ]),
    ]);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },   // No
      { wch: 12 },  // Tanggal
      { wch: 12 },  // Kode Akun
      { wch: 25 },  // Nama Akun
      { wch: 40 },  // Keterangan
      { wch: 18 },  // Debit
      { wch: 18 },  // Kredit
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Buku Kas');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    const filename = `buku-kas-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    return res.send(buffer);
  } catch (error) {
    console.error('Export Cashflow error:', error);
    return res.status(500).json({ error: 'Gagal mengexport data Buku Kas' });
  }
}

export default withAuth(handler, { requireAdmin: true });
