import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

// Type for piutang item
interface PiutangAgingItem {
  id: string;
  studentId: string;
  student: {
    nis: string;
    nama: string;
    kelas: string;
  };
  billing: {
    id: string;
    jenisBiaya: string;
    periodeBulan: string;
    jumlah: number;
  } | null;
  cicilanKe: number | null;
  jumlah: number;
  tanggalJatuhTempo: Date;
  hariTerlambat: number;
  aging: string;
}

// Calculate days overdue
function calculateDaysOverdue(tanggalJatuhTempo: Date): number {
  const now = new Date();
  const dueDate = new Date(tanggalJatuhTempo);
  const diffTime = now.getTime() - dueDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Determine aging category
function getAgingCategory(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'Belum Jatuh Tempo';
  if (daysOverdue <= 30) return '1-30 hari';
  if (daysOverdue <= 60) return '31-60 hari';
  if (daysOverdue <= 90) return '61-90 hari';
  return '90+ hari';
}


// Format currency
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse query params
    const { studentId, kelas, aging } = req.query;

    // Build where clause for installments (piutang)
    const where: Record<string, unknown> = {
      status: { in: ['Belum Bayar', 'Jatuh Tempo'] },
      tanggalJatuhTempo: { lt: new Date() },
    };

    if (studentId) {
      where.studentId = studentId;
    }

    if (kelas) {
      where.student = { kelas: kelas as string };
    }

    // Get overdue installments as piutang
    const installments = await prisma.installment.findMany({
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
        billing: {
          select: {
            id: true,
            jenisBiaya: true,
            periodeBulan: true,
            jumlah: true,
          },
        },
      },
      orderBy: [
        { student: { nama: 'asc' } },
        { tanggalJatuhTempo: 'asc' },
      ],
    });

    // Transform to piutang items with aging info
    const piutangItems: PiutangAgingItem[] = installments.map((inst) => {
      const hariTerlambat = calculateDaysOverdue(inst.tanggalJatuhTempo);
      return {
        id: inst.id,
        studentId: inst.studentId,
        student: {
          nis: inst.student.nis,
          nama: inst.student.nama,
          kelas: inst.student.kelas,
        },
        billing: inst.billing
          ? {
              id: inst.billing.id,
              jenisBiaya: inst.billing.jenisBiaya,
              periodeBulan: inst.billing.periodeBulan,
              jumlah: inst.billing.jumlah,
            }
          : null,
        cicilanKe: inst.cicilanKe,
        jumlah: inst.jumlah,
        tanggalJatuhTempo: inst.tanggalJatuhTempo,
        hariTerlambat: Math.max(0, hariTerlambat),
        aging: getAgingCategory(hariTerlambat),
      };
    });

    // Filter by aging if specified
    let filteredItems = piutangItems;
    if (aging) {
      filteredItems = piutangItems.filter((item) => item.aging === aging);
    }

    // Calculate summary by aging category
    const summary = {
      totalPiutang: piutangItems.reduce((sum, item) => sum + item.jumlah, 0),
      belumJatuhTempo: piutangItems
        .filter((item) => item.hariTerlambat <= 0)
        .reduce((sum, item) => sum + item.jumlah, 0),
      aging30: piutangItems
        .filter((item) => item.hariTerlambat > 0 && item.hariTerlambat <= 30)
        .reduce((sum, item) => sum + item.jumlah, 0),
      aging60: piutangItems
        .filter((item) => item.hariTerlambat > 30 && item.hariTerlambat <= 60)
        .reduce((sum, item) => sum + item.jumlah, 0),
      aging90plus: piutangItems
        .filter((item) => item.hariTerlambat > 60)
        .reduce((sum, item) => sum + item.jumlah, 0),
    };

    // Calculate counts
    const counts = {
      totalPiutang: piutangItems.length,
      belumJatuhTempo: piutangItems.filter((item) => item.hariTerlambat <= 0).length,
      aging30Count: piutangItems.filter(
        (item) => item.hariTerlambat > 0 && item.hariTerlambat <= 30
      ).length,
      aging60Count: piutangItems.filter(
        (item) => item.hariTerlambat > 30 && item.hariTerlambat <= 60
      ).length,
      aging90plusCount: piutangItems.filter((item) => item.hariTerlambat > 60).length,
    };

    // Group by student for detailed report
    const studentGroups = filteredItems.reduce(
      (groups: Record<string, PiutangAgingItem[]>, item) => {
        const key = item.studentId;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(item);
        return groups;
      },
      {}
    );

    // Build student summary
    const studentSummary = Object.entries(studentGroups).map(([sid, items]) => ({
      studentId: sid,
      student: items[0].student,
      totalPiutang: items.reduce((sum, item) => sum + item.jumlah, 0),
      jumlahPiutang: items.length,
      piutangTerbesar: Math.max(...items.map((i) => i.jumlah)),
      agingTerparah: Math.max(...items.map((i) => i.hariTerlambat)),
    }));

    // Sort by total piutang (descending)
    studentSummary.sort((a, b) => b.totalPiutang - a.totalPiutang);

    return res.status(200).json({
      data: filteredItems,
      studentSummary,
      summary: {
        ...summary,
        ...counts,
      },
      formatted: {
        totalPiutang: formatCurrency(summary.totalPiutang),
        belumJatuhTempo: formatCurrency(summary.belumJatuhTempo),
        aging30: formatCurrency(summary.aging30),
        aging60: formatCurrency(summary.aging60),
        aging90plus: formatCurrency(summary.aging90plus),
      },
      filters: {
        studentId: studentId || null,
        kelas: kelas || null,
        aging: aging || null,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Piutang Report API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler, { requireAdmin: true });