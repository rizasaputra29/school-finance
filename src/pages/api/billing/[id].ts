import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid billing ID' });
  }

  try {
    switch (req.method) {
      case 'GET': {
        const billing = await prisma.billing.findUnique({
          where: { id },
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
        });

        if (!billing) {
          return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
        }

        return res.status(200).json(billing);
      }

      case 'PATCH': {
        const { statusBayar, jumlah, catatan } = req.body;

        // Get current billing for comparison
        const currentBilling = await prisma.billing.findUnique({
          where: { id },
          include: { student: true },
        });

        if (!currentBilling) {
          return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
        }

        const updateData: Record<string, unknown> = {};
        if (jumlah !== undefined) updateData.jumlah = parseFloat(jumlah);
        if (catatan !== undefined) updateData.catatan = catatan;

        // Handle payment status change
        if (statusBayar && statusBayar !== currentBilling.statusBayar) {
          updateData.statusBayar = statusBayar;

          if (statusBayar === 'Lunas') {
            updateData.tanggalBayar = new Date();

            // Create cashflow entry for income
            const cashflow = await prisma.cashflow.create({
              data: {
                tanggal: new Date(),
                keterangan: `Pembayaran ${currentBilling.jenisBiaya} - ${currentBilling.student.nama} (${currentBilling.student.nis}) - ${currentBilling.periodeBulan}`,
                kodeAkun: '4100', // Income account
                kategori: currentBilling.jenisBiaya,
                debit: currentBilling.jumlah,
                kredit: 0,
                referenceId: id,
              },
            });

            updateData.cashflowId = cashflow.id;

            // Update student payment totals
            await prisma.student.update({
              where: { id: currentBilling.studentId },
              data: {
                totalBayar: { increment: currentBilling.jumlah },
              },
            });

            // Check if all billings are paid for this student
            const unpaidBillings = await prisma.billing.count({
              where: {
                studentId: currentBilling.studentId,
                statusBayar: 'Belum Lunas',
                id: { not: id }, // Exclude current billing being paid
              },
            });

            if (unpaidBillings === 0) {
              await prisma.student.update({
                where: { id: currentBilling.studentId },
                data: { statusBayar: 'Lunas' },
              });
            }
          } else if (statusBayar === 'Belum Lunas' && currentBilling.statusBayar === 'Lunas') {
            // Reverting payment - remove cashflow entry
            if (currentBilling.cashflowId) {
              await prisma.cashflow.delete({
                where: { id: currentBilling.cashflowId },
              });
            }

            updateData.tanggalBayar = null;
            updateData.cashflowId = null;

            // Revert student payment totals
            await prisma.student.update({
              where: { id: currentBilling.studentId },
              data: {
                totalBayar: { decrement: currentBilling.jumlah },
                statusBayar: 'Belum Lunas',
              },
            });
          }
        }

        const billing = await prisma.billing.update({
          where: { id },
          data: updateData,
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
        });

        return res.status(200).json(billing);
      }

      case 'DELETE': {
        const billing = await prisma.billing.findUnique({
          where: { id },
        });

        if (!billing) {
          return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
        }

        // Update student totals
        await prisma.student.update({
          where: { id: billing.studentId },
          data: {
            totalTagihan: { decrement: billing.jumlah },
            ...(billing.statusBayar === 'Lunas' && {
              totalBayar: { decrement: billing.jumlah },
            }),
          },
        });

        // If billing was paid, delete associated cashflow (which cascades to delete Billing)
        // If not, delete billing directly
        if (billing.cashflowId) {
          try {
            await prisma.cashflow.delete({
              where: { id: billing.cashflowId },
            });
          } catch (e) {
             // If cashflow missing for some reason, try deleting billing directly
             await prisma.billing.delete({ where: { id } });
          }
        } else {
          await prisma.billing.delete({
            where: { id },
          });
        }

        return res.status(200).json({ message: 'Tagihan berhasil dihapus' });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Billing API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
