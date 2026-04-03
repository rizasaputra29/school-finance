import type { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

interface Reminder {
  id: string;
  type: 'hutang' | 'penyusutan' | 'piutang' | 'payroll';
  title: string;
  description: string;
  amount?: number;
  dueDate?: string;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const reminders: Reminder[] = [];
    const today = new Date();
    const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 1. Get debts due within 30 days
    const debts = await prisma.debt.findMany({
      where: {
        status: 'Aktif',
        tanggalJatuhTempo: {
          lte: in30Days,
          gte: today,
        },
      },
    });

    for (const debt of debts) {
      const isOverdue = debt.tanggalJatuhTempo < today;
      reminders.push({
        id: `debt-${debt.id}`,
        type: 'hutang',
        title: isOverdue ? 'Hutang Jatuh Tempo' : 'Hutang Akan Jatuh Tempo',
        description: debt.nama,
        amount: debt.jumlahSisa,
        dueDate: debt.tanggalJatuhTempo.toISOString(),
      });
    }

    // 2. Get assets due for depreciation this month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const assets = await prisma.asset.findMany({
      where: {
        status: 'Active',
        isTanah: false,
      },
    });

    for (const asset of assets) {
      const purchaseDate = new Date(asset.tanggalPerolehan);
      const monthsOwned = (today.getFullYear() - purchaseDate.getFullYear()) * 12 + (today.getMonth() - purchaseDate.getMonth());
      const depreciationPerMonth = (asset.hargaPerolehan - asset.nilaiResidu) / (asset.umurTeknis * 12);
      
      if (monthsOwned > 0 && monthsOwned < asset.umurTeknis * 12) {
        const nextDepreciationDate = new Date(purchaseDate);
        nextDepreciationDate.setMonth(nextDepreciationDate.getMonth() + monthsOwned + 1);
        
        if (nextDepreciationDate <= endOfMonth && nextDepreciationDate >= startOfMonth) {
          reminders.push({
            id: `depreciation-${asset.id}`,
            type: 'penyusutan',
            title: 'Penyusutan Aktiva',
            description: asset.nama,
            amount: depreciationPerMonth,
            dueDate: nextDepreciationDate.toISOString(),
          });
        }
      }
    }

    // 3. Get student bills due within 7 days
    const billingDue = await prisma.billing.findMany({
      where: {
        statusBayar: 'Belum Lunas',
      },
      include: {
        student: true,
      },
    });

    for (const billing of billingDue) {
      const dueDate = new Date(billing.periodeBulan + '-28');
      if (dueDate < in7Days && dueDate >= today) {
        reminders.push({
          id: `billing-${billing.id}`,
          type: 'piutang',
          title: 'Tagihan Siswa Akan Jatuh Tempo',
          description: `${billing.student.nama} - ${billing.jenisBiaya}`,
          amount: billing.jumlah,
          dueDate: dueDate.toISOString(),
        });
      } else if (dueDate < today) {
        reminders.push({
          id: `billing-${billing.id}`,
          type: 'piutang',
          title: 'Tagihan Siswa Overdue',
          description: `${billing.student.nama} - ${billing.jenisBiaya}`,
          amount: billing.jumlah,
          dueDate: dueDate.toISOString(),
        });
      }
    }

    // 4. Get unpaid payrolls
    const payrolls = await prisma.payroll.findMany({
      where: {
        status: 'Belum Bayar',
      },
      include: {
        employee: true,
      },
    });

    for (const payroll of payrolls) {
      const dueDate = new Date(payroll.periode + '-28');
      if (dueDate < in7Days) {
        reminders.push({
          id: `payroll-${payroll.id}`,
          type: 'payroll',
          title: 'Gaji Belum Dibayar',
          description: `${payroll.employee.nama} - ${payroll.jenisPembayaran}`,
          amount: payroll.jumlah,
          dueDate: dueDate.toISOString(),
        });
      }
    }

    // Sort by due date (overdue first)
    reminders.sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    return res.status(200).json(reminders);
  } catch (error) {
    console.error('Reminders API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
