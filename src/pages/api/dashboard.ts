import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

// Define types inline for Prisma v7 compatibility
interface CashflowRecord {
  id: string;
  tanggal: Date;
  keterangan: string;
  kodeAkun: string;
  debit: number;
  kredit: number;
  createdAt: Date;
  updatedAt: Date;
}

interface StudentRecord {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  tahunMasuk: number;
  statusBayar: string;
  totalTagihan: number;
  totalBayar: number;
  createdAt: Date;
  updatedAt: Date;
}

interface AccountRecord {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  saldo: number;
  createdAt: Date;
  updatedAt: Date;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Get date range for last 12 months (all data needed for client-side filtering)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    // Get cashflow data
    const cashflows = await prisma.cashflow.findMany({
      where: {
        tanggal: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { tanggal: 'asc' },
    }) as CashflowRecord[];

    // Calculate totals
    const totalDebit = cashflows.reduce((sum: number, cf) => sum + cf.debit, 0);
    const totalKredit = cashflows.reduce((sum: number, cf) => sum + cf.kredit, 0);
    const saldo = totalDebit - totalKredit;

    // Get student stats
    const students = await prisma.student.findMany() as StudentRecord[];
    const totalStudents = students.length;
    const lunasCount = students.filter((s) => s.statusBayar === 'Lunas').length;
    const belumLunasCount = totalStudents - lunasCount;

    // Get account distribution for pie chart
    const accounts = await prisma.account.findMany() as AccountRecord[];
    const accountDistribution = accounts
      .filter((a) => a.tipeAkun === 'Expense' && a.saldo > 0)
      .map((a) => ({
        name: a.namaAkun,
        value: a.saldo,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Get recent transactions
    const recentTransactions = await prisma.cashflow.findMany({
      orderBy: { tanggal: 'desc' },
      take: 5,
    });

    // Return raw cashflow data for client-side filtering
    return res.status(200).json({
      summary: {
        totalDebit,
        totalKredit,
        saldo,
        totalStudents,
        lunasCount,
        belumLunasCount,
      },
      cashflows: cashflows.map(cf => ({
        id: cf.id,
        tanggal: cf.tanggal,
        debit: cf.debit,
        kredit: cf.kredit,
      })),
      accountDistribution,
      recentTransactions,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
