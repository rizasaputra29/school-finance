import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

// Type for academic year from Prisma
interface AcademicYearRecord {
  id: string;
  tahunAjaran: string;
  tanggalMulai: Date;
  tanggalSelesai: Date;
  isActive: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Validation schemas
const createAcademicYearSchema = z.object({
  tahunAjaran: z.string().min(1, 'Tahun ajaran wajib diisi').max(20, 'Tahun ajaran maksimal 20 karakter'),
  tanggalMulai: z.string().or(z.date()).transform(val => new Date(val)),
  tanggalSelesai: z.string().or(z.date()).transform(val => new Date(val)),
});

const updateAcademicYearSchema = z.object({
  tahunAjaran: z.string().min(1).max(20).optional(),
  tanggalMulai: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  tanggalSelesai: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  isActive: z.boolean().optional(),
});

// Generate closing entries at year end
async function generateClosingEntries(academicYearId: string): Promise<void> {
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
  });

  if (!academicYear) {
    throw new Error('Academic year not found');
  }

  const revenueAccounts = await prisma.account.findMany({
    where: { tipeAkun: 'Revenue' },
  });

  const expenseAccounts = await prisma.account.findMany({
    where: { tipeAkun: 'Expense' },
  });

  let saldoBerjalanAccount = await prisma.account.findFirst({
    where: { kodeAkun: '3-000' },
  });

  if (!saldoBerjalanAccount) {
    saldoBerjalanAccount = await prisma.account.create({
      data: {
        kodeAkun: '3-000',
        namaAkun: 'Saldo Berjalan',
        tipeAkun: 'Equity',
        saldo: 0,
      },
    });
  }

  const closingDate = academicYear.tanggalSelesai;

  // Close Revenue accounts
  for (const revenueAccount of revenueAccounts) {
    if (revenueAccount.saldo > 0) {
      const entry = await prisma.journalEntry.create({
        data: {
          tanggal: closingDate,
          keterangan: `Penutupan Pendapatan - ${revenueAccount.namaAkun}`,
          reference: `closing:${academicYearId}`,
        },
      });

      await prisma.journalEntryLine.createMany({
        data: [
          { journalEntryId: entry.id, kodeAkun: revenueAccount.kodeAkun, debit: revenueAccount.saldo, kredit: 0 },
          { journalEntryId: entry.id, kodeAkun: saldoBerjalanAccount.kodeAkun, debit: 0, kredit: revenueAccount.saldo },
        ],
      });

      await prisma.account.update({
        where: { id: revenueAccount.id },
        data: { saldo: 0 },
      });
    }
  }

  // Close Expense accounts
  for (const expenseAccount of expenseAccounts) {
    if (expenseAccount.saldo > 0) {
      const entry = await prisma.journalEntry.create({
        data: {
          tanggal: closingDate,
          keterangan: `Penutupan Beban - ${expenseAccount.namaAkun}`,
          reference: `closing:${academicYearId}`,
        },
      });

      await prisma.journalEntryLine.createMany({
        data: [
          { journalEntryId: entry.id, kodeAkun: saldoBerjalanAccount.kodeAkun, debit: expenseAccount.saldo, kredit: 0 },
          { journalEntryId: entry.id, kodeAkun: expenseAccount.kodeAkun, debit: 0, kredit: expenseAccount.saldo },
        ],
      });

      await prisma.account.update({
        where: { id: expenseAccount.id },
        data: { saldo: 0 },
      });
    }
  }

  // Update Saldo Berjalan with net income
  const totalRevenue = revenueAccounts.reduce((sum, acc) => sum + acc.saldo, 0);
  const totalExpense = expenseAccounts.reduce((sum, acc) => sum + acc.saldo, 0);
  const netIncome = totalRevenue - totalExpense;

  await prisma.account.update({
    where: { id: saldoBerjalanAccount.id },
    data: { saldo: { increment: netIncome } },
  });
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  try {
    // Handle action-based POST requests
    if (req.method === 'POST' && req.query.action === 'close') {
      const { id } = req.query;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'ID tahun ajaran wajib diisi' });
      }

      const academicYear = await prisma.academicYear.findUnique({
        where: { id },
      });

      if (!academicYear) {
        return res.status(404).json({ error: 'Tahun ajaran tidak ditemukan' });
      }

      if (academicYear.isArchived) {
        return res.status(400).json({ error: 'Tahun ajaran sudah diarsipkan' });
      }

      await generateClosingEntries(id);

      const closedYear = await prisma.academicYear.update({
        where: { id },
        data: { isActive: false, isArchived: true },
      });

      return res.status(200).json({
        message: 'Tahun ajaran berhasil ditutup dengan jurnal penutup',
        data: closedYear,
      });
    }

    switch (req.method) {
      case 'GET': {
        const { includeArchived } = req.query;
        
        const where = includeArchived === 'true' 
          ? {} 
          : { isArchived: false };

        const academicYears = await prisma.academicYear.findMany({
          where,
          orderBy: { tahunAjaran: 'desc' },
        });

        const activeYear = academicYears.find((ay: AcademicYearRecord) => ay.isActive);

        return res.status(200).json({
          data: academicYears,
          activeYear: activeYear || null,
        });
      }

      case 'POST': {
        const validation = createAcademicYearSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: validation.error.issues,
          });
        }

        const { tahunAjaran, tanggalMulai, tanggalSelesai } = validation.data;

        if (tanggalSelesai <= tanggalMulai) {
          return res.status(400).json({
            error: 'Tanggal selesai harus setelah tanggal mulai',
          });
        }

        const existingYear = await prisma.academicYear.findUnique({
          where: { tahunAjaran },
        });

        if (existingYear) {
          return res.status(400).json({
            error: 'Tahun ajaran sudah ada',
          });
        }

        const currentActiveYear = await prisma.academicYear.findFirst({
          where: { isActive: true },
        });

        const result = await prisma.$transaction(async (tx) => {
          if (currentActiveYear) {
            // Archive students
            await tx.student.updateMany({
              where: { status: 'Active' },
              data: { status: 'Archived' },
            });

            // Mark current year as inactive/archived
            await tx.academicYear.update({
              where: { id: currentActiveYear.id },
              data: { isActive: false, isArchived: true },
            });

            // Generate closing entries
            const revenueAccounts = await tx.account.findMany({
              where: { tipeAkun: 'Revenue' },
            });

            const expenseAccounts = await tx.account.findMany({
              where: { tipeAkun: 'Expense' },
            });

            let saldoBerjalanAccount = await tx.account.findFirst({
              where: { kodeAkun: '3-000' },
            });

            if (!saldoBerjalanAccount) {
              saldoBerjalanAccount = await tx.account.create({
                data: {
                  kodeAkun: '3-000',
                  namaAkun: 'Saldo Berjalan',
                  tipeAkun: 'Equity',
                  saldo: 0,
                },
              });
            }

            const closingDate = currentActiveYear.tanggalSelesai;

            // Close Revenue accounts
            for (const revenueAccount of revenueAccounts) {
              if (revenueAccount.saldo > 0) {
                const entry = await tx.journalEntry.create({
                  data: {
                    tanggal: closingDate,
                    keterangan: `Penutupan Pendapatan - ${revenueAccount.namaAkun}`,
                    reference: `closing:${currentActiveYear.id}`,
                  },
                });

                await tx.journalEntryLine.createMany({
                  data: [
                    { journalEntryId: entry.id, kodeAkun: revenueAccount.kodeAkun, debit: revenueAccount.saldo, kredit: 0 },
                    { journalEntryId: entry.id, kodeAkun: saldoBerjalanAccount.kodeAkun, debit: 0, kredit: revenueAccount.saldo },
                  ],
                });

                await tx.account.update({
                  where: { id: revenueAccount.id },
                  data: { saldo: 0 },
                });
              }
            }

            // Close Expense accounts
            for (const expenseAccount of expenseAccounts) {
              if (expenseAccount.saldo > 0) {
                const entry = await tx.journalEntry.create({
                  data: {
                    tanggal: closingDate,
                    keterangan: `Penutupan Beban - ${expenseAccount.namaAkun}`,
                    reference: `closing:${currentActiveYear.id}`,
                  },
                });

                await tx.journalEntryLine.createMany({
                  data: [
                    { journalEntryId: entry.id, kodeAkun: saldoBerjalanAccount.kodeAkun, debit: expenseAccount.saldo, kredit: 0 },
                    { journalEntryId: entry.id, kodeAkun: expenseAccount.kodeAkun, debit: 0, kredit: expenseAccount.saldo },
                  ],
                });

                await tx.account.update({
                  where: { id: expenseAccount.id },
                  data: { saldo: 0 },
                });
              }
            }
          }

          // Create new academic year (automatically active)
          const newAcademicYear = await tx.academicYear.create({
            data: {
              tahunAjaran,
              tanggalMulai,
              tanggalSelesai,
              isActive: true,
              isArchived: false,
            },
          });

          return newAcademicYear;
        });

        return res.status(201).json({
          message: 'Tahun ajaran berhasil dibuat dan设为 aktif',
          data: result,
        });
      }

      case 'PUT': {
        const { id } = req.query;

        if (!id || typeof id !== 'string') {
          return res.status(400).json({ error: 'ID tahun ajaran wajib diisi' });
        }

        const validation = updateAcademicYearSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: validation.error.issues,
          });
        }

        const { isActive } = validation.data;

        if (isActive === true) {
          await prisma.academicYear.updateMany({
            where: { isActive: true },
            data: { isActive: false },
          });
        }

        const updatedYear = await prisma.academicYear.update({
          where: { id },
          data: validation.data,
        });

        return res.status(200).json(updatedYear);
      }

      case 'DELETE': {
        const { id } = req.query;

        if (!id || typeof id !== 'string') {
          return res.status(400).json({ error: 'ID tahun ajaran wajib diisi' });
        }

        const archivedYear = await prisma.academicYear.update({
          where: { id },
          data: { isArchived: true, isActive: false },
        });

        return res.status(200).json({
          message: 'Tahun ajaran berhasil diarsipkan',
          data: archivedYear,
        });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Academic Year API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);