import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';

interface Reminder {
  id: string;
  type: 'hutang' | 'penyusutan' | 'piutang' | 'payroll';
  title: string;
  description: string;
  amount?: number;
  dueDate?: string;
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const reminders: Reminder[] = [];
    const today = new Date();
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get debts due within 30 days
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

    // Get assets due for depreciation
    const assets = await prisma.asset.findMany({
      where: { status: 'Active', isTanah: false },
    });

    for (const asset of assets) {
      const purchaseDate = new Date(asset.tanggalPerolehan);
      const monthsOwned = (today.getFullYear() - purchaseDate.getFullYear()) * 12 + 
                         (today.getMonth() - purchaseDate.getMonth());
      const depreciationPerMonth = (asset.hargaPerolehan - asset.nilaiResidu) / (asset.umurTeknis * 12);
      
      if (monthsOwned > 0 && monthsOwned < asset.umurTeknis * 12) {
        const nextDepreciationDate = new Date(purchaseDate);
        nextDepreciationDate.setMonth(nextDepreciationDate.getMonth() + monthsOwned + 1);
        
        if (nextDepreciationDate.getMonth() === today.getMonth()) {
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

    // Sort by due date
    reminders.sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    return NextResponse.json(reminders);
  });
}
